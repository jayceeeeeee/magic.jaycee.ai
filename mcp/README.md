# Game MCP (development)

The development version exposes six authenticated, read-only tools:

- `get_my_profile`: all saved profile fields for the connected user, including
  birth details, lore, karma, manna target/unit/cycle, plus their Auth email.
- `get_my_progress`: connected user's saved levels, practice seconds, cycle starts,
  accepted quests and completed-practice seconds. Saved values do not include a
  timer still running in a browser tab. At most 100 player records are returned.
- `get_my_game`: the connected user's authored game and up to 100 own skills.
- `get_my_master_games`: public game/skill definitions for Masters linked to the
  connected user's participations.
- `get_my_records`: own practice completions, prayers or notification receipts,
  in pages of 50 with `kind` and `offset`.
- `get_game_config`: game constants, skill columns and cycle labels from the
  deployed copy of `src/js/config/game-config.js`.

The current manna balance is calculated in the browser from saved profile and
progress fields and elapsed time; it is not a stored database column. These
tools expose the inputs and public rules for calculations. They do not read
another user's private records. `src/js/config/game-config.js` is the only
maintained source. Before checking or deploying the function, generate its
deployment artifact from that source:

```powershell
.tools/deno.exe run --allow-read --allow-write scripts/build-game-mcp.ts
```

The generated file is ignored by Git. The MCP test checks its values against the
browser config. Run the build step again after changing the source, then redeploy.

Development endpoint:

`https://mylnagvqngsgcmlvwttu.supabase.co/functions/v1/game-mcp`

The Edge Function is in `../supabase/functions/game-mcp/`. It refuses to start
against any project other than `magic-dev`. It uses the public project key and
the connected user's token; it never uses a service-role key. Owner filters and
the existing database RLS apply to every data request. Locked accounts are denied.

## Run the development website

From the repository root, with the portable Deno downloaded during setup:

```powershell
.tools/deno.exe run --allow-read --allow-net=127.0.0.1:3000 scripts/serve.ts
```

Or use an installed `deno` in place of `.tools/deno.exe`. Open
`http://localhost:3000`. This serves only the website's HTML and `src/` assets;
database scripts, tests, tooling and Git metadata cannot be requested.

Development accounts are separate from production accounts. Create a dev account
using the normal game signup flow and confirm its email. Production credentials
will not sign you into this project.

## Connect in ChatGPT

1. Keep the local website running on port 3000. The browser handling sign-in must
   be on the same computer as the local server.
2. In ChatGPT's custom MCP/app configuration, add the development endpoint above
   and choose OAuth. Availability depends on the account/workspace settings.
3. Let the client register automatically. Sign in with a **development account**
   and approve the request on `/oauth-consent.html`.
4. Ask for your profile, progress, game records or calculation rules. All tools
   are read-only.

OAuth discovery is served at
`<endpoint>/.well-known/oauth-protected-resource`. The 401 challenge points clients
to this document. Supabase handles PKCE, client registration, access tokens and
refresh tokens. The requested identity scope is `profile`; discovery also
advertises `offline_access` for clients that request persistent access. The
handler rejects ordinary website login tokens without an OAuth `client_id`.

The development project's OAuth Server was enabled during setup. Its Site URL is
`http://localhost:3000` and Authorization Path is `/oauth-consent.html`, with dynamic
client registration enabled. For a shared preview, set the **dev project's** Site
URL and allowed redirects to that preview's HTTPS origin. Keep its frontend on
the development database.

## Verify and deploy

```powershell
.tools/deno.exe check --config mcp/deno.json supabase/functions/game-mcp/index.ts
.tools/deno.exe test --config mcp/deno.json --allow-env mcp/tests/server_test.ts
powershell -NoProfile -ExecutionPolicy Bypass -File tests/browser.ps1
```

MCP tests use real signed test JWTs and mocked database/Auth responses. They check
signature verification, issuer, audience, expiry, OAuth client identity, required
scope, owner filters, locked accounts, rule parity and the advertised read-only tools.
Browser tests also cover login return paths and explicit consent/denial.

Both Deno import maps pin package versions; commit their lockfiles when updating
dependencies. Deploy all files in `supabase/functions/game-mcp/` together.
The gateway JWT check is disabled for this function so OAuth discovery and custom
401 challenges can work; the function itself authenticates every MCP request.

A real development integration test on 2026-10-26 passed PKCE authorization,
token exchange, MCP initialization, tool discovery, the original two tool calls, and rejection
of missing, invalid and ordinary website tokens. Temporary users and OAuth client
registrations were removed after testing. ChatGPT's own account-linking UI still
requires a manual connection test.

## Before a production release

This endpoint is deliberately limited to the development project. Supabase's
`profile` scope controls identity information; it does **not** narrow database
permissions. OAuth tokens retain the user's existing database permissions outside
these two MCP tools. Before production, define client-specific RLS/RPC permissions
and token audience/resource binding, test revocation, choose the hosted consent
page origin, and review the deployment configuration. Do not remove the dev guard
or point this endpoint at the live game as a shortcut.

References: [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server),
[OpenAI authentication guide](https://developers.openai.com/plugins/build/auth),
[Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
