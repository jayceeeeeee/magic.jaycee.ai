import {
  prayerRecord,
  prayerTreeSchema,
  registerPrayerTools,
} from "../../supabase/functions/game-mcp/prayer-tools.ts";
import {
  PRAYER_GUIDE,
  SEFIROT,
} from "../../supabase/functions/game-mcp/prayer-guide.ts";

const assert = (v: unknown, message: string) => {
  if (!v) throw new Error(message);
};
const owner = "11111111-1111-4111-8111-111111111111";
const master = "22222222-2222-4222-8222-222222222222";
const player = "33333333-3333-4333-8333-333333333333";
const prayer = "44444444-4444-4444-8444-444444444444";
const tree = Object.fromEntries(
  SEFIROT.map((key) => [key, { title: key, description: `My ${key} words` }]),
);
function fixture(
  {
    locked = false,
    unlinked = false,
    foreign = false,
    failed = false,
    level = 1,
  } = {},
) {
  const calls: { name: string; args: any }[] = [];
  const tools = new Map<
    string,
    { config: any; run: (args: any) => Promise<any> }
  >();
  registerPrayerTools(
    {
      registerTool: (name: string, config: any, run: any) =>
        tools.set(name, { config, run }),
    } as any,
    {
      userId: owner,
      client: {
        async rpc(name: string, args: any) {
          calls.push({ name, args });
          if (name === "check_account_access") {
            return {
              data: { locked },
              error: null,
            };
          }
          assert(
            name === "submit_prayer",
            "No practice or unrelated RPC permitted",
          );
          return failed ? { data: null, error: { message: "timeout" } } : {
            data: {
              id: args.p_prayer_id,
              tree: args.p_tree,
              process: "tree-v1",
              user_id: owner,
              player_id: args.p_player_id,
              master_id: master,
              problem: tree.binah.description,
              prayer: tree.chokmah.description,
            },
            error: null,
          };
        },
        from(name: string) {
          const filters: Record<string, string> = {};
          const q: any = {
            select: () => q,
            eq: (key: string, value: string) => {
              filters[key] = value;
              return q;
            },
            maybeSingle: async () => {
              calls.push({ name, args: filters });
              if (name === "profiles") {
                assert(filters.id === owner, "Profile must be owner scoped");
                return {
                  data: { id: owner, master: unlinked ? null : master },
                  error: null,
                };
              }
              assert(
                name === "player" && filters.user_id === owner &&
                  filters.master === master,
                "Participation must be owner and active Master scoped",
              );
              return {
                data: foreign ? null : { id: player, master, level },
                error: null,
              };
            },
          };
          return q;
        },
      } as any,
    },
  );
  return {
    calls,
    tools,
    call: (name: string, args = {}) => tools.get(name)!.run(args),
  };
}

Deno.test("prayer guide is available for every Master from Level 1, without persisting a draft", async () => {
  for (const level of [1, 2, 3, 4]) {
    const f = fixture({ level });
    const data = (await f.call("get_prayer_guide")).structuredContent;
    assert(
      data.guide === PRAYER_GUIDE && data.player_id === player &&
        data.master_id === master && data.level === level,
      "Missing verified prayer context",
    );
    assert(
      /^[0-9a-f-]{36}$/.test(data.prayer_id) && data.sefirot.length === 9,
      "Missing retry ID or map",
    );
    assert(
      f.calls.every((c) => c.name !== "submit_prayer"),
      "Guide must not save a draft",
    );
    assert(
      f.tools.get("get_prayer_guide")!.config.annotations.readOnlyHint,
      "Guide is a read tool",
    );
  }
  for (
    const options of [{ locked: true }, { unlinked: true }, { foreign: true }]
  ) {
    const r = await fixture(options).call("get_prayer_guide");
    assert(r.isError, "Unavailable participation must fail");
  }
});

Deno.test("prayer requires approval, nine strict entries and bounded title/description strings", async () => {
  const f = fixture();
  const base = { prayer_id: prayer, player_id: player, tree, confirmed: true };
  const invalid = [
    { ...base, confirmed: false },
    { ...base, confirmed: undefined },
    { ...base, tree: { ...tree, yesod: undefined } },
    { ...base, tree: { ...tree, malkuth: tree.yesod } },
    { ...base, tree: { ...tree, kether: { title: "   ", description: "ok" } } },
    {
      ...base,
      tree: { ...tree, kether: { title: "x".repeat(161), description: "ok" } },
    },
    {
      ...base,
      tree: {
        ...tree,
        kether: { title: "ok", description: "x".repeat(12001) },
      },
    },
    { ...base, user_id: "someone-else" },
  ];
  for (const args of invalid) {
    assert(
      (await f.call("submit_prayer", args)).isError,
      "Invalid payload was saved",
    );
  }
  assert(f.calls.length === 0, "Invalid payload must never reach database");
  assert(prayerTreeSchema.safeParse(tree).success, "Valid tree rejected");
});

Deno.test("approved prayer uses user RPC and stable retry ID, without practice credits or Master messages", async () => {
  const f = fixture();
  const args = { prayer_id: prayer, player_id: player, tree, confirmed: true };
  for (let i = 0; i < 2; i++) {
    const r = await f.call("submit_prayer", args);
    assert(
      !r.isError && r.structuredContent.prayer.id === prayer &&
        r.structuredContent.practice_recorded === false &&
        r.structuredContent.master_message_sent === false,
      "Incorrect save result",
    );
  }
  assert(
    f.calls.length === 2 &&
      f.calls.every((c) =>
        c.name === "submit_prayer" && c.args.p_prayer_id === prayer &&
        c.args.p_player_id === player && !("user_id" in c.args)
      ),
    "RPC must bind identity in database and reuse ID",
  );
  assert(
    f.tools.get("submit_prayer")!.config.annotations.idempotentHint &&
      !f.tools.get("submit_prayer")!.config.annotations.readOnlyHint,
    "Incorrect write annotations",
  );
  const failed = await fixture({ failed: true }).call("submit_prayer", args);
  assert(
    failed.isError && !failed.structuredContent &&
      failed.content[0].text.includes("same prayer_id"),
    "Uncertain save must not claim success or use a new ID",
  );
});

Deno.test("legacy prayer records retain their actual two fields without inventing a tree", () => {
  const legacy = prayerRecord({
    id: prayer,
    problem: "Pain and sadness",
    prayer: "I seek ease",
    tree: null,
  });
  assert(
    legacy.process === "basic-v1" &&
      legacy.tree.binah.description === legacy.problem &&
      legacy.tree.chokmah.description === legacy.prayer &&
      legacy.tree.binah.title === null && !legacy.tree.kether,
    "Legacy mapping must not invent missing content",
  );
  assert(
    prayerRecord({ tree, process: "tree-v1" }).tree === tree,
    "Complete trees must retain all entries",
  );
});
