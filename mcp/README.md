# Game MCP (development)

The development version exposes nine authenticated, read-only tools:

- `get_my_profile`: all saved profile fields for the connected user, including
  birth details, lore, karma, manna target/unit/cycle, plus their Auth email.
  `profile.avatar_url` and `profile.background_url` are absolute signed image
  links usable without authentication, valid for one hour. Refetch after
  `image_urls_expires_at`. Missing images have null URLs; signing failures are
  reported in `image_url_errors` without blocking the rest of the profile.
- `show_profile_image`: displays the own or a linked Master's avatar/background
  through a registered MCP Apps image viewer. It returns `structuredContent` and
  a versioned UI resource with the Supabase image origin allowed by its CSP.
  This avoids relying on external Markdown image rendering or filesystem downloads.
  Hosts without MCP Apps UI support can still use the returned signed link.
- `get_my_progress`: connected user's saved levels, current practice counters,
  cycle starts and accepted quests. Saved values do not include a
  timer still running in a browser tab. At most 100 player records are returned.
- `get_my_practice_time`: recorded practice reconstructed from completed goal
  counts and current counters, grouped by slot across participations.
- `get_my_manna`: annual gross gains, passive losses and net balance, completed
  and partial gains per participation/Master/skill, plus every unlocked active
  skill's current-cycle bar. Includes cycle targets and the formulas for arbitrary
  durations. Pass `time_zone` (e.g. `Asia/Tokyo`) to match the browser's calendar
  month calculation; the default is UTC. Historical gains are valued with the
  current profile settings because completions contain no historical target snapshot.
- `get_my_game`: the connected user's authored game and up to 100 own skills.
- `get_my_master_games`: public game/skill definitions for Masters linked to the
  connected user's participations, with the same signed image fields on each Master.
- `get_my_records`: own practice completions, prayers or notification receipts,
  in pages of 50 with `kind` and `offset`.
- `get_game_rules`: the complete, immutable `GAME_RULES` catalog, without player
  data or calculations. Identical to `magicdev://game/rules`.

`get_game_rules` replaces the removed `get_game_config` tool. Refresh tool
discovery in existing clients after deployment.

The server exposes two resources: the authoritative JSON rules and the MCP Apps
image viewer. The three legacy knowledge views have been removed.

| URI | Content |
| --- | --- |
| `magicdev://game/rules` | Complete versioned `GAME_RULES`, including documented equations and conventions |
| `ui://magic/profile-image-v1.html` | MCP Apps interface for showing profile images |

`supabase/functions/game-mcp/mcp-resources.ts` builds these representations from
the authoritative `game-rules.ts` in the same directory.
Worked examples are kept only in `mcp/tests/manna_examples_test.ts` as regression
fixtures, not shipped by the server.
The resources explain the rules; tools execute personal calculations with the user's
records. No prompts or packaged plugin skills are registered yet.

Manna is computed from saved profile/progress fields and elapsed time; it is not
a stored wallet balance. `supabase/functions/game-mcp/manna.js` is the one maintained
calculation engine. All game consumers use `GAME_RULES` directly; there is no
`game-config.js` adapter, legacy configuration resource or `get_game_config` tool.
The browser files in `src/js/config/` are generated from these canonical sources.
The annual view includes completion history; an active bar includes only its own
current cycle. Months use the calendar month at the view's start, while the Moon
skill's passive cycle is a fixed duration. These tools only read the connected
user's private records and the public Master definitions. All Edge implementation
files are now at the function root; no import reaches into frontend or `mcp/` files.
Changing local sources still requires redeploying the MCP to update its running
version. Resources are served by the MCP, not a separate remote code store.

## Editing rules and synchronizing the website

Edit **only** `supabase/functions/game-mcp/game-rules.ts` for constants and rule
documentation, and `manna.js` there for engine changes. Do not edit generated
`src/js/config/game-rules.js` or `manna.js` manually.

```powershell
.tools/deno.exe run --allow-read --allow-write=src/js/config scripts/sync-game.ts
.tools/deno.exe run --allow-read scripts/sync-game.ts --check
```

The generator copies the JavaScript-compatible TypeScript rules (removing its
single const assertion) and engine, rewriting only local rules imports. Commit
the artifacts for the existing static host. The development server, frontend
audit, browser suite and MCP checks reject stale artifacts. No runtime fetch of
rules, additional service or frontend access to Supabase source files is needed.

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

The consent login keeps its `authorization_id` through signup. Signup only asks
for an email and password; lore, name entry and prayer are optional narrative
steps outside the signup flow. After signup, users return directly to consent. MCP email
confirmation links return to `/login.html?confirmation=mcp`; configure the Auth redirect
allow list to accept this URL with its query string on each frontend origin
(for local development, `http://localhost:3000/**`). The email tab confirms the account
and asks the user to return to the original connection window. That original window
resumes consent once the shared session is verified, including when focused again.
The email tab never redirects to ChatGPT because it lacks the initiating window's
OAuth context.
An expired authorization request must be restarted from the connecting application.

## Verify and deploy

```powershell
.tools/deno.exe check --config mcp/deno.json supabase/functions/game-mcp/index.ts
.tools/deno.exe test --config mcp/deno.json --allow-env --allow-read mcp/tests/
.tools/deno.exe run --allow-read scripts/check-frontend.ts
powershell -NoProfile -ExecutionPolicy Bypass -File tests/browser.ps1
```

MCP tests use real signed test JWTs and mocked database/Auth responses. They check
signature verification, issuer, audience, expiry, OAuth client identity, required
scope, owner filters, locked accounts, rule parity and the advertised read-only tools.
They also check resource listing/reading, resource authentication, parity between
tools and resources, deterministic examples and absence of private data in rules.
Browser tests also cover login return paths and explicit consent/denial.

Both Deno import maps pin package versions; commit their lockfiles when updating
dependencies. Deploy `supabase/functions/game-mcp/` with all implementation files
at its root (`index.ts`, `server.ts`, `mcp-tools.ts`, `mcp-resources.ts`,
`resource-profile-image.ts`, `game-rules.ts`, `manna.js`, `deno.json`). No external local
dependencies or parent-directory paths are required in the deployment.

File responsibilities are explicit:

- `server.ts`: HTTP transport, OAuth authentication and request-scoped registration.
- `mcp-tools.ts`: all `registerTool` calls and their handlers.
- `mcp-resources.ts`: all `registerResource` calls and resource readers.
- `resource-profile-image.ts`: HTML/UI content for the image resource.
- `game-rules.ts`: authoritative data catalog, independent of MCP registration.
- `manna.js`: deterministic calculations used by tools and the browser.

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
