import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { GAME_RULES } from "./game-rules.ts";
import { getMannaModel, getMannaRules, getMannaSkillModels } from "./manna.js";
import { registerMasterTools } from "./master-tools.ts";
import { registerGameTools } from "./game-tools.ts";
import { registerAccountTools } from "./account-tools.ts";
import { DEV_PROJECT_URL, getEnvironment, type GameEnvironment } from "./environment.ts";

// Each request supplies its authenticated, user-scoped client and verified identity.
export function registerTools(
  server: McpServer,
  { client, userId, profile, user, environment = getEnvironment(DEV_PROJECT_URL) }: {
    client: SupabaseClient;
    userId: string;
    profile: (Record<string, any> & { id: string }) | null;
    user: User;
    environment?: GameEnvironment;
  },
) {
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  const securitySchemes = [{ type: "oauth2", scopes: ["profile"] }];
  const result = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  });
  const toolError = (message: string) => ({
    isError: true,
    content: [{ type: "text" as const, text: message }],
  });
  const withProfileImageUrls = async <T extends Record<string, unknown>>(
    row: T | null,
  ) => {
    if (!row) return null;
    const errors: Record<string, string> = {};
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const resolve = async (pathValue: unknown, field: string) => {
      const image = String(pathValue ?? "").trim();
      if (!image || !row.id) return null;
      try {
        let path = image;
        if (/^https?:\/\//i.test(image)) {
          const match = new URL(image).pathname.match(
            /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/users\/(.+)$/,
          );
          if (!match) throw new Error("Unsupported image path");
          path = decodeURIComponent(match[1]);
        }
        path = path.replace(/^\/+/, "").replace(/^users\//, "").replace(
          /\+/g,
          " ",
        );
        if (
          !path || path.includes("\\") ||
          path.split("/").some((part) => part === ".." || part === ".")
        ) {
          throw new Error("Invalid image path");
        }
        if (!path.includes("/")) path = `${row.id}/${path}`;
        const { data, error } = await client.storage.from("users")
          .createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) {
          throw error ?? new Error("Image unavailable");
        }
        return data.signedUrl;
      } catch {
        errors[field] =
          "This image is unavailable or its signed URL could not be created.";
        return null;
      }
    };
    const [avatarUrl, backgroundUrl] = await Promise.all([
      resolve(row.avatar_path, "avatar_url"),
      resolve(row.background_path, "background_url"),
    ]);
    return {
      ...row,
      avatar_url: avatarUrl,
      background_url: backgroundUrl,
      image_urls_expires_at: avatarUrl || backgroundUrl ? expiresAt : null,
      ...(Object.keys(errors).length ? { image_url_errors: errors } : {}),
    };
  };
  registerMasterTools(server, { client, userId, profile, user, withProfileImageUrls, masterAccountIds: environment.masterAccountIds });
  registerGameTools(server, { client, userId, profile, user, withProfileImageUrls, masterAccountIds: environment.masterAccountIds });
  registerAccountTools(server, { client, userId, withProfileImageUrls, siteOrigin: environment.siteUrl });
  server.registerTool(
    "get_my_profile",
    {
      title: "My game profile",
      description:
        "Read all saved profile fields for the connected user, including their manna target and account email. If onboarding.requires_master_selection is true, call show_game to let the user choose their first Master. avatar_url and background_url are full signed image links, valid for one hour (image_urls_expires_at). Use show_game or show_account to display the profile in its interactive interface. Missing or inaccessible images have null URLs. For calculated Manna gains, losses, balances and cycle targets use get_my_manna; balances are not stored in this profile.",
      inputSchema: {},
      annotations,
      _meta: { securitySchemes },
    },
    async () =>
      result({
        profile: await withProfileImageUrls(profile),
        email: user.email ?? null,
        onboarding: { requires_master_selection: !!profile && !profile.master,
          next_tool: profile && !profile.master ? "show_game" : "get_my_progress" },
      }),
  );
  server.registerTool("get_my_progress", {
    title: "My game progress",
    description:
      "Read the connected user's saved levels, current practice counters, cycle starts and quest acceptance. Completed practice history is available separately through get_my_records; no cycle-equivalent total is included here.",
    inputSchema: {},
    annotations,
    _meta: { securitySchemes },
  }, async () => {
    const players = await client.from("player").select(
      "id,master,level,skill_1_practice,skill_2_practice,skill_3_practice,skill_1_start,skill_2_start,skill_3_start,level_2_accepted_at,level_3_accepted_at",
    ).eq("user_id", userId).order("id").limit(100);
    if (players.error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: "Progress could not be loaded.",
        }],
      };
    }
    return result({
      retrieved_at: new Date().toISOString(),
      players: players.data,
    });
  });
  server.registerTool("get_my_practice_time", {
    title: "My recorded practice time",
    description:
      "Use this to answer how long the connected user has practiced. Practice belongs to the skills taught by the Masters linked to their player participations, not the user's own authored skills from get_my_game. Use get_my_progress and get_my_master_games to resolve the Master and skill names: player.master matches games.user_id, and game.skill_N matches skills.id for skill_number N. These totals aggregate each numbered slot across all participations; if multiple Masters contribute, do not label the aggregate with one Master's skill name. Completed goals count at their configured practice target, and current saved counters are added. This is game-recorded practice, not an independent stopwatch log.",
    inputSchema: {},
    annotations,
    _meta: { securitySchemes },
  }, async () => {
    const players = await client.from("player").select(
      "id,skill_1_practice,skill_2_practice,skill_3_practice",
    ).eq("user_id", userId).order("id").limit(100);
    if (players.error) return toolError("Practice time could not be loaded.");
    const playerRows = players.data ?? [];
    const playerIds = playerRows.map((row) => row.id);
    const completedGoals = new Map<number, number>([[1, 0], [2, 0], [3, 0]]);
    if (playerIds.length > 0) {
      const pageSize = 1000;
      for (let offset = 0;; offset += pageSize) {
        const rows = await client.from("practice_completions")
          .select("skill_number")
          .in("player_id", playerIds)
          .order("completed_at").order("id")
          .range(offset, offset + pageSize - 1);
        if (rows.error) return toolError("Practice time could not be loaded.");
        for (const row of rows.data ?? []) {
          completedGoals.set(
            row.skill_number,
            (completedGoals.get(row.skill_number) ?? 0) + 1,
          );
        }
        if ((rows.data?.length ?? 0) < pageSize) break;
      }
    }
    const practiceModels = getMannaSkillModels();
    const skills = GAME_RULES.skills.slice(1, 4).map((_ability, index) => {
      const skillNumber = index + 1;
      const completedGoalCount = completedGoals.get(skillNumber) ?? 0;
      const goalPracticeSeconds = practiceModels[index].questSeconds;
      const completedGoalTargetSeconds = completedGoalCount *
        goalPracticeSeconds;
      const currentPracticeSeconds = playerRows.reduce((sum, row) =>
        sum +
        (Number(
          (row as Record<string, unknown>)[`skill_${skillNumber}_practice`],
        ) || 0), 0);
      return {
        skill_number: skillNumber,
        completed_goal_count: completedGoalCount,
        goal_target_seconds: goalPracticeSeconds,
        completed_goal_target_seconds: completedGoalTargetSeconds,
        current_saved_practice_seconds: currentPracticeSeconds,
        tracked_practice_seconds: completedGoalTargetSeconds +
          currentPracticeSeconds,
      };
    });
    return result({
      retrieved_at: new Date().toISOString(),
      basis:
        "Completed goals are reconstructed at their configured practice target; current saved counters are added. This is game-recorded practice, not an independent stopwatch log.",
      skills,
      total_tracked_practice_seconds: skills.reduce(
        (sum, skill) => sum + skill.tracked_practice_seconds,
        0,
      ),
    });
  });
  server.registerTool("get_my_manna", {
    title: "My Manna gains, losses and rules",
    description:
      "Use this for the connected user's Manna bar, earned Manna from practice/completions, passive losses, net balances, and targets per year, calendar month, day or hour. Returns the formulas for other durations, the annual overview and each participation's active skill views labelled with its Master and skill. The annual overview includes all completed goals and eligible partial counters; active bars show only their own current cycle. Historical gains are reconstructed using current target settings, not recorded historical amounts. Supply the browser's IANA time zone for matching calendar-month conversions. Unsaved live timer seconds and the browser's current selected skill are unavailable; all unlocked views are returned.",
    inputSchema: {
      time_zone: z.string().default("UTC").describe(
        "IANA timezone of the game browser, e.g. Asia/Tokyo or Europe/Paris. Defaults to UTC; calendar-month amounts can differ from the browser if its timezone differs.",
      ),
    },
    annotations,
    _meta: { securitySchemes },
  }, async ({ time_zone }: { time_zone: string }) => {
    const now = new Date();
    let rules;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: time_zone }).format(now);
      rules = getMannaRules(profile, now, time_zone);
    } catch {
      return toolError(
        "Supply a valid IANA time zone such as Asia/Tokyo or Europe/Paris.",
      );
    }
    const players = await client.from("player").select(
      "id,master,level,skill_1_practice,skill_2_practice,skill_3_practice,skill_1_start,skill_2_start,skill_3_start,level_2_accepted_at,level_3_accepted_at",
    ).eq("user_id", userId).order("id").limit(101);
    if (players.error || (players.data?.length ?? 0) > 100) {
      return toolError("Manna data could not be loaded completely.");
    }
    const playerRows = players.data ?? [];
    const masterIds = [...new Set(playerRows.map((row) => row.master))];
    const [masters, games] = masterIds.length
      ? await Promise.all([
        client.from("profiles").select("id,username,full_name").in(
          "id",
          masterIds,
        ).limit(100),
        client.from("game").select("user_id,skill_1,skill_2,skill_3").in(
          "user_id",
          masterIds,
        ).limit(100),
      ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (masters.error || games.error) {
      return toolError("Master games could not be loaded.");
    }
    const skillIds = [
      ...new Set(
        (games.data ?? []).flatMap((game) =>
          [game.skill_1, game.skill_2, game.skill_3].filter(Boolean)
        ),
      ),
    ];
    const skills = skillIds.length
      ? await client.from("skills").select("id,label").in("id", skillIds).limit(
        300,
      )
      : { data: [], error: null };
    if (skills.error) {
      return toolError("Master skill names could not be loaded.");
    }
    const completed = new Map<string, number>();
    const playerIds = playerRows.map((row) => row.id);
    if (playerIds.length) {
      for (let offset = 0;; offset += 1000) {
        const rows = await client.from("practice_completions").select(
          "player_id,skill_number",
        )
          .in("player_id", playerIds).order("completed_at").order("id")
          .range(offset, offset + 999);
        if (rows.error) {
          return toolError("Manna completion history could not be loaded.");
        }
        for (const row of rows.data ?? []) {
          const key = `${row.player_id}:${row.skill_number}`;
          completed.set(key, (completed.get(key) ?? 0) + 1);
        }
        if ((rows.data?.length ?? 0) < 1000) break;
      }
    }
    const models = getMannaSkillModels();
    let completedPassiveSeconds = 0;
    for (const row of playerRows) {
      for (const model of models) {
        completedPassiveSeconds +=
          (completed.get(`${row.id}:${model.skill_number}`) ?? 0) *
          model.passiveSeconds;
      }
    }
    const currentPlayer = playerRows.find((row) =>
      row.master === profile?.master
    ) ??
      playerRows[0] ?? { level: 4 };
    const common = {
      activeModels: models,
      playerProfile: profile,
      accountCreatedAt: user.created_at,
      now,
      timeZone: time_zone,
    };
    const annual = getMannaModel({
      ...common,
      player: currentPlayer,
      practicePlayers: playerRows,
      completedPassiveSeconds,
      selectedAbilityIndex: 0,
    });
    const annualRate = annual.target / GAME_RULES.skills[0].cycleSeconds;
    const participants = playerRows.map((player) => {
      const master = (masters.data ?? []).find((row) =>
        row.id === player.master
      );
      const game = (games.data ?? []).find((row) =>
        row.user_id === player.master
      );
      return {
        player_id: player.id,
        master_id: player.master,
        master_name: master?.username || master?.full_name || null,
        skills: models.map((model) => {
          const n = model.skill_number;
          const available = n <= Math.min(3, Number(player.level));
          const skillId = (game as Record<string, string | null> | undefined)
            ?.[`skill_${n}`] ?? null;
          const completedGoals = completed.get(`${player.id}:${n}`) ?? 0;
          const practiceSeconds = Math.max(
            0,
            Number(
              (player as Record<string, unknown>)[`skill_${n}_practice`],
            ) || 0,
          );
          return {
            skill_number: n,
            skill_id: skillId,
            skill_name: (skills.data ?? []).find((row) =>
              row.id === skillId
            )?.label ?? null,
            unlocked: available,
            completed_goal_count: completedGoals,
            practice_goal_seconds: model.questSeconds,
            passive_cycle_seconds: model.passiveSeconds,
            gain_per_completed_goal_at_annual_rate: model.passiveSeconds *
              annualRate,
            completed_gain_at_current_settings: completedGoals *
              model.passiveSeconds * annualRate,
            partial_gain_in_annual_overview: available
              ? practiceSeconds * model.passiveSeconds / model.questSeconds *
                annualRate
              : 0,
            current_cycle_bar: available
              ? getMannaModel({ ...common, player, selectedAbilityIndex: n })
              : null,
          };
        }),
      };
    });
    return result({
      retrieved_at: now.toISOString(),
      time_zone,
      calculation_basis:
        "Shared browser Manna calculation, saved counters and completion history. Completed gains are revalued at the current target and annual overview normalization. No synchronization or database mutation is performed.",
      unit: annual.unit,
      rules,
      annual_overview: annual,
      participants,
    });
  });
  server.registerTool("get_my_game", {
    title: "My authored game and skills",
    description:
      "Read the game and skills authored by the connected user for other players to learn. These are not the skills the user practices as a student. Do not use these skill names to label the user's practice time or quest progress; use get_my_master_games for that. Use get_game_rules for official mechanics and get_account_state for creation and publication permissions. This read does not create or publish a game.",
    inputSchema: {},
    annotations,
    _meta: { securitySchemes },
  }, async () => {
    const [game, skills] = await Promise.all([
      client.from("game").select(
        "id,created_at,user_id,skill_0,skill_1,skill_2,skill_3,skill_4",
      )
        .eq("user_id", userId).maybeSingle(),
      client.from("skills").select("id,created_at,label,description,user_id")
        .eq("user_id", userId).order("created_at").limit(100),
    ]);
    if (game.error || skills.error) {
      return toolError("Game data could not be loaded.");
    }
    return result({ game: game.data, skills: skills.data });
  });
  server.registerTool("get_my_master_games", {
    title: "My Masters' games and skills",
    description:
      "Read the public games and skills taught by the Masters linked to the connected user's player participations. Master profiles include full avatar_url/background_url image links, valid for one hour; refetch after image_urls_expires_at. Use these skill names to describe the user's own practice time and quest progress. Match player.master from get_my_progress to games.user_id, then match game.skill_N to skills.id for skill_number N. The user's authored game returned by get_my_game serves a different role and must not supply these practice labels.",
    inputSchema: {},
    annotations,
    _meta: { securitySchemes },
  }, async () => {
    const players = await client.from("player").select("master")
      .eq("user_id", userId).limit(100);
    if (players.error) return toolError("Master games could not be loaded.");
    const masterIds = [
      ...new Set((players.data ?? []).map((row) => row.master)),
    ];
    if (masterIds.length === 0) {
      return result({ masters: [], games: [], skills: [] });
    }
    const [masters, games] = await Promise.all([
      client.from("profiles").select(
        "id,username,full_name,avatar_path,background_path",
      )
        .in("id", masterIds).limit(100),
      client.from("game").select(
        "id,user_id,skill_0,skill_1,skill_2,skill_3,skill_4",
      )
        .in("user_id", masterIds).limit(100),
    ]);
    if (masters.error || games.error) {
      return toolError("Master games could not be loaded.");
    }
    const masterProfiles = await Promise.all(
      (masters.data ?? []).map(withProfileImageUrls),
    );
    const skillIds = [
      ...new Set(
        (games.data ?? []).flatMap((game) =>
          GAME_RULES.skills.map((skill) => skill.skillColumn).map((column) =>
            (game as Record<string, string | null>)[column]
          )
            .filter(Boolean)
        ),
      ),
    ];
    if (skillIds.length === 0) {
      return result({ masters: masterProfiles, games: games.data, skills: [] });
    }
    const skills = await client.from("skills").select(
      "id,label,description,user_id",
    )
      .in("id", skillIds).limit(500);
    if (skills.error) return toolError("Master skills could not be loaded.");
    return result({
      masters: masterProfiles,
      games: games.data,
      skills: skills.data,
    });
  });
  server.registerTool(
    "get_my_records",
    {
      title: "My game records",
      description:
        "Read the connected user's practice completions, prayers or notification receipts, 50 at a time. Use offset for the next page; has_more indicates whether another page exists.",
      inputSchema: {
        kind: z.enum(["practice_completions", "prayers", "notifications"]),
        offset: z.number().int().min(0).max(100000).default(0),
      },
      annotations,
      _meta: { securitySchemes },
    },
    async (
      { kind, offset }: {
        kind: "practice_completions" | "prayers" | "notifications";
        offset: number;
      },
    ) => {
      const pageSize = 50;
      if (kind === "practice_completions") {
        const owners = await client.from("player").select("id")
          .eq("user_id", userId).limit(100);
        if (owners.error) {
          return toolError(
            "Practice records could not be loaded.",
          );
        }
        const playerIds = (owners.data ?? []).map((row) => row.id);
        if (playerIds.length === 0) {
          return result({
            kind,
            offset,
            records: [],
            has_more: false,
          });
        }
        const rows = await client.from("practice_completions")
          .select("id,player_id,skill_number,completed_at")
          .in("player_id", playerIds).order("completed_at", {
            ascending: false,
          })
          .order("id", { ascending: false })
          .range(offset, offset + pageSize);
        if (rows.error) {
          return toolError(
            "Practice records could not be loaded.",
          );
        }
        return result({
          kind,
          offset,
          records: rows.data?.slice(0, pageSize),
          has_more: (rows.data?.length ?? 0) > pageSize,
        });
      }
      const rows = kind === "prayers"
        ? await client.from("prayers").select(
          "id,created_at,problem,prayer,username",
        )
          .eq("user_id", userId).order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + pageSize)
        : await client.from("user_notifications")
          .select(
            "notification_id,occurrence,read_at,dismissed_at,clicked_at,completed_at",
          )
          .eq("user_id", userId).order("notification_id").order("occurrence")
          .range(offset, offset + pageSize);
      if (rows.error) return toolError("Game records could not be loaded.");
      return result({
        kind,
        offset,
        records: rows.data?.slice(0, pageSize),
        has_more: (rows.data?.length ?? 0) > pageSize,
      });
    },
  );
  server.registerTool("get_game_rules", {
    title: "Official game rules",
    description:
      "Returns the official, immutable Magic Dev game configuration, including Skill cycles, practice objectives, spatial zones, Manna equations, variable definitions and explanatory documentation. Use this tool to understand game rules and interpret player statistics. The returned values are authoritative. This tool does not return personal player data or calculate player balances.",
    inputSchema: {},
    annotations,
    _meta: { securitySchemes },
  }, () => result(GAME_RULES));
}
