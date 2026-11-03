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
      ${table("profiles")} ${table("player")} ${table("prayers")} ${
      table("notifications")
    }
      create table public.first_prayer_emails(user_id uuid unique,prayer_id uuid,payload jsonb);
      create function private.dispatch_first_prayer_emails() returns void language plpgsql as $$ begin return; end; $$;
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
    const restriction = await Deno.readTextFile(
      new URL(
        "../../supabase/migrations/20261103004202_cedric_technomancy.sql",
        import.meta.url,
      ),
    );
    if (
      !schema.includes(
        restriction.slice(
          restriction.indexOf("-- Canonical production"),
          restriction.lastIndexOf("commit;"),
        ).trim(),
      )
    ) throw new Error("Schema differs from Technomancy restriction");
    await db.exec(restriction);
    await db.exec(`insert into public.notifications(id,stage,position,title,tone,dismissible,enabled,content) values('prayer_learned.v1','account',10,'Unlocked','unlocked',true,true,'{"text":"Old prayer notice"}')`);
    await db.exec(
      await Deno.readTextFile(
        new URL(
          "../../supabase/migrations/20261103010623_unified_prayer_tree.sql",
          import.meta.url,
        ),
      ),
    );
    // The new website submits the same two texts directly into tree.
    await db.exec(
      `insert into public.prayers(username,tree) values('Tree guest','{"binah":{"title":"Problem","description":"A concern"},"chokmah":{"title":"Prayer","description":"An intention"}}')`,
    );
    const existing = await db.query<
      { process: string; tree: any }
    >("select process,tree from public.prayers where username='Existing guest'");
    if (
      existing.rows[0]?.process !== "basic-v1" ||
      existing.rows[0]?.tree.binah.description !== "Existing problem" ||
      existing.rows[0]?.tree.chokmah.description !== "Existing prayer"
    ) {
      throw new Error("Migration changed a legacy prayer");
    }
    const retired = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='prayers' and column_name in ('problem','prayer')");
    if (retired.rows.length) throw new Error("Redundant prayer columns remain");
    const notice = await db.query<{stage:string;dismissible:boolean;content:any}>("select stage,dismissible,content from public.notifications where id='prayer_learned.v1'");
    if (notice.rows[0]?.stage!=='account' || !notice.rows[0]?.dismissible || notice.rows[0]?.content.text.length!==2 || !notice.rows[0]?.content.text[0].includes('1,000,000') || notice.rows[0]?.content.text[1]!=='Connect with a Master below and use your first skill to burn Karma faster.') throw new Error("Notice text or original behavior changed");
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
