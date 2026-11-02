import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PRAYER_GUIDE, SEFIROT } from "./prayer-guide.ts";

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

// Legacy website rows remain untouched; expose their two actual fields without
// inventing a separate Kether problem, titles or the other six sefirot.
export function prayerRecord<T extends Record<string, any>>(row: T) {
  return {
    ...row,
    tree: row.tree ?? {
      binah: { title: null, description: row.problem },
      chokmah: { title: null, description: row.prayer },
    },
    process: row.process ?? "basic-v1",
  };
}

export function registerPrayerTools(
  server: McpServer,
  { client, userId }: { client: SupabaseClient; userId: string },
) {
  const securitySchemes = [{ type: "oauth2", scopes: ["profile"] }];
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
        "Use when the player wants to pray or practice active Skill 1. Returns the full nine-sefirot guide, active participation and a new prayer_id; no draft is saved. Available from Level 1 for every Master, including continued Skill 1 practice at higher levels. Guide freely across sefirot rather than a rigid form. Ask the player to press Skill 1 Start in show_game and Stop when finished. Summarize all nine title/description pairs and obtain approval before submit_prayer. No automatic timer or spiritual/medical outcome.",
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
      const player = await client.from("player").select("id,master,level")
        .eq("user_id", userId).eq("master", profile.data.master).maybeSingle();
      if (
        player.error || !player.data || player.data.level < 1
      ) throw new Error("Your active participation could not be loaded.");
      return {
        kind: "prayer_guide",
        process: "tree-v1",
        guide: PRAYER_GUIDE,
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
        "Save the player's approved nine-sefirot summary for their own active Master's Skill 1. First use get_prayer_guide; show Sefira | Title | Description for all nine and obtain approval of these exact contents and saving. Pass confirmed=true only after that approval. Reuse its prayer_id and identical contents for safe retries. Values remain private under existing prayer access; no message is sent to the Master. Does not save practice time, stop the timer or grant progression. Remind the player to press Stop after success. Spiritual realization belongs to the player; never fabricate it or require a cure.",
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
        prayer: prayerRecord(saved.data),
        practice_recorded: false,
        master_message_sent: false,
        reminder:
          "Press Stop on active Skill 1 in the game when your prayer practice is finished.",
      };
    }),
  );
}
