import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";

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
        "id,username,full_name,lore,years_burned,manna_target,manna_unit,manna_cycle,locked",
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
    server.registerTool("get_my_profile", {
      title: "My game profile",
      description:
        "Read the connected user's game profile and manna target. Does not change game data.",
      inputSchema: {},
      annotations,
      _meta: { securitySchemes },
    }, () => result({ profile }));
    server.registerTool("get_my_progress", {
      title: "My game progress",
      description:
        "Read the connected user's saved levels, practice seconds, cycle starts, quest acceptance and completed practice totals. These are saved values, not a live running timer.",
      inputSchema: {},
      annotations,
      _meta: { securitySchemes },
    }, async () => {
      const [players, completions] = await Promise.all([
        client.from("player").select(
          "id,master,level,skill_1_practice,skill_2_practice,skill_3_practice,skill_1_start,skill_2_start,skill_3_start,level_2_accepted_at,level_3_accepted_at",
        )
          .eq("user_id", userId).order("id").limit(100),
        client.rpc("get_practice_completion_totals"),
      ]);
      if (players.error || completions.error) {
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
        completed_practice_seconds: completions.data,
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
