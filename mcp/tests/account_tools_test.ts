import { ACCOUNT_RESOURCE, registerAccountTools } from "../../supabase/functions/game-mcp/account-tools.ts";
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
function fixture(level = 1, permanent = false) {
  const profile: any = { id: "owner", username: "Player", master: "master", permanent_account_at: permanent ? "2026-01-01" : null };
  const skills = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, label: `Skill ${i}`, description: "" }));
  const game = Object.fromEntries([ ["user_id", "owner"], ...skills.map((s, i) => [`skill_${i}`, s.id]) ]);
  const calls: any[] = [];
  const rows: any = { profiles: [profile, { id: "master", username: "Master" }], player: [{ id: "player", user_id: "owner", level }], game: [game], skills };
  const client = {
    from(table: string) {
      const filters: any = {};
      let patch: any, single = false;
      const q: any = {
        select: () => q, eq: (key: string, value: any) => { filters[key] = value; return q; },
        in: () => q, order: () => q, limit: () => q,
        maybeSingle: () => { single = true; return q; },
        update: (value: any) => { patch = value; return q; },
        then(resolve: any) {
          if (table === "player" || table === "game") assert(filters.user_id === "owner", "Account data must be owner-scoped");
          if (patch) {
            assert(table === "profiles" && filters.id === "owner", "Writes must target the authenticated owner");
            calls.push({ table, patch }); Object.assign(profile, patch);
          }
          const selected = rows[table].filter((row: any) => Object.entries(filters).every(([key, value]) => row[key] === value));
          resolve({ data: single ? selected[0] || null : selected, error: null });
        },
      };
      return q;
    },
    rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === "save_own_game") args.p_skills.forEach((s: any, i: number) => Object.assign(skills[i], s));
      return Promise.resolve({ data: name === "check_account_access" ? { locked: false } : game, error: null });
    },
    storage: { from: (bucket: string) => ({
      createSignedUploadUrl: (path: string) => { assert(bucket === "users" && path.startsWith("owner/avatar-"), "Uploads must use the owner's folder"); calls.push({ path }); return Promise.resolve({ data: { signedUrl: `https://storage.test/${path}` }, error: null }); },
      info: (path: string) => { calls.push({ info: path }); return Promise.resolve({ data: { size: 1024, contentType: "image/png" }, error: null }); },
    }) },
  };
  const handlers: any = {}, configs: any = {};
  const server = { registerTool(name: string, config: any, handler: any) { configs[name] = config; handlers[name] = handler; } };
  registerAccountTools(server as any, { client: client as any, userId: "owner", withProfileImageUrls: async (p) => ({ ...p, avatar_url: "https://storage.test/avatar.png" }) });
  return { handlers, configs, profile, skills, calls };
}
Deno.test("Account state and patches reuse owner data without modifying protected fields", async () => {
  const f = fixture(2);
  const shown = await f.handlers.show_account({});
  assert(shown.structuredContent.access.map && !shown.structuredContent.access.skills, "Wrong level unlocks");
  assert(f.configs.show_account._meta.ui.resourceUri === ACCOUNT_RESOURCE, "Account needs its own resource");
  const saved = await f.handlers.update_account_profile({ updates: { username: "New name", birth_date: "2000-02-29", birth_time: "10:15", manna_cycle: "day", manna_target: 200 } });
  assert(!saved.isError && f.profile.username === "New name" && f.profile.master === "master", "Profile save failed");
  const denied = await f.handlers.update_account_profile({ updates: { master: "attacker", permanent_account_at: "now" } });
  assert(denied.isError && f.profile.master === "master", "Protected fields accepted");
  const date = await f.handlers.update_account_profile({ updates: { birth_date: "2000-02-30" } });
  assert(date.isError, "Impossible birth date accepted");
});
Deno.test("Account server enforces Map, lore, skills, Ultimate and visibility unlocks", async () => {
  const low = fixture(1);
  for (const updates of [{ manna_target: 20 }, { lore: "Story" }, { visibility: true }]) assert((await low.handlers.update_account_profile({ updates })).isError, "Locked field accepted");
  assert((await low.handlers.save_account_skills({ skills: low.skills.map(({ label, description }) => ({ label, description })) })).isError, "Skills unlocked too early");
  const f = fixture(3);
  const values = f.skills.map(({ label, description }) => ({ label, description }));
  values[0].label = "New passive";
  assert(!(await f.handlers.save_account_skills({ skills: values })).isError && f.skills[0].label === "New passive", "Own skills not saved");
  values[4].label = "Changed Ultimate";
  assert((await f.handlers.save_account_skills({ skills: values })).isError, "Locked Ultimate accepted");
  const permanent = fixture(1, true);
  assert((await permanent.handlers.get_account_state({})).structuredContent.access.ultimate, "Permanent unlock lost");
});
Deno.test("Account publication requires a username and all five named skills", async () => {
  const f = fixture(4);
  f.skills[4].label = "";
  assert((await f.handlers.update_account_profile({ updates: { visibility: true } })).isError, "Incomplete game published");
  f.skills[4].label = "Ultimate";
  assert(!(await f.handlers.update_account_profile({ updates: { visibility: true } })).isError, "Valid publication rejected");
  assert(!(await f.handlers.update_account_profile({ updates: { visibility: false } })).isError, "Could not make account private");
});
Deno.test("Account avatar uploads are app-only, bounded and confined to the owner", async () => {
  const f = fixture();
  assert(f.configs.prepare_account_avatar_upload._meta.ui.visibility[0] === "app", "Upload URL must stay in app");
  assert((await f.handlers.prepare_account_avatar_upload({ content_type: "text/html", size: 12 })).isError, "Unsupported upload accepted");
  assert((await f.handlers.prepare_account_avatar_upload({ content_type: "image/png", size: 6000000 })).isError, "Oversized upload accepted");
  const upload = await f.handlers.prepare_account_avatar_upload({ content_type: "image/png", size: 1024 });
  assert(upload.structuredContent.upload_url.includes("/owner/avatar-"), "Wrong upload target");
  const saved = await f.handlers.update_account_profile({ updates: { avatar_path: upload.structuredContent.avatar_path } });
  assert(!saved.isError && f.calls.some((c) => c.info === `owner/${f.profile.avatar_path}`), "Uploaded photo was not verified");
  assert((await f.handlers.update_account_profile({ updates: { avatar_path: "../other/photo.png" } })).isError, "Foreign path accepted");
});
