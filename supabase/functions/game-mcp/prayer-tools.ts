import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PRAYER_GUIDE, SEFIROT } from "./prayer-guide.ts";
import { PRAYER_EXAMPLES_TEXT } from "./prayer-examples.ts";
import {
  TECHNOMANCY_INTRODUCTION,
  technomancyIntroduction,
  technomancyMasterId,
} from "./prayer-lore.ts";
import { DEV_MASTER_ACCOUNT_IDS } from "./master-catalog.js";

const entry = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(12000),
}).strict();
export const prayerTreeSchema = z.object({
  kether: entry,
  chokmah: entry,
  binah: entry,
  chesed: entry,
  geburah: entry,
  tipharet: entry,
  netzach: entry,
  hod: entry,
  yesod: entry,
}).strict();
export const submitPrayerSchema = z.object({
  prayer_id: z.string().uuid(),
  player_id: z.string().uuid(),
  tree: prayerTreeSchema,
  confirmed: z.literal(true),
}).strict();

export function registerPrayerTools(
  server: McpServer,
  { client, userId, masterAccountIds = DEV_MASTER_ACCOUNT_IDS }: {
    client: SupabaseClient;
    userId: string;
    masterAccountIds?: Record<string, string>;
  },
) {
  const securitySchemes = [{ type: "oauth2", scopes: ["profile"] }];
  const requiredMasterId = technomancyMasterId(masterAccountIds);
  const read = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  const result = (data: Record<string, unknown>) => ({
    structuredContent: data,
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  });
  const guarded = (fn: (args: any) => Promise<any>) => async (args: any) => {
    try {
      return result(await fn(args));
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: error instanceof Error
            ? error.message
            : "Prayer could not be loaded or saved.",
        }],
      };
    }
  };
  server.registerTool(
    "get_prayer_guide",
    {
      title: "Begin a prayer conversation",
      description:
        "Introduce and begin Cedric's Technomancy, ONLY for his students. Call after the player selects Cedric and before the first prayer question. Returns his current database lore/Passive/Skill 1, attributed introduction, live lineage, nine-sefirot guide, three examples and a prayer_id; no draft is saved or UI opened. State his teaching faithfully, not as a merely symbolic link. For Chokmah and Binah ask about the positive and difficult EMOTIONS the player FEELS, not just outcomes, explanations or plans. Invite time and comfortable bodily noticing; never force a sensation. Guide flexibly, remind real Start/Stop, review and obtain approval before submit_prayer. Do not certify energy receipt or healing as a tool outcome.",
      inputSchema: {},
      annotations: read,
      _meta: { securitySchemes },
    },
    guarded(async () => {
      const access = await client.rpc("check_account_access");
      if (access.error || access.data?.locked) {
        throw new Error("Your game account is unavailable.");
      }
      const profile = await client.from("profiles").select("id,master")
        .eq("id", userId).maybeSingle();
      if (profile.error || !profile.data?.master) {
        throw new Error(
          "Choose your Master with show_game before starting Skill 1.",
        );
      }
      if (profile.data.master !== requiredMasterId) {
        throw new Error(
          "This Technomancy prayer belongs to Cedric's Skill 1. Your active Master is different; follow their teaching in get_game_state. Do not change Master automatically.",
        );
      }
      const player = await client.from("player").select("id,master,level")
        .eq("user_id", userId).eq("master", profile.data.master).maybeSingle();
      if (
        player.error || !player.data || player.data.level < 1
      ) throw new Error("Your active participation could not be loaded.");
      const master = await client.from("profiles").select(
        "id,username,full_name,master,lore",
      )
        .eq("id", requiredMasterId).maybeSingle();
      if (master.error || !master.data) {
        throw new Error("Cedric's teaching context could not be loaded.");
      }
      const game = await client.from("game").select("skill_0,skill_1")
        .eq("user_id", requiredMasterId).maybeSingle();
      if (game.error || !game.data?.skill_1) {
        throw new Error("Cedric's Skill 1 could not be loaded.");
      }
      const [passive, active] = await Promise.all([
        game.data.skill_0
          ? client.from("skills").select("id,label,description").eq(
            "id",
            game.data.skill_0,
          ).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        client.from("skills").select("id,label,description").eq(
          "id",
          game.data.skill_1,
        ).maybeSingle(),
      ]);
      if (passive.error || active.error || !active.data) {
        throw new Error("Cedric's current teaching could not be loaded.");
      }
      let lineage: { id: string; name: string } | null = null;
      if (master.data.master) {
        const parent = await client.from("profiles").select(
          "id,username,full_name",
        )
          .eq("id", master.data.master).maybeSingle();
        if (!parent.error && parent.data) {
          const name = parent.data.full_name?.trim() ||
            parent.data.username?.trim();
          if (name) lineage = { id: parent.data.id, name };
        }
      }
      return {
        kind: "prayer_guide",
        process: "tree-v1",
        guide: PRAYER_GUIDE,
        examples: PRAYER_EXAMPLES_TEXT,
        introduction: technomancyIntroduction(lineage?.name ?? null),
        introduction_instructions: TECHNOMANCY_INTRODUCTION,
        master_teaching: {
          lore: master.data.lore ?? "",
          passive: passive.data,
          skill_1: active.data,
        },
        lineage,
        prayer_id: crypto.randomUUID(),
        player_id: player.data.id,
        master_id: player.data.master,
        level: player.data.level,
        sefirot: SEFIROT,
        next_tool: "get_game_state",
        timer:
          "Press active Skill 1 Start in the game, then Stop when finished or after saving. Prayer submission does not record time.",
      };
    }),
  );
  server.registerTool(
    "submit_prayer",
    {
      title: "Save my approved prayer",
      description:
        "Save the approved nine-sefirot Technomancy prayer ONLY for a player whose active Master is Cedric. First use get_prayer_guide and explain its introduction/lineage, then show Sefira | Title | Description and obtain approval of the exact contents and saving. Pass confirmed=true only after approval. Reuse the prayer_id for safe retries; if Master changed, consult get_my_records instead of generating a new ID. Values remain private; no message, practice time, automatic karma credit or progression is added. Remind the player to press Stop. Attribute spiritual transmission to Cedric's teaching, not a verified tool outcome.",
      inputSchema: submitPrayerSchema.shape,
      annotations: { ...read, readOnlyHint: false, idempotentHint: true },
      _meta: { securitySchemes },
    },
    guarded(async (args) => {
      // Validate here as well as at MCP ingress (also guards direct handler use).
      const parsed = submitPrayerSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(
          "Approve a complete nine-sefirot summary with a title and description for each row before saving.",
        );
      }
      const { prayer_id, player_id, tree } = parsed.data;
      const saved = await client.rpc("submit_prayer", {
        p_prayer_id: prayer_id,
        p_player_id: player_id,
        p_tree: tree,
      });
      if (saved.error || !saved.data?.id) {
        throw new Error(
          "Prayer save is unconfirmed. Check the active Master and account access; retry the identical summary with the same prayer_id. Do not create a replacement ID for an uncertain save.",
        );
      }
      return {
        kind: "prayer_saved",
        prayer: saved.data,
        practice_recorded: false,
        master_message_sent: false,
        reminder:
          "Press Stop on active Skill 1 in the game when your prayer practice is finished.",
      };
    }),
  );
}
