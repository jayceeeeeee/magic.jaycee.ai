import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { GAME_RULES } from "./game-rules.ts";
import {
  DEV_MASTER_ACCOUNT_IDS,
  getFeaturedMasters,
  LOCKED_PREVIEW_MASTERS,
} from "./master-catalog.js";

export const MASTER_PICKER_RESOURCE = "ui://magic/master-picker-v3.html";
const featured = getFeaturedMasters(DEV_MASTER_ACCOUNT_IDS);
const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const errorResult = (text: string) => ({
  isError: true,
  content: [{ type: "text" as const, text }],
});
const result = (data: Record<string, unknown>) => ({
  structuredContent: data,
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});

export function registerMasterTools(server: McpServer, {
  client,
  userId,
  profile,
  user,
  withProfileImageUrls,
}: {
  client: SupabaseClient;
  userId: string;
  profile: Record<string, any> | null;
  user: User;
  withProfileImageUrls: (row: Record<string, any>) => Promise<any>;
}) {
  const securitySchemes = [{ type: "oauth2", scopes: ["profile"] }];
  const state = async () => {
    if (!profile) {
      throw new Error("Your game profile is not ready. Complete signup first.");
    }
    const players = await client.from("player").select(
      "id,master,level,skill_1_start",
    )
      .eq("user_id", userId).limit(1);
    if (players.error) throw new Error("Onboarding could not be loaded.");
    const requiresSelection = !profile.master;
    const hasDeadline = requiresSelection && !players.data?.length &&
      !profile.permanent_account_at && !profile.visibility &&
      profile.role !== "admin";
    const startedAt = Date.parse(
      profile.master_selection_started_at || user.created_at,
    );
    const deadline = hasDeadline && Number.isFinite(startedAt)
      ? new Date(startedAt + GAME_RULES.skills[1].cycleSeconds * 1000)
        .toISOString()
      : null;
    return {
      requires_master_selection: requiresSelection,
      master_id: profile.master || null,
      selection_deadline: deadline,
      selection_expired: !!deadline && Date.parse(deadline) <= Date.now(),
      next_tool: requiresSelection ? "show_master_picker" : "get_my_progress",
    };
  };
  const choices = () => loadMasterChoices(client, userId, profile);
  const guarded =
    (callback: (args: any) => Promise<any>) => async (args: any) => {
      try {
        return await callback(args);
      } catch (error) {
        return errorResult(
          error instanceof Error
            ? error.message
            : "The operation failed. Try again.",
        );
      }
    };
  server.registerTool("get_onboarding_state", {
    title: "My game onboarding",
    description:
      "Check this when starting with the game plugin. If requires_master_selection is true, call show_master_picker so the user can choose their first Master. Returns the existing selection deadline; does not start or extend it.",
    inputSchema: {},
    annotations: readAnnotations,
    _meta: { securitySchemes },
  }, guarded(async () => result(await state())));

  server.registerTool(
    "show_master_picker",
    {
      title: "Choose my first Master",
      description:
        "Display the game's shared Master selector for a connected account without a Master. The user can inspect profiles and abilities, then explicitly select their first Master. Only masters with selectable=true are available for selection. Locked database Masters and locked_preview_masters are displayed but cannot be chosen; preview-only characters have no database account or game. Use after get_onboarding_state requests selection.",
      inputSchema: {},
      annotations: readAnnotations,
      _meta: {
        securitySchemes,
        ui: { resourceUri: MASTER_PICKER_RESOURCE },
        "openai/outputTemplate": MASTER_PICKER_RESOURCE,
      },
    },
    guarded(async () => {
      const onboarding = await state();
      const showChoices = onboarding.requires_master_selection &&
        !onboarding.selection_expired;
      const masters = showChoices
        ? await Promise.all((await choices()).map(async (row) => {
          // Only public card fields enter the model/UI result.
          const images = await withProfileImageUrls({
            id: row.id,
            avatar_path: row.avatar_path,
          });
          return {
            id: row.id,
            username: row.username,
            full_name: row.full_name,
            avatarUrl: images.avatar_url,
            linkLocked: row.linkLocked,
            selectable: !row.linkLocked,
            status: row.linkLocked ? "locked" : "available",
            source: "database",
          };
        }))
        : [];
      return result({
        ...onboarding,
        masters,
        // Same catalog as the UI's second carousel, without inventing DB IDs.
        locked_preview_masters: showChoices
          ? LOCKED_PREVIEW_MASTERS.map(({ username }) => ({
            username,
            linkLocked: true,
            selectable: false,
            status: "locked",
            source: "preview_only",
          }))
          : [],
        referrer_id: profile?.referrer_id || null,
      });
    }),
  );

  server.registerTool(
    "get_master_details",
    {
      title: "Preview an available Master",
      description:
        "Read the public story and five abilities of a Master offered by show_master_picker. Does not select the Master or start a quest.",
      inputSchema: { master_id: z.string().uuid() },
      annotations: readAnnotations,
      _meta: { securitySchemes, ui: { visibility: ["app", "model"] } },
    },
    guarded(async ({ master_id }) => {
      const candidate = (await choices()).find((row) => row.id === master_id);
      if (!candidate || candidate.linkLocked) {
        throw new Error("This Master is not available for selection.");
      }
      const [master, game] = await Promise.all([
        client.from("profiles").select("id,username,full_name,lore").eq(
          "id",
          master_id,
        ).maybeSingle(),
        client.from("game").select(
          "id,user_id,skill_0,skill_1,skill_2,skill_3,skill_4",
        ).eq("user_id", master_id).maybeSingle(),
      ]);
      if (
        master.error || game.error || !master.data || !game.data
      ) throw new Error("The Master's game could not be loaded.");
      const ids = GAME_RULES.skills.map((skill) =>
        game.data![skill.skillColumn]
      ).filter(Boolean);
      const skills = await client.from("skills").select("id,label,description")
        .in("id", ids);
      if (skills.error) {
        throw new Error("The Master's abilities could not be loaded.");
      }
      return result({
        master_id,
        lore: master.data.lore || "",
        game: game.data,
        skills: skills.data,
      });
    }),
  );

  server.registerTool(
    "select_master",
    {
      title: "Select my first Master",
      description:
        "Save the first Master explicitly chosen by the user from show_master_picker. This starts their Level 1 quest immediately. Never choose on the user's behalf. Does not support changing an existing Master.",
      inputSchema: { master_id: z.string().uuid() },
      annotations: {
        ...readAnnotations,
        readOnlyHint: false,
        idempotentHint: true,
      },
      _meta: { securitySchemes, ui: { visibility: ["app", "model"] } },
    },
    guarded(async ({ master_id }) => {
      // Enforce expired-account access before a write, as the website does.
      const access = await client.rpc("check_account_access");
      if (access.error || !access.data || access.data.locked) {
        throw new Error(
          "This game account cannot select a Master. Check its access on the website.",
        );
      }
      const fresh = await client.from("profiles").select("id,master").eq(
        "id",
        userId,
      ).maybeSingle();
      if (fresh.error || !fresh.data) {
        throw new Error(
          "Your game profile could not be loaded.",
        );
      }
      if (fresh.data.master) {
        if (fresh.data.master !== master_id) {
          throw new Error(
            "You already have a Master. Reload your game.",
          );
        }
        const existing = await client.from("player").select(
          "id,master,level,skill_1_start",
        )
          .eq("user_id", userId).eq("master", master_id).maybeSingle();
        if (existing.error || !existing.data) {
          throw new Error(
            "Your participation could not be loaded.",
          );
        }
        return result({
          requires_master_selection: false,
          master_id,
          player: existing.data,
          next_tool: "get_my_progress",
        });
      }
      const candidate = (await choices()).find((row) => row.id === master_id);
      if (!candidate || candidate.linkLocked) {
        throw new Error(
          "This Master is not available for selection.",
        );
      }
      const selected = await client.rpc("switch_player_master", {
        p_master_id: master_id,
      });
      if (selected.error || !selected.data?.id) {
        throw new Error(
          "The Master could not be selected. Reload the picker and try again.",
        );
      }
      return result({
        requires_master_selection: false,
        master_id,
        master_name: candidate.username,
        player: selected.data,
        next_tool: "get_my_progress",
      });
    }),
  );
}

export const loadMasterChoices = async (
  client: SupabaseClient,
  userId: string,
  profile: Record<string, any> | null,
): Promise<Array<Record<string, any>>> => {
  const publicMasters = await client.rpc("list_public_masters", {
    p_limit: 100,
  });
  if (publicMasters.error) throw new Error("Masters could not be loaded.");
  let rows: Record<string, any>[] = publicMasters.data || [];
  if (profile?.referrer_id) {
    const referral = await client.rpc("get_public_referrer", {
      p_referrer_id: profile.referrer_id,
      p_username: null,
    });
    if (referral.error) {
      throw new Error("Your referring Master could not be loaded.");
    }
    const referrer = referral.data?.[0];
    if (referrer && !rows.some((row) => row.id === referrer.id)) {
      rows = [...rows, referrer];
    }
  }
  return rows.filter((row) =>
    row.id !== userId &&
    (featured.has(row.id) || row.id === profile?.referrer_id)
  )
    .map((row) => ({
      ...row,
      linkLocked: featured.get(row.id)?.linkLocked === true,
    }));
};
