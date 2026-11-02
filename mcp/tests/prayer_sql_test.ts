// Isolated PostgreSQL/WASM contract test. No Supabase credentials or network
// calls. Bootstrap only the affected tables and real policies/access functions;
// Auth/Storage, cron and outbound email infrastructure are outside this fixture.
import { PGlite } from "npm:@electric-sql/pglite@0.5.8";

Deno.test("prayer migration and SQL access/compatibility tests pass in isolated PostgreSQL", async () => {
  const db = new PGlite();
  try {
    const schema = await Deno.readTextFile(
      new URL("../../supabase/schema.sql", import.meta.url),
    );
    const table = (name: string) => {
      const match = schema.match(
        new RegExp(`create table public\\."${name}" \\([\\s\\S]*?\\n\\);`),
      );
      if (!match) throw new Error(`Missing table ${name}`);
      return match[0];
    };
    const fn = (name: string) => {
      const start = schema.indexOf(
        `CREATE OR REPLACE FUNCTION private.${name}(`,
      );
      const end = schema.indexOf("$function$;", start);
      if (start < 0 || end < 0) throw new Error(`Missing function ${name}`);
      return schema.slice(start, end + "$function$;".length);
    };
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key, created_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant usage on schema private to authenticated;
      ${table("profiles")} ${table("player")} ${table("prayers")}
      alter table public.profiles add primary key(id);
      alter table public.player add primary key(id);
      alter table public.prayers add primary key(id);
      ${fn("quest_deadline")} ${fn("account_has_access")}
      revoke all on function private.account_has_access() from public;
      grant execute on function private.account_has_access() to authenticated;
      grant select,insert,update,delete on public.profiles,public.player,public.prayers to anon,authenticated;
      alter table public.profiles enable row level security;
      alter table public.player enable row level security;
      alter table public.prayers enable row level security;
    `);
    const policies = schema.match(/create policy\s[\s\S]*?;/gi) ?? [];
    for (const policy of policies) {
      if (
        /on\s+"public"\."(profiles|player|prayers)"/.test(policy) ||
        policy.startsWith('create policy "Prayer account ownership"')
      ) {
        await db.exec(policy);
      }
    }
    // Existing website submissions must survive the additive migration untouched.
    await db.exec(
      "insert into public.prayers(username,problem,prayer) values('Existing guest','Existing problem','Existing prayer')",
    );
    const migration = await Deno.readTextFile(
      new URL(
        "../../supabase/migrations/20261102090712_prayer_tree.sql",
        import.meta.url,
      ),
    );
    const body = migration.slice(
      migration.indexOf("alter table public.prayers"),
      migration.lastIndexOf("commit;"),
    ).trim();
    if (!schema.includes(body)) {
      throw new Error("Schema snapshot differs from prayer migration");
    }
    await db.exec(migration);
    const existing = await db.query<
      { process: string; tree: unknown; problem: string }
    >("select process,tree,problem from public.prayers where username='Existing guest'");
    if (
      existing.rows[0]?.process !== "basic-v1" ||
      existing.rows[0]?.tree !== null ||
      existing.rows[0]?.problem !== "Existing problem"
    ) {
      throw new Error("Migration changed a legacy prayer");
    }
    const permissions = await db.query<
      { invoker: boolean; authenticated: boolean; anonymous: boolean }
    >(`select
      not prosecdef as invoker,
      has_function_privilege('authenticated',oid,'execute') as authenticated,
      has_function_privilege('anon',oid,'execute') as anonymous
      from pg_proc where oid='public.submit_prayer(uuid,uuid,jsonb)'::regprocedure`);
    if (
      !permissions.rows[0]?.invoker || !permissions.rows[0]?.authenticated ||
      permissions.rows[0]?.anonymous
    ) {
      throw new Error("Prayer RPC execution privileges changed");
    }
    await db.exec(
      await Deno.readTextFile(
        new URL("../../supabase/tests/prayer_tree.sql", import.meta.url),
      ),
    );
  } finally {
    await db.close();
  }
});
