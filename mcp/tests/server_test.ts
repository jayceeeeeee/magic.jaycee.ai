import {
  createHandler,
  DEV_PROJECT_URL,
} from "../../supabase/functions/game-mcp/server.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
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
function installMock({ locked = false, userId = "owner" } = {}) {
  const calls: { url: URL; auth: string | null }[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    calls.push({ url, auth: req.headers.get("Authorization") });
    if (url.pathname.endsWith("/.well-known/jwks.json")) {
      return Promise.resolve(Response.json({ keys: [publicJwk] }));
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
      assert(
        url.searchParams.get("id") === "eq.owner",
        "Profile query must use the verified user ID",
      );
      return Promise.resolve(
        Response.json({ id: "owner", username: "Owner", locked }),
      );
    }
    if (url.pathname === "/rest/v1/player") {
      assert(
        url.searchParams.get("user_id") === "eq.owner",
        "Progress must be restricted to its owner",
      );
      return Promise.resolve(Response.json([{ id: "own-game", level: 2 }]));
    }
    if (url.pathname === "/rest/v1/rpc/get_practice_completion_totals") {
      return Promise.resolve(Response.json(3600));
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
Deno.test("only read tools are advertised; calls keep owner scope and user credentials", async () => {
  const calls = installMock();
  try {
    const access = await token();
    const listed = await handler(request(access));
    const tools = (await listed.json()).result.tools;
    assert(
      tools.length === 2 &&
        tools.every((t: { annotations: { readOnlyHint: boolean } }) =>
          t.annotations.readOnlyHint
        ),
      "Expected two read-only tools",
    );
    const profile = await handler(
      request(access, "tools/call", { name: "get_my_profile", arguments: {} }),
    );
    assert(
      JSON.parse((await profile.json()).result.content[0].text).profile.id ===
        "owner",
      "Wrong profile",
    );
    const progress = await handler(
      request(access, "tools/call", { name: "get_my_progress", arguments: {} }),
    );
    const result = JSON.parse((await progress.json()).result.content[0].text);
    assert(
      result.players[0].id === "own-game" &&
        result.completed_practice_seconds === 3600,
      "Wrong progress",
    );
    assert(
      calls.filter((c) => c.url.pathname.startsWith("/rest/")).every((c) =>
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
