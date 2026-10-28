import {
  createHandler,
  DEV_PROJECT_URL,
} from "../../supabase/functions/game-mcp/server.ts";
import { GAME_RULES } from "../../supabase/functions/game-mcp/game-rules.ts";
import { GAME_MASTER_INSTRUCTIONS, WORLD_RESOURCES } from "../../supabase/functions/game-mcp/game-master.ts";
import { GAME_RULES as BROWSER_RULES } from "../../src/js/config/game-rules.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const near = (actual: number, expected: number) =>
  Math.abs(actual - expected) < 1e-8 * Math.max(1, Math.abs(expected));
const endpoint = `${DEV_PROJECT_URL}/functions/v1/game-mcp`;
const handler = createHandler(DEV_PROJECT_URL, "test-public-key");
const originalFetch = globalThis.fetch;
const keys = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicJwk = {
  ...await crypto.subtle.exportKey("jwk", keys.publicKey),
  kid: "mcp-test-key",
  alg: "ES256",
  use: "sig",
};
const encode = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
const encodeJson = (value: unknown) =>
  encode(new TextEncoder().encode(JSON.stringify(value)));
async function token(overrides = {}) {
  const payload = {
    sub: "owner",
    iss: `${DEV_PROJECT_URL}/auth/v1`,
    aud: "authenticated",
    role: "authenticated",
    client_id: "chatgpt",
    scope: "profile",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const input = `${
    encodeJson({ alg: "ES256", kid: publicJwk.kid, typ: "JWT" })
  }.${encodeJson(payload)}`;
  return `${input}.${
    encode(
      new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          new TextEncoder().encode(input),
        ),
      ),
    )
  }`;
}
function request(accessToken?: string, method = "tools/list", args?: unknown) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(args ? { params: args } : {}),
    }),
  });
}
function installMock({ locked = false, userId = "owner", historyLength = 1, imageFailure = false } = {}) {
  const calls: { url: URL; auth: string | null }[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    calls.push({ url, auth: req.headers.get("Authorization") });
    if (url.pathname.endsWith("/.well-known/jwks.json")) {
      return Promise.resolve(Response.json({ keys: [publicJwk] }));
    }
    if (url.pathname.startsWith("/storage/v1/object/sign/users/")) {
      assert(req.method === "POST", "Images must use signed private-bucket links");
      assert(["/storage/v1/object/sign/users/owner/avatar photo.jpg",
        "/storage/v1/object/sign/users/owner/background.png",
        "/storage/v1/object/sign/users/master-one/master portrait.png"].includes(decodeURIComponent(url.pathname)),
        "Image path did not resolve to the stored owner/Master image");
      return req.json().then((body) => {
        assert(body.expiresIn === 3600, "Image URLs should expire after one hour");
        return imageFailure
          ? Response.json({ message: "Object not found", statusCode: 404 }, { status: 404 })
          : Response.json({ signedURL: `${decodeURIComponent(url.pathname.replace("/storage/v1", ""))}?token=test` });
      });
    }
    if (url.pathname === "/auth/v1/user") {
      return Promise.resolve(
        Response.json({
          id: userId,
          email: "owner@example.test",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: "2026-01-01",
        }),
      );
    }
    if (url.pathname === "/rest/v1/profiles") {
      if (url.searchParams.get("id") === "eq.master-one") {
        return Promise.resolve(Response.json({ id: "master-one", username: "Master",
          avatar_path: "master-one/master portrait.png", background_path: null }));
      }
      if (url.searchParams.has("id") && url.searchParams.get("id")?.startsWith("in.")) {
        assert(url.searchParams.get("id") === "in.(master-one)", "Only linked Master profiles may be read");
        return Promise.resolve(Response.json([{ id: "master-one", username: "Master",
          avatar_path: `${DEV_PROJECT_URL}/storage/v1/object/public/users/master-one/master%20portrait.png`,
          background_path: null }]));
      }
      assert(
        url.searchParams.get("id") === "eq.owner",
        "Profile query must use the verified user ID",
      );
      return Promise.resolve(
        Response.json({ id: "owner", username: "Owner", locked, master: "master-one",
          avatar_path: "avatar photo.jpg", background_path: "users/owner/background.png",
          manna_target: 10, manna_cycle: "hour", manna_unit: "EUR" }),
      );
    }
    if (url.pathname === "/rest/v1/player") {
      assert(
        url.searchParams.get("user_id") === "eq.owner",
        "Progress must be restricted to its owner",
      );
      if (url.searchParams.has("master") && url.searchParams.get("master") !== "eq.master-one") {
        return Promise.resolve(Response.json([]));
      }
      return Promise.resolve(Response.json([{ id: "own-game", level: 4, master: "master-one",
        skill_1_practice: 0, skill_2_practice: 0, skill_3_practice: 3,
        skill_1_start: "2026-01-01T00:00:00Z", skill_2_start: "2026-01-01T00:00:00Z",
        skill_3_start: "2026-01-01T00:00:00Z" }]));
    }
    if (url.pathname === "/rest/v1/game") {
      if (url.searchParams.get("user_id") === "in.(master-one)") {
        return Promise.resolve(Response.json([{ id: "master-game", user_id: "master-one",
          skill_1: "master-skill", skill_3: "master-earth" }]));
      }
      assert(url.searchParams.get("user_id") === "eq.owner", "Game lookup must use owner ID");
      return Promise.resolve(Response.json({ id: "authored-game", user_id: "owner", skill_0: "own-skill" }));
    }
    if (url.pathname === "/rest/v1/skills") {
      if (url.searchParams.get("id") === "in.(master-skill,master-earth)") {
        return Promise.resolve(Response.json([{ id: "master-skill", label: "Quest" },
          { id: "master-earth", label: "Master Earth" }]));
      }
      assert(url.searchParams.get("user_id") === "eq.owner", "Skill lookup must use owner ID");
      return Promise.resolve(Response.json([{ id: "own-skill", user_id: "owner", label: "Prayer" }]));
    }
    if (url.pathname === "/rest/v1/practice_completions") {
      assert(url.searchParams.get("player_id") === "in.(own-game)", "Completions must use own player IDs");
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 1000);
      return Promise.resolve(Response.json(Array.from({ length: historyLength }, (_, index) =>
        ({ id: index === 0 ? "own-completion" : `completion-${index}`, player_id: "own-game",
          skill_number: 3, completed_at: "2026-01-01T00:00:00Z" })).slice(offset, offset + limit)));
    }
    if (url.pathname === "/rest/v1/prayers") {
      assert(url.searchParams.get("user_id") === "eq.owner", "Prayers must use owner ID");
      return Promise.resolve(Response.json([]));
    }
    if (url.pathname === "/rest/v1/user_notifications") {
      assert(url.searchParams.get("user_id") === "eq.owner", "Notifications must use owner ID");
      return Promise.resolve(Response.json([{ notification_id: "welcome.v1" }]));
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;
  return calls;
}

Deno.test("production configuration is refused", () => {
  let refused = false;
  try {
    createHandler("https://ndtnfwyfdfdcxljvvjfd.supabase.co", "test");
  } catch {
    refused = true;
  }
  assert(refused, "Prototype must refuse production");
});
Deno.test("OAuth discovery is public; private tools require authentication", async () => {
  const response = await handler(
    new Request(`${endpoint}/.well-known/oauth-protected-resource`),
  );
  assert(
    (await response.json()).resource === endpoint,
    "Discovery has the wrong resource",
  );
  const denied = await handler(request());
  assert(
    denied.status === 401 &&
      denied.headers.get("WWW-Authenticate")?.includes("resource_metadata"),
    "Missing OAuth challenge",
  );
  await denied.body?.cancel();
});
Deno.test("reject tampered, expired, cross-project, non-OAuth and insufficient-scope tokens", async () => {
  installMock();
  try {
    const valid = await token();
    const parts = valid.split(".");
    parts[1] = encodeJson({
      sub: "intruder",
      iss: `${DEV_PROJECT_URL}/auth/v1`,
      aud: "authenticated",
      client_id: "chatgpt",
      exp: 9999999999,
    });
    for (
      const candidate of [
        parts.join("."),
        "invalid",
        await token({ exp: 1 }),
        await token({ iss: "https://another-project.test/auth/v1" }),
        await token({ client_id: undefined }),
        await token({ aud: "wrong" }),
      ]
    ) {
      const response = await handler(request(candidate));
      assert(
        response.status === 401,
        `Invalid token accepted: ${response.status}`,
      );
      await response.body?.cancel();
    }
    const scope = await handler(request(await token({ scope: "email" })));
    assert(scope.status === 403, "Insufficient scope was accepted");
    await scope.body?.cancel();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
Deno.test("read tools expose own data and public rules using user credentials", async () => {
  const calls = installMock();
  try {
    const access = await token();
    const listed = await handler(request(access));
    const tools = (await listed.json()).result.tools;
    assert(
      tools.length === 24 &&
        tools.every((t: { name: string; annotations: { readOnlyHint: boolean } }) =>
          t.annotations.readOnlyHint === (!["select_master","change_master","sync_game_progress","save_practice","accept_quest","record_game_notifications","update_account_profile","save_account_skills","prepare_account_avatar_upload"].includes(t.name))
        ),
      "Game actions must be advertised as writes",
    );
    const profile = await handler(
      request(access, "tools/call", { name: "get_my_profile", arguments: {} }),
    );
    const profileData = JSON.parse((await profile.json()).result.content[0].text).profile;
    assert(profileData.id === "owner", "Wrong profile");
    assert(profileData.avatar_url === `${DEV_PROJECT_URL}/storage/v1/object/sign/users/owner/avatar%20photo.jpg?token=test` &&
      profileData.background_url === `${DEV_PROJECT_URL}/storage/v1/object/sign/users/owner/background.png?token=test` &&
      Date.parse(profileData.image_urls_expires_at) > Date.now(),
      `Profile must provide absolute usable image links and their expiry: ${JSON.stringify(profileData)}`);
    assert(!tools.some((tool: { name: string }) => tool.name === "show_profile_image"), "Standalone image tool should no longer be advertised");
    const game = await handler(request(access, "tools/call", { name: "get_my_game", arguments: {} }));
    const gameData = JSON.parse((await game.json()).result.content[0].text);
    assert(gameData.game.id === "authored-game" && gameData.skills[0].id === "own-skill", "Wrong owned game data");
    const masters = await handler(request(access, "tools/call", { name: "get_my_master_games", arguments: {} }));
    const mastersData = JSON.parse((await masters.json()).result.content[0].text);
    assert(mastersData.masters[0].id === "master-one" && mastersData.skills[0].id === "master-skill", "Wrong linked Master data");
    assert(mastersData.masters[0].avatar_url === `${DEV_PROJECT_URL}/storage/v1/object/sign/users/master-one/master%20portrait.png?token=test` &&
      mastersData.masters[0].background_url === null, "Master images must resolve legacy URLs and tolerate missing images");
    for (const [kind, expected] of [
      ["practice_completions", "own-completion"],
      ["prayers", undefined],
      ["notifications", "welcome.v1"],
    ] as const) {
      const records = await handler(request(access, "tools/call", {
        name: "get_my_records", arguments: { kind, offset: 0 },
      }));
      const data = JSON.parse((await records.json()).result.content[0].text);
      assert(data.kind === kind && data.has_more === false, "Wrong records page");
      if (expected) assert(Object.values(data.records[0]).includes(expected), "Wrong record");
      else assert(data.records.length === 0, "Expected empty prayers");
    }
    assert(!tools.some((tool: { name: string }) => tool.name === "get_game_config"), "Obsolete config tool must not be advertised");
    const rulesResponse = await handler(request(access, "tools/call", { name: "get_game_rules", arguments: {} }));
    const rules = JSON.parse((await rulesResponse.json()).result.content[0].text);
    assert(JSON.stringify(rules) === JSON.stringify(BROWSER_RULES), "Official rules must match the browser");
    const progress = await handler(
      request(access, "tools/call", { name: "get_my_progress", arguments: {} }),
    );
    const result = JSON.parse((await progress.json()).result.content[0].text);
    assert(
      result.players[0].id === "own-game" &&
        !("completed_practice_seconds" in result),
      "Wrong progress",
    );
    const practiceTime = await handler(
      request(access, "tools/call", { name: "get_my_practice_time", arguments: {} }),
    );
    const practiceTimeData = JSON.parse((await practiceTime.json()).result.content[0].text);
    assert(
      Math.abs(practiceTimeData.total_tracked_practice_seconds - 33) < 1e-9 &&
        Math.abs(practiceTimeData.skills[2].completed_goal_target_seconds - 30) < 1e-9 &&
        practiceTimeData.skills[2].current_saved_practice_seconds === 3 &&
        practiceTimeData.skills[0].completed_goal_count === 0,
      "Practice time should combine completed goal targets with saved counters",
    );
    const manna = await handler(request(access, "tools/call", {
      name: "get_my_manna", arguments: { time_zone: "Asia/Tokyo" },
    }));
    const mannaData = JSON.parse((await manna.json()).result.content[0].text);
    assert(near(mannaData.annual_overview.gain, 11) && near(mannaData.rules.cycle_targets.day.amount, 240),
      "Annual gains must include completed goals and partial practice at the current target");
    const earth = mannaData.participants[0].skills[2];
    assert(mannaData.participants[0].master_name === "Master" && earth.skill_name === "Master Earth",
      "Manna must name the Master's skill, not the user's authored skill");
    assert(near(earth.completed_gain_at_current_settings, 10) && near(earth.current_cycle_bar.gain, 1) &&
      near(earth.current_cycle_bar.loss, -10) && near(earth.current_cycle_bar.value, -9),
      "Archived gains must not leak into the active skill bar");
    const badZone = await handler(request(access, "tools/call", {
      name: "get_my_manna", arguments: { time_zone: "not-a-timezone" },
    }));
    assert((await badZone.json()).result.isError, "Invalid calendar timezone must be rejected");
    assert(
      calls.filter((c) => c.url.pathname.startsWith("/rest/") || c.url.pathname.startsWith("/storage/")).every((c) =>
        c.auth === `Bearer ${access}`
      ),
      "Data requests must use user credentials",
    );
    const extra = await handler(
      request(access, "tools/call", {
        name: "get_my_profile",
        arguments: { user_id: "another-user" },
      }),
    );
    const extraResult = (await extra.json()).result;
    assert(
      extraResult.isError ||
        JSON.parse(extraResult.content[0].text).profile.id === "owner",
      "Caller overrode user identity",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
Deno.test("unavailable images do not prevent reading the profile", async () => {
  installMock({ imageFailure: true });
  try {
    const response = await handler(request(await token(), "tools/call", {
      name: "get_my_profile", arguments: {},
    }));
    const data = JSON.parse((await response.json()).result.content[0].text);
    assert(data.profile.id === "owner" && data.profile.avatar_url === null &&
      data.profile.background_url === null && data.profile.image_urls_expires_at === null &&
      data.profile.image_url_errors.avatar_url,
      "Image failures must be explicit while keeping the rest of the profile available");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
Deno.test("authenticated knowledge resources match official rules and keep private data out", async () => {
  installMock();
  try {
    const access = await token();
    const listing = await handler(request(access, "resources/list"));
    const listed = (await listing.json()).result.resources;
    assert(listed.length === 7 && listed.some((resource: { uri: string }) => resource.uri === "ui://magic/account-v2.html"),
      "Official rules and all UI resources should be advertised");
    const accountResponse = await handler(request(access, "resources/read", { uri: "ui://magic/account-v2.html" }));
    const account = (await accountResponse.json()).result.contents[0];
    assert(account.mimeType === "text/html;profile=mcp-app" && account._meta.ui.csp.connectDomains.join() === DEV_PROJECT_URL && account.text.includes("account-embed") && !account.text.includes("owner@example"), "Account resource must share presentation without embedding private data");
    const picker = await handler(request(access, "resources/read", { uri: "ui://magic/master-picker-v3.html" }));
    const pickerResource = (await picker.json()).result.contents[0];
    assert(pickerResource.mimeType === "text/html;profile=mcp-app" &&
      pickerResource._meta.ui.csp.connectDomains.length === 0 &&
      pickerResource.text.includes("Choose your Master"), "Master picker must be served as a self-contained MCP App");
    const anonymousPicker = await handler(request(undefined, "resources/read", { uri: "ui://magic/master-picker-v3.html" }));
    assert(anonymousPicker.status === 401, "Master picker resource must require OAuth");
    await anonymousPicker.body?.cancel();
    for (const uri of ["magicdev://game/rules"]) {
      assert(listed.some((resource: { uri: string; mimeType: string }) => resource.uri === uri && resource.mimeType === "application/json"),
        `Missing knowledge resource ${uri}`);
      const anonymous = await handler(request(undefined, "resources/read", { uri }));
      assert(anonymous.status === 401, "Resources must keep the same authentication as tools");
      await anonymous.body?.cancel();
      const response = await handler(request(access, "resources/read", { uri }));
      const content = (await response.json()).result.contents[0];
      assert(content.uri === uri && content.mimeType === "application/json", "Incorrect resource representation");
      const data = JSON.parse(content.text);
      assert(!content.text.includes('"owner"') && !content.text.includes("owner@example"), "Knowledge resource leaked connected user data");
      const tool = await handler(request(access, "tools/call", { name: "get_game_rules", arguments: {} }));
      const result = (await tool.json()).result;
      assert(JSON.stringify(data) === JSON.stringify(GAME_RULES) &&
        JSON.stringify(data) === JSON.stringify(JSON.parse(result.content[0].text)), "Official Resource, Tool and rules must be identical");
      assert(Object.keys(result).join() === "content", "Rules tool must return only immutable rules");
    }
    for (const uri of ["ui://magic/profile-image-v1.html", "game://config", "game://rules/manna", "game://examples/manna", "game://unknown"]) {
      const removed = await handler(request(access, "resources/read", { uri }));
      assert((await removed.json()).error, "Removed or unknown resources must not resolve");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
Deno.test("Game Master initialization, prompts and world resources use the authenticated MCP protocol", async () => {
  const calls = installMock();
  try {
    const access = await token();
    const initialized = await handler(request(access, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "generic-mcp-test", version: "1" },
    }));
    const init = (await initialized.json()).result;
    assert(init.instructions === GAME_MASTER_INSTRUCTIONS && init.capabilities.prompts &&
      init.capabilities.resources && init.capabilities.tools,
      "Initialization must advertise instructions and all standard capabilities to a generic client");
    const listing = await handler(request(access, "prompts/list"));
    const prompts = (await listing.json()).result.prompts;
    assert(prompts.length === 1 && prompts[0].name === "game_master",
      "Discover the single reusable Game Master prompt");
    const before = calls.length;
    const promptResponse = await handler(request(access, "prompts/get", { name: "game_master" }));
    const prompt = (await promptResponse.json()).result;
    assert(prompt.messages.length === 1 && prompt.messages[0].role === "user" &&
      prompt.messages[0].content.type === "text", "Prompt must use standard MCP messages");
    const text = prompt.messages[0].content.text;
    assert(text.startsWith("You are the Game Master of Magic Dev.") &&
      text.includes(GAME_MASTER_INSTRUCTIONS) &&
      WORLD_RESOURCES.every((resource) => text.includes(resource.text)),
      "Prompt must embed the same instructions and complete guides for clients without resource support");
    assert(calls.slice(before).every(({ url }) => url.pathname === "/auth/v1/user" ||
      url.pathname === "/rest/v1/profiles" || url.pathname.endsWith("/.well-known/jwks.json")),
      "Fetching a prompt must not fetch gameplay data or mutate state");
    const resourcesResponse = await handler(request(access, "resources/list"));
    const listed = (await resourcesResponse.json()).result.resources;
    for (const resource of WORLD_RESOURCES) {
      assert(listed.some((row: { uri: string; mimeType: string }) =>
        row.uri === resource.uri && row.mimeType === "text/markdown"), "World guide must be discoverable");
      const response = await handler(request(access, "resources/read", { uri: resource.uri }));
      const content = (await response.json()).result.contents[0];
      assert(content.text === resource.text && content.uri === resource.uri &&
        content.mimeType === "text/markdown", "World guide must return its registered content");
      assert(!content.text.includes("owner@example.test") && !content.text.includes('"owner"'),
        "Static world guides must not leak the authenticated player's data");
      const denied = await handler(request(undefined, "resources/read", { uri: resource.uri }));
      assert(denied.status === 401, "World guides retain the existing authentication boundary");
      await denied.body?.cancel();
    }
    for (const method of ["prompts/list", "prompts/get", "initialize"]) {
      const denied = await handler(request(undefined, method, { name: "game_master" }));
      assert(denied.status === 401, "Prompt and initialization access requires authentication");
      await denied.body?.cancel();
    }
    const unknown = await handler(request(access, "prompts/get", { name: "unknown" }));
    assert((await unknown.json()).error, "Unknown prompts must produce a protocol error");
    // Optional capabilities are never required before invoking existing tools.
    const fallback = await handler(request(access, "tools/call", { name: "get_my_progress", arguments: {} }));
    const saved = (await fallback.json()).result;
    assert(!saved.isError && JSON.parse(saved.content[0].text).players[0].master === "master-one",
      "Tools must remain usable without activating the prompt or reading resources");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("world mechanics derive all fixed Skill values from the authoritative catalog", () => {
  const guide = WORLD_RESOURCES.find((resource) => resource.name === "world-mechanics")!.text;
  for (const skill of GAME_RULES.skills) {
    const line = guide.split("\n").find((line) => line.startsWith(`| ${skill.skillColumn}`));
    assert(line?.includes(`| ${skill.fractalLabel} | ${skill.cycleLabel ?? "None"} | ${skill.cycleSeconds ?? "None"} | ${skill.practiceGoalSeconds ?? "No timed objective"} |`),
      "Mechanics guide must use the exact shared cycle and goal for each slot");
  }
});

Deno.test("Manna includes completion history beyond one PostgREST page", async () => {
  installMock({ historyLength: 1050 });
  try {
    const response = await handler(request(await token(), "tools/call", {
      name: "get_my_manna", arguments: {},
    }));
    const data = JSON.parse((await response.json()).result.content[0].text);
    assert(data.participants[0].skills[2].completed_goal_count === 1050 &&
      near(data.annual_overview.gain, 10501),
      "Manna must aggregate every page without truncation or double counting");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
Deno.test("locked accounts and mismatched user identities are refused", async () => {
  try {
    installMock({ locked: true });
    const locked = await handler(request(await token()));
    assert(locked.status === 403, "Locked account was accepted");
    await locked.body?.cancel();
    installMock({ userId: "someone-else" });
    const mismatch = await handler(request(await token()));
    assert(mismatch.status === 401, "Mismatched identity was accepted");
    await mismatch.body?.cancel();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
