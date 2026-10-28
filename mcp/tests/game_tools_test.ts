import {
  GAME_RESOURCE,
  registerGameTools,
} from "../../supabase/functions/game-mcp/game-tools.ts";
import { GAME_HTML } from "../../supabase/functions/game-mcp/resource-game.generated.ts";
const assert = (v: unknown, m: string) => {
  if (!v) throw new Error(m);
};
const owner = "11111111-1111-4111-8111-111111111111",
  master = "89cf977d-ecc0-4dbb-8f4f-fe6b9d7067c5",
  playerId = "22222222-2222-4222-8222-222222222222";
function fixture(
  { locked = false, level = 1, pending = false, foreign = false } = {},
) {
  const started = new Date().toISOString();
  const player = {
    id: playerId,
    user_id: owner,
    master,
    level,
    skill_1_start: started,
    skill_2_start: started,
    skill_3_start: started,
    level_2_accepted_at: pending ? null : started,
    level_3_accepted_at: pending ? null : started,
  };
  const calls: { name: string; args: any }[] = [];
  const profile = { id: owner, username: "Player", master };
  const data: Record<string, any[]> = {
    player: [player],
    profiles: [profile, {
      id: master,
      username: "Master",
      lore: "Public story",
    }],
    game: [{
      id: "game",
      user_id: master,
      skill_0: "s0",
      skill_1: "s1",
      skill_2: "s2",
      skill_3: "s3",
      skill_4: "s4",
    }],
    skills: [0, 1, 2, 3, 4].map((n) => ({ id: `s${n}`, label: `Skill ${n}` })),
    notifications: [{ id: "quest", stage: "linked_master", enabled: true }],
    user_notifications: [],
  };
  const client = {
    async rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === "list_public_masters") {
        return { data: [{ id: master, username: "Master" }], error: null };
      }
      if (name === "get_practice_completion_totals") {
        return { data: 123, error: null };
      }
      if (name === "record_notification_events") {
        return { data: null, error: null };
      }
      if (name === "sync_skill_progress") {
        return {
          data: locked
            ? { account_locked: true }
            : { player, years_burned: 1, completed_passive_seconds: 123 },
          error: null,
        };
      }
      if (name === "accept_player_quest") {
        return { data: { player }, error: null };
      }
      throw new Error("Unexpected RPC " + name);
    },
    from(table: string) {
      let single = false;
      const filters: Record<string, unknown> = {};
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return q;
        },
        in: () => q,
        order: () => q,
        limit: () => q,
        range: () => q,
        maybeSingle: () => {
          single = true;
          return q;
        },
        then(resolve: any) {
          calls.push({ name: table, args: filters });
          let rows = (data[table] || []).filter((r) =>
            Object.entries(filters).every(([key, value]) => r[key] === value)
          );
          if (table === "player") {
            assert(
              filters.user_id === owner,
              "Participation lookup must be owner-scoped",
            );
            if (foreign) rows = [];
          }
          return Promise.resolve(
            resolve({ data: single ? rows[0] || null : rows, error: null }),
          );
        },
      };
      return q;
    },
  };
  const tools = new Map<
    string,
    { config: any; run: (args: any) => Promise<any> }
  >();
  registerGameTools(
    {
      registerTool: (name: string, config: any, run: any) =>
        tools.set(name, { config, run }),
    } as any,
    {
      client: client as any,
      userId: owner,
      profile,
      user: { id: owner, created_at: started } as any,
      withProfileImageUrls: async () => ({
        avatar_url: "https://example.test/avatar",
      }),
    },
  );
  return {
    tools,
    calls,
    started,
    call: (name: string, args = {}) => tools.get(name)!.run(args),
  };
}
Deno.test("game snapshot and full view share authoritative data and presentation", async () => {
  const f = fixture();
  const data = (await f.call("show_game")).structuredContent;
  assert(
    data.kind === "game_state" && data.profile.id === owner &&
      data.players[0].id === playerId,
    "Wrong game snapshot",
  );
  assert(
    data.master.username === "Master" && data.skills.length === 5 &&
      data.completed_passive_seconds === 123,
    "Missing shared game data",
  );
  assert(
    f.tools.get("show_game")!.config._meta.ui.resourceUri === GAME_RESOURCE,
    "Missing full game resource",
  );
  assert(
    GAME_HTML.includes('class="game-shell"') &&
      GAME_HTML.includes("Rajdhani") && GAME_HTML.includes("Share Tech Mono") &&
      GAME_HTML.includes("data:font/ttf;base64,") &&
      !GAME_HTML.includes("font-family:Arial"),
    "Full game must preserve the site's shell and embedded fonts",
  );
  assert(
    !f.calls.some((c) => c.name === "sync_skill_progress"),
    "Read state must not mutate progression",
  );
});
Deno.test("practice saves use owner and quest clock checks; measuring tool stays app-only", async () => {
  const f = fixture();
  const args = {
    player_id: playerId,
    skill_number: 1,
    practice_seconds: 12,
    started_at: f.started,
  };
  const saved = await f.call("save_practice", args);
  assert(
    saved.structuredContent.player.id === playerId,
    "Practice save failed",
  );
  const rpc = f.calls.find((c) => c.name === "sync_skill_progress")!;
  assert(
    rpc.args.p_practice_seconds === 12 && rpc.args.p_started_at === f.started,
    "Save must use the measured absolute counter and original clock",
  );
  assert(
    f.tools.get("save_practice")!.config._meta.ui.visibility.join() === "app",
    "Model must not fabricate practice duration",
  );
  assert(
    (await f.call("save_practice", {
      ...args,
      started_at: "2000-01-01T00:00:00Z",
    })).isError,
    "Old quest clock accepted",
  );
  assert(
    (await fixture({ foreign: true }).call("sync_game_progress", {
      player_id: playerId,
    })).isError,
    "Foreign participation accepted",
  );
  assert(
    (await fixture({ locked: true }).call("sync_game_progress", {
      player_id: playerId,
    })).isError,
    "Locked account accepted",
  );
  const waiting = fixture({ level: 2, pending: true });
  assert(
    (await waiting.call("save_practice", {
      ...args,
      skill_number: 2,
      started_at: waiting.started,
    })).isError,
    "Unaccepted quest accepted practice",
  );
  assert(
    (await f.call("save_practice", { ...args, skill_number: 2 })).isError,
    "Locked ability accepted practice",
  );
});
Deno.test("quest acceptance and notification changes reuse existing RPCs", async () => {
  const f = fixture({ level: 2, pending: true });
  await f.call("accept_quest", { player_id: playerId, level: 2 });
  await f.call("record_game_notifications", {
    events: [{ notification_id: "quest", occurrence: "once", action: "read" }],
  });
  assert(
    f.calls.some((c) =>
      c.name === "accept_player_quest" && c.args.p_level === 2
    ),
    "Quest acceptance bypassed existing rules",
  );
  assert(
    f.calls.some((c) => c.name === "record_notification_events"),
    "Notifications bypassed catalog validation",
  );
  assert(
    !f.tools.get("accept_quest")!.config.annotations.readOnlyHint,
    "Acceptance must be a write",
  );
});
