import {
  MASTER_PICKER_RESOURCE,
  registerMasterTools,
} from "../../supabase/functions/game-mcp/master-tools.ts";
import { DEV_MASTER_ACCOUNT_IDS } from "../../supabase/functions/game-mcp/master-catalog.js";
import { MASTER_PICKER_HTML } from "../../supabase/functions/game-mcp/resource-master-picker.generated.ts";
import { GAME_RULES } from "../../supabase/functions/game-mcp/game-rules.ts";

const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const masterId = DEV_MASTER_ACCOUNT_IDS["d70b5c69-daae-4a77-9955-4385439ae292"];
const lockedId = DEV_MASTER_ACCOUNT_IDS["7abd58ec-1289-403d-932c-dc2df233d079"];
const referrerId = "11111111-1111-4111-8111-111111111111";

function fixture(
  {
    linked = false,
    expired = false,
    denied = false,
    failWrite = false,
    referrer = false,
  } = {},
) {
  const profile: Record<string, any> = {
    id: "owner",
    master: linked ? masterId : null,
    referrer_id: referrer ? referrerId : null,
  };
  const calls: { name: string; args?: any }[] = [];
  let writes = 0;
  let linkedMaster = profile.master;
  const game = {
    id: "game",
    user_id: masterId,
    skill_0: "s0",
    skill_1: "s1",
    skill_2: "s2",
    skill_3: "s3",
    skill_4: "s4",
  };
  const player = () => ({
    id: "player",
    master: linkedMaster,
    level: 1,
    skill_1_start: "2026-10-28T00:00:00Z",
  });
  const client = {
    async rpc(name: string, args: any) {
      calls.push({ name, args });
      if (name === "list_public_masters") {
        return {
          data: [
            { id: masterId, username: "Master", avatar_path: "avatar.png" },
            { id: lockedId, username: "Locked Master" },
            { id: "owner", username: "Self" },
            { id: "unlisted", username: "Other public Master" },
          ],
          error: null,
        };
      }
      if (name === "get_public_referrer") {
        return {
          data: [{ id: referrerId, username: "Referrer" }],
          error: null,
        };
      }
      if (name === "check_account_access") {
        return { data: { locked: denied || expired }, error: null };
      }
      if (name === "switch_player_master") {
        assert(
          args.p_master_id === masterId || args.p_master_id === referrerId,
          "Unexpected Master write",
        );
        if (failWrite) {
          return { data: null, error: { message: "private SQL diagnostic" } };
        }
        linkedMaster = args.p_master_id;
        writes++;
        return { data: player(), error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    from(table: string) {
      const filters: Record<string, any> = {};
      let columns = "";
      const query = {
        select(value: string) {
          columns = value;
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        in(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle() {
          return query;
        },
        then(resolve: (value: any) => unknown) {
          calls.push({ name: table, args: { filters, columns } });
          if (table === "player") {
            assert(
              filters.user_id === "owner",
              "Player lookup must use the authenticated owner",
            );
            return Promise.resolve(
              resolve({
                data: linkedMaster
                  ? (filters.master ? player() : [player()])
                  : [],
                error: null,
              }),
            );
          }
          if (table === "profiles") {
            assert(
              filters.id === "owner" || filters.id === masterId ||
                filters.id === referrerId,
              "Unexpected profile lookup",
            );
            return Promise.resolve(
              resolve({
                data: filters.id === "owner"
                  ? { ...profile, master: linkedMaster }
                  : { id: filters.id, lore: "Public story" },
                error: null,
              }),
            );
          }
          if (table === "game") {
            return Promise.resolve(resolve({ data: game, error: null }));
          }
          if (table === "skills") {
            assert(
              columns === "id,label,description",
              "Do not expose private skill fields",
            );
            return Promise.resolve(
              resolve({
                data: [{
                  id: "s0",
                  label: "Passive",
                  description: "Public description",
                }],
                error: null,
              }),
            );
          }
          throw new Error(`Unexpected table ${table}`);
        },
      };
      return query;
    },
  };
  const tools = new Map<
    string,
    { config: any; callback: (args: any) => Promise<any> }
  >();
  const server = {
    registerTool(name: string, config: any, callback: any) {
      tools.set(name, { config, callback });
    },
  };
  registerMasterTools(server as any, {
    client: client as any,
    userId: "owner",
    profile,
    user: {
      created_at: new Date(Date.now() - (expired ? 40 * 86400 * 1000 : 1000))
        .toISOString(),
    } as any,
    withProfileImageUrls: async () => ({
      avatar_url: "https://example.test/signed-avatar",
    }),
  });
  return {
    tools,
    calls,
    writes: () => writes,
    call: (name: string, args = {}) => tools.get(name)!.callback(args),
  };
}

Deno.test("onboarding exposes existing deadline, shared card policy and public details", async () => {
  const f = fixture({ referrer: true });
  const state = (await f.call("get_onboarding_state")).structuredContent;
  assert(
    state.requires_master_selection && state.next_tool === "show_master_picker",
    "Empty account must choose a Master",
  );
  assert(
    Math.abs(
      Date.parse(state.selection_deadline) - Date.now() -
        GAME_RULES.skills[1].cycleSeconds * 1000,
    ) < 2000,
    "Selection deadline must use the existing Moon cycle",
  );
  const picker = (await f.call("show_master_picker")).structuredContent;
  assert(
    picker.masters.length === 3 &&
      picker.masters.some((row: any) => row.id === referrerId),
    "Referrer and featured cards must be preserved",
  );
  assert(
    picker.masters.find((row: any) => row.id === lockedId).linkLocked,
    "Locked featured Master must stay locked",
  );
  assert(
    picker.masters.find((row: any) => row.id === lockedId).selectable ===
        false &&
      picker.masters.find((row: any) => row.id === masterId).selectable ===
        true,
    "The model must distinguish displayed cards from available choices",
  );
  assert(
    picker.locked_preview_masters.length === 5 &&
      picker.locked_preview_masters.some((row: any) =>
        row.username === "Muhammad"
      ) &&
      picker.locked_preview_masters.some((row: any) =>
        row.username === "Moses"
      ) &&
      picker.locked_preview_masters.every((row: any) =>
        row.selectable === false &&
        row.status === "locked" && row.source === "preview_only" && !row.id
      ),
    "The model must see all five UI preview characters as locked, without database IDs",
  );
  assert(
    !JSON.stringify(picker).includes("avatar_path"),
    "Return usable images instead of storage paths",
  );
  const details = (await f.call("get_master_details", { master_id: masterId }))
    .structuredContent;
  assert(
    details.lore === "Public story" && details.skills[0].label === "Passive",
    "Preview missing public content",
  );
  for (const id of [lockedId, "unlisted", "owner"]) {
    assert(
      (await f.call("get_master_details", { master_id: id })).isError,
      "Unavailable details must be refused",
    );
    assert(
      (await f.call("select_master", { master_id: id })).isError,
      "Unavailable selections must be refused",
    );
  }
  assert(f.writes() === 0, "Previews must never start a quest");
});
Deno.test("selection uses the existing RPC, is retry-safe and cannot change a linked Master", async () => {
  const f = fixture();
  assert(
    f.tools.get("show_master_picker")!.config._meta.ui.resourceUri ===
      MASTER_PICKER_RESOURCE,
    "Picker needs its registered resource",
  );
  assert(
    f.tools.get("select_master")!.config.annotations.readOnlyHint === false,
    "Selection is a write",
  );
  const selected =
    (await f.call("select_master", { master_id: masterId })).structuredContent;
  assert(
    selected.player.level === 1 && !selected.requires_master_selection,
    "RPC must start Level 1",
  );
  await f.call("select_master", { master_id: masterId });
  assert(f.writes() === 1, "Repeated click must not restart the quest");
  assert(
    (await f.call("select_master", { master_id: referrerId })).isError,
    "Existing Master cannot be changed",
  );
  assert(
    f.calls.some((call) =>
      call.name === "switch_player_master" && call.args.p_master_id === masterId
    ),
    "Existing RPC must perform selection",
  );
});
Deno.test("expired accounts and database failures cannot complete selection", async () => {
  for (
    const options of [{ expired: true }, { denied: true }, { failWrite: true }]
  ) {
    const f = fixture(options);
    const response = await f.call("select_master", { master_id: masterId });
    assert(
      response.isError && f.writes() === 0,
      "Failed selection must not report success",
    );
    assert(
      !JSON.stringify(response).includes("private SQL"),
      "Do not leak database diagnostics",
    );
  }
  const expired = (await fixture({ expired: true }).call("show_master_picker"))
    .structuredContent;
  assert(
    expired.selection_expired && expired.masters.length === 0,
    "Expired picker must not offer selection",
  );
  const linked = (await fixture({ linked: true }).call("show_master_picker"))
    .structuredContent;
  assert(
    !linked.requires_master_selection && linked.masters.length === 0,
    "Existing account must continue its game",
  );
});
Deno.test("MCP resource bundles the shared UI and assets without browser authentication", () => {
  assert(
    MASTER_PICKER_HTML.includes("profile-masters-carousel") &&
      MASTER_PICKER_HTML.includes("profile-master-dialog"),
    "Shared UI missing",
  );
  assert(
    MASTER_PICKER_HTML.includes("data:image/jpeg;base64,") &&
      !MASTER_PICKER_HTML.includes('avatarUrl: "/src/'),
    "Preview assets must work in the sandbox",
  );
  assert(
    MASTER_PICKER_HTML.includes('request("tools/call"') &&
      !MASTER_PICKER_HTML.includes("getSupabaseClient"),
    "Widget must use authenticated MCP tools",
  );
});
