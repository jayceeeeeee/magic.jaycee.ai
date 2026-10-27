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
- `get_game_config`: game constants, explicit practice targets, cycle labels and
  Manna rules/formulas from the shared calculation module. It returns the same
  configuration as the config resource and links to the three knowledge resources,
  so clients without resource browsing can still read the rules.

The server also exposes three authenticated JSON knowledge resources:

| URI | Content |
| --- | --- |
| `game://config` | Complete game constants, cycles, ratios and derived practice targets |
| `game://rules/manna` | Mathematical variables, formulas, per-skill models and balance behavior |
| `game://examples/manna` | Synthetic worked examples for active skills, annual balance and calendar months |

`mcp/game-resources.ts` builds these representations directly from the game modules.
Examples execute the actual calculation engine; they contain no connected user's data.
The resources explain the rules; tools execute personal calculations with the user's
records. No prompts or packaged plugin skills are registered yet.

Manna is computed from saved profile/progress fields and elapsed time; it is not
a stored wallet balance. `src/js/config/manna.js` implements the same calculation
for the browser bar and MCP, using constants from `src/js/config/game-config.js`.
The annual view includes completion history; an active bar includes only its own
current cycle. Months use the calendar month at the view's start, while the Moon
skill's passive cycle is a fixed duration. These tools only read the connected
user's private records and the public Master definitions. The function imports the
canonical modules directly from `src/js/config/`; there are no generated config or
math copies inside the Edge Function directory and no copy/build step.
Changes to those shared modules still require redeploying the MCP to update its
running version. Resources are served by the MCP, not a separate remote code store.

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
.tools/deno.exe test --config mcp/deno.json --allow-env mcp/tests/
powershell -NoProfile -ExecutionPolicy Bypass -File tests/browser.ps1
```

MCP tests use real signed test JWTs and mocked database/Auth responses. They check
signature verification, issuer, audience, expiry, OAuth client identity, required
scope, owner filters, locked accounts, rule parity and the advertised read-only tools.
They also check resource listing/reading, resource authentication, parity between
tools and resources, deterministic examples and absence of private data in rules.
Browser tests also cover login return paths and explicit consent/denial.

Both Deno import maps pin package versions; commit their lockfiles when updating
dependencies. Deploy from the repository so the bundler can resolve the entire
import graph: `supabase/functions/game-mcp/`, `mcp/game-resources.ts` and the two
canonical modules in `src/js/config/`. Uploading only the function directory is
no longer sufficient. The deployment bundle includes those imports automatically;
do not recreate copies of the config files in the Edge Function folder.
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
