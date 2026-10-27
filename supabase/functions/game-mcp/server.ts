import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  JAYCEE_GAME_CONFIG,
  JAYCEE_GAME_CYCLE_LABELS,
  JAYCEE_GAME_SKILL_COLUMNS,
} from "./game-config.js";

export const DEV_PROJECT_URL = "https://mylnagvqngsgcmlvwttu.supabase.co";

export function createHandler(projectUrl: string, publicKey: string) {
  // This prototype must not be deployed against the live game by accident.
  if (projectUrl !== DEV_PROJECT_URL) {
    throw new Error("The MCP prototype requires magic-dev.");
  }
  const resource = `${projectUrl}/functions/v1/game-mcp`;
  const metadataUrl = `${resource}/.well-known/oauth-protected-resource`;
  const challenge =
    `Bearer resource_metadata="${metadataUrl}", scope="profile"`;
  const json = (body: unknown, status = 200, headers = {}) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    });

  return async function handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    if (
      request.method === "GET" &&
      path.endsWith("/.well-known/oauth-protected-resource")
    ) {
      return json({
        resource,
        authorization_servers: [`${projectUrl}/auth/v1`],
        scopes_supported: ["profile", "offline_access"],
      });
    }
    if (!path.endsWith("/game-mcp")) return json({ error: "Not found" }, 404);
    if (!["POST", "GET", "DELETE"].includes(request.method)) {
      return json({ error: "Method not allowed" }, 405, {
        Allow: "POST, GET, DELETE",
      });
    }
    const token = request.headers.get("Authorization")?.match(
      /^Bearer ([^\s]+)$/i,
    )?.[1];
    const unauthorized = () =>
      json({ error: "Sign in to connect your game account." }, 401, {
        "WWW-Authenticate": challenge,
      });
    if (!token) return unauthorized();

    // Every request gets its own user client. No secret/service-role key is used.
    const client = createClient(projectUrl, publicKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await client.auth.getClaims(token);
    const claims = data?.claims;
    const audiences = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
    if (
      error || !claims || claims.iss !== `${projectUrl}/auth/v1` ||
      !audiences.includes("authenticated") || typeof claims.sub !== "string" ||
      typeof claims.client_id !== "string" || !claims.client_id ||
      typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000
    ) return unauthorized();
    // Supabase's profile scope is an identity scope, not a database permission.
    // Database permissions remain governed by RLS and explicit owner filters.
    if (
      typeof claims.scope !== "string" ||
      !claims.scope.split(" ").includes("profile")
    ) {
      return json({ error: "The profile scope is required." }, 403, {
        "WWW-Authenticate": `${challenge}, error="insufficient_scope"`,
      });
    }
    const { data: userData, error: userError } = await client.auth.getUser(
      token,
    );
    if (userError || userData.user?.id !== claims.sub) return unauthorized();
    const userId = claims.sub;
    const { data: profile, error: profileError } = await client.from("profiles")
      .select(
        "id,username,avatar_path,created_at,theme,primary_color,secondary_color,background_path,birth_date,birth_time,birth_place,birth_place_position,birth_timezone,sex,full_name,lore,manna_target,manna_unit,manna_cycle,visibility,role,master,years_burned,permanent_account_at,locked,master_selection_started_at,referrer_id",
      )
      .eq("id", userId).maybeSingle();
    if (profileError) return json({ error: "Profile lookup failed." }, 503);
    if (profile?.locked) {
      return json({ error: "This game account is locked." }, 403);
    }

    const server = new McpServer({ name: "magic-game-dev", version: "0.1.0" });
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
    server.registerTool("get_my_profile", {
      title: "My game profile",
      description:
        "Read all saved profile fields for the connected user, including their manna target and account email. The current manna balance is calculated by the game, not stored in this profile.",
      inputSchema: {},
      annotations,
      _meta: { securitySchemes },
    }, () => result({ profile, email: userData.user.email ?? null }));
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
      let denominator = 1;
      const skills = JAYCEE_GAME_CONFIG.activeAbilities.map((ability, index) => {
        denominator *= ability.ratio;
        const skillNumber = index + 1;
        const completedGoalCount = completedGoals.get(skillNumber) ?? 0;
        const goalPracticeSeconds = JAYCEE_GAME_CONFIG.passive.cycleSeconds / denominator;
        const completedGoalTargetSeconds = completedGoalCount * goalPracticeSeconds;
        const currentPracticeSeconds = playerRows.reduce((sum, row) =>
          sum +
            (Number((row as Record<string, unknown>)[`skill_${skillNumber}_practice`]) || 0),
          0,
        );
        return {
          skill_number: skillNumber,
          completed_goal_count: completedGoalCount,
          goal_target_seconds: goalPracticeSeconds,
          completed_goal_target_seconds: completedGoalTargetSeconds,
          current_saved_practice_seconds: currentPracticeSeconds,
          tracked_practice_seconds: completedGoalTargetSeconds + currentPracticeSeconds,
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
    server.registerTool("get_my_game", {
      title: "My authored game and skills",
      description:
        "Read the game and skills authored by the connected user for other players to learn. These are not the skills the user practices as a student. Do not use these skill names to label the user's practice time or quest progress; use get_my_master_games for that. These definitions may be used with get_game_config to calculate values for the user's authored game.",
      inputSchema: {},
      annotations,
      _meta: { securitySchemes },
    }, async () => {
      const [game, skills] = await Promise.all([
        client.from("game").select("id,created_at,user_id,skill_0,skill_1,skill_2,skill_3,skill_4")
          .eq("user_id", userId).maybeSingle(),
        client.from("skills").select("id,created_at,label,description,user_id")
          .eq("user_id", userId).order("created_at").limit(100),
      ]);
      if (game.error || skills.error) return toolError("Game data could not be loaded.");
      return result({ game: game.data, skills: skills.data });
    });
    server.registerTool("get_my_master_games", {
      title: "My Masters' games and skills",
      description:
        "Read the public games and skills taught by the Masters linked to the connected user's player participations. Use these skill names to describe the user's own practice time and quest progress. Match player.master from get_my_progress to games.user_id, then match game.skill_N to skills.id for skill_number N. The user's authored game returned by get_my_game serves a different role and must not supply these practice labels.",
      inputSchema: {},
      annotations,
      _meta: { securitySchemes },
    }, async () => {
      const players = await client.from("player").select("master")
        .eq("user_id", userId).limit(100);
      if (players.error) return toolError("Master games could not be loaded.");
      const masterIds = [...new Set((players.data ?? []).map((row) => row.master))];
      if (masterIds.length === 0) return result({ masters: [], games: [], skills: [] });
      const [masters, games] = await Promise.all([
        client.from("profiles").select("id,username,full_name")
          .in("id", masterIds).limit(100),
        client.from("game").select("id,user_id,skill_0,skill_1,skill_2,skill_3,skill_4")
          .in("user_id", masterIds).limit(100),
      ]);
      if (masters.error || games.error) return toolError("Master games could not be loaded.");
      const skillIds = [...new Set((games.data ?? []).flatMap((game) =>
        JAYCEE_GAME_SKILL_COLUMNS.map((column) => (game as Record<string, string | null>)[column]).filter(Boolean)
      ))];
      if (skillIds.length === 0) return result({ masters: masters.data, games: games.data, skills: [] });
      const skills = await client.from("skills").select("id,label,description,user_id")
        .in("id", skillIds).limit(500);
      if (skills.error) return toolError("Master skills could not be loaded.");
      return result({ masters: masters.data, games: games.data, skills: skills.data });
    });
    server.registerTool("get_my_records", {
      title: "My game records",
      description:
        "Read the connected user's practice completions, prayers or notification receipts, 50 at a time. Use offset for the next page; has_more indicates whether another page exists.",
      inputSchema: {
        kind: z.enum(["practice_completions", "prayers", "notifications"]),
        offset: z.number().int().min(0).max(100000).default(0),
      },
      annotations,
      _meta: { securitySchemes },
    }, async ({ kind, offset }: { kind: "practice_completions" | "prayers" | "notifications"; offset: number }) => {
      const pageSize = 50;
      if (kind === "practice_completions") {
        const owners = await client.from("player").select("id")
          .eq("user_id", userId).limit(100);
        if (owners.error) return toolError("Practice records could not be loaded.");
        const playerIds = (owners.data ?? []).map((row) => row.id);
        if (playerIds.length === 0) return result({ kind, offset, records: [], has_more: false });
        const rows = await client.from("practice_completions")
          .select("id,player_id,skill_number,completed_at")
          .in("player_id", playerIds).order("completed_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + pageSize);
        if (rows.error) return toolError("Practice records could not be loaded.");
        return result({ kind, offset, records: rows.data?.slice(0, pageSize), has_more: (rows.data?.length ?? 0) > pageSize });
      }
      const rows = kind === "prayers"
        ? await client.from("prayers").select("id,created_at,problem,prayer,username")
          .eq("user_id", userId).order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + pageSize)
        : await client.from("user_notifications")
          .select("notification_id,occurrence,read_at,dismissed_at,clicked_at,completed_at")
          .eq("user_id", userId).order("notification_id").order("occurrence")
          .range(offset, offset + pageSize);
      if (rows.error) return toolError("Game records could not be loaded.");
      return result({ kind, offset, records: rows.data?.slice(0, pageSize), has_more: (rows.data?.length ?? 0) > pageSize });
    });
    server.registerTool("get_game_config", {
      title: "Game calculation rules",
      description:
        "Read public game constants and the derived practice goal durations. The practice targets are calculated from the configured cycle and cumulative ratios, so use these explicit values instead of inferring the formula. This is the deployed development version of game-config.js.",
      inputSchema: {},
      annotations,
      _meta: { securitySchemes },
    }, () => {
      let cumulativeRatio = 1;
      const practiceGoalTargets = JAYCEE_GAME_CONFIG.activeAbilities.map(
        (ability, index) => {
          cumulativeRatio *= ability.ratio;
          const targetSeconds =
            JAYCEE_GAME_CONFIG.passive.cycleSeconds / cumulativeRatio;
          const roundedSeconds = Math.round(targetSeconds);
          const hours = Math.floor(roundedSeconds / 3600);
          const minutes = Math.floor((roundedSeconds % 3600) / 60);
          const seconds = roundedSeconds % 60;
          const display = [
            hours ? `${hours} h` : "",
            minutes ? `${minutes} min` : "",
            seconds ? `${seconds} s` : "",
          ].filter(Boolean).join(" ");
          return {
            skill_number: index + 1,
            skill_column: ability.skillColumn,
            fractal_label: ability.fractalLabel,
            associated_cycle: JAYCEE_GAME_CYCLE_LABELS.activeAbilities[index],
            target_seconds: targetSeconds,
            target_display: display,
          };
        },
      );
      return result({
        game_config: JAYCEE_GAME_CONFIG,
        skill_columns: JAYCEE_GAME_SKILL_COLUMNS,
        cycle_labels: JAYCEE_GAME_CYCLE_LABELS,
        practice_goal_rule:
          "For active skill at zero-based index i: target_seconds = passive.cycleSeconds / product(activeAbilities[0..i].ratio).",
        practice_goal_targets: practiceGoalTargets,
      });
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 16384,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch {
      return json({ error: "MCP request failed." }, 500);
    } finally {
      await server.close();
    }
  };
}
