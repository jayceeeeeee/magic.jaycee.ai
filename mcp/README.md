# Game MCP (development)

The development version exposes twenty-five authenticated tools. Sixteen are read-only;
nine actions write through the existing database APIs. `save_practice`,
`record_game_notifications` and `prepare_account_avatar_upload` are app-only.

**`show_account`** ("affiche mon compte") opens the Account panel separately from
the game. It imports the site's `account-panel.js`, `game-editor.js`, CSS and
embedded fonts; only panel positioning changes to fit the host. `account.js`
remains the site's bootstrap. Native website data/auth and MCP adapters feed the
same component. Every restored view revalidates saved data before mounting.

- `get_account_state`: saved panel fields, ordered own skills, Master identity,
  level unlocks and referral link, without opening a view.
- `update_account_profile`: patch character, Map/Manna, lore or visibility fields.
  Map unlocks at Level 2; lore/skills at Level 3; Ultimate/publication at Level 4.
  Permanent accounts retain all unlocks. Only explicitly allowed fields are writable.
- `save_account_skills`: five ordered own slots, through `save_own_game`.
  Level 3 saves must preserve the existing Ultimate. Publication requires a username
  and five named skills, saved first as on the site.
- `prepare_account_avatar_upload`: the native photo chooser requests an owner-scoped
  signed PUT URL, uploads directly to private Storage, then saves the filename.
  PNG/JPEG/WebP/GIF up to 5 MB; the server checks stored metadata before linking it.
  Credentials stay on the server. File selection/upload must be tested in ChatGPT
  as well as the browser harness because hosts can impose additional restrictions.

Account saves update model context with a completion event, without copying birth
details or other private values into an automatic conversation message. OAuth
disconnection stays in the host's plugin settings; the website Log out button is
hidden in this view. Referral links default to the dev Auth Site URL
`http://localhost:3000`; set Edge secret `MCP_SITE_URL` to the HTTPS **dev frontend**
origin when using a shared preview. They never default to production.

`tests/account-mcp-ui.ps1` verifies the bundled Account view, fonts, revalidation,
level gates, save failure/retry, skills/publication ordering, referral refresh,
file upload and model-context updates. Account tool tests additionally verify
owner scoping, protected fields, validation, publication and avatar paths.

The main entry point is **`show_game`** ("affiche le game"). It displays the same
main game shell, controller, notifications, profile HUD, abilities and practice
buttons as `game.html`. The MCP adapter supplies data and actions without creating
a browser Supabase session. `get_game_state` returns the saved snapshot without UI.
`sync_game_progress`, `accept_quest` and `change_master` expose focused actions;
Master changes retain the site's pending Level 2/3 restrictions.

Practice uses the site's `PracticeTimer`, measures elapsed time in the open UI,
checkpoints every ten seconds, and stops on visibility loss or teardown. Failed
saves retain their original cumulative counter for retry. The last unsaved slice
can be lost if the host destroys the iframe before a save completes. Reopening
loads saved progress; it does not resume an unattended timer. The model does not
receive an action for inventing practice seconds.

Important actions (Master selection, quest acceptance and level changes) update
model context and request a conversational follow-up. Practice Start/Stop updates
context silently. Notification dismissals and timer ticks do not create chat turns.
On mount, the UI revalidates the conversation's cached snapshot before rendering;
old notification receipts are never displayed while current state is loading.
It imports the site's delegated button-sound handler, including skill Start/Stop.
The site and full MCP view share Rajdhani and Share Tech Mono embedded in
`src/css/game-fonts.css` (pinned Google Fonts, SIL licenses under `licenses/fonts/`).
The existing optional Noto Sans SC stylesheet remains available for CJK text.

First-Master onboarding:

- `get_onboarding_state`: detects an account without a Master and returns its
  existing selection deadline. Start here when using the plugin with a new account.
- `show_master_picker`: renders the same carousel, profile dialog, Markdown and
  ability previews used by `game.html`, including featured/locked Masters and the
  saved referrer. Already-linked and expired accounts do not receive choices.
  Results explicitly mark database cards with `selectable` and `status` and
  include `locked_preview_masters` from the same catalog as the second carousel:
  Amaterasu, Moses, Muhammad, The greys and Sangje. These display-only characters
  have no database ID or selectable game and must not be described as available.
- `get_master_details`: reads only public preview fields for an offered Master.
- `select_master`: saves an explicit user choice using `switch_player_master`
  with the connected user's client. It checks account access first, refuses locked,
  self and unavailable choices, and does not support changing an existing Master.
  A repeated selection returns the existing participation without restarting it.

The first profile read also returns `onboarding.next_tool`. Installation/OAuth
alone does not trigger a UI; the client must invoke the onboarding/picker tool.
No packaged plugin skill is maintained in this repository.

Existing read tools:

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

The server exposes the authoritative JSON rules and four MCP Apps views.

| URI | Content |
| --- | --- |
| `magicdev://game/rules` | Complete versioned `GAME_RULES`, including documented equations and conventions |
| `ui://magic/profile-image-v1.html` | MCP Apps interface for showing profile images |
| `ui://magic/master-picker-v3.html` | Shared Master selector with an authenticated MCP adapter |
| `ui://magic/game-v3.html` | Complete main game interface using the site controller and an MCP data adapter |
| `ui://magic/account-v2.html` | Shared Account panel, own skill editor and photo chooser with an MCP adapter |

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
4. Ask to start the game or choose a Master. New accounts can select their first
   Master in the inline UI; this starts the Level 1 quest. Existing accounts can
   read their profile, progress, records and calculation rules.

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

The Master picker shares `src/js/jaycee/master-picker.js`, `skill-panel.js`,
`markdown.js` and `src/css/master-picker.css` with the website. The MCP entry point
`mcp/ui/master-picker.js` only adapts tool results and actions to the host bridge;
it has no browser Supabase session. Preview avatars are embedded for the sandbox.
The generator bundles these sources into
`supabase/functions/game-mcp/resource-master-picker.generated.ts`. Commit this
artifact; never edit it manually. Edge deployment needs no frontend files or
runtime filesystem reads. The featured/locked catalog and development account
mapping are authoritative in `supabase/functions/game-mcp/master-catalog.js`;
`sync-game.ts` generates the browser catalog and classic app-config mapping.

After modifying shared UI, styles, rules, catalog or assets:

```powershell
.tools/deno.exe run --allow-read --allow-write=src/js/config scripts/sync-game.ts
.tools/deno.exe run --allow-read --allow-write=supabase/functions/game-mcp --allow-run=.tools/deno.exe scripts/build-master-picker.ts
.tools/deno.exe run --allow-read scripts/build-master-picker.ts --check
```

The read-only check detects stale generated UI without running a bundler. Version
the UI URI when a change would break a cached view.

```powershell
.tools/deno.exe check --config mcp/deno.json supabase/functions/game-mcp/index.ts
.tools/deno.exe test --config mcp/deno.json --allow-env --allow-read mcp/tests/
.tools/deno.exe run --allow-read scripts/check-frontend.ts
powershell -NoProfile -ExecutionPolicy Bypass -File tests/browser.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/mcp-ui.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/game-mcp-ui.ps1
```

MCP tests use real signed test JWTs and mocked database/Auth responses. They check
signature verification, issuer, audience, expiry, OAuth client identity, required
scope, owner filters, locked accounts, rule parity and write/read annotations.
Onboarding tests cover selection deadlines, public previews, referral and locked
choices, write failures and retries. The MCP UI browser test mocks the host bridge
and verifies the shared dialog, Markdown, skill preview, mobile width and failed
save recovery; it writes a preview screenshot under `.tools/`.
They also check resource listing/reading, resource authentication, parity between
tools and resources, deterministic examples and absence of private data in rules.
Browser tests also cover login return paths and explicit consent/denial.

Both Deno import maps pin package versions; commit their lockfiles when updating
dependencies. Deploy `supabase/functions/game-mcp/` with all implementation files
at its root (`index.ts`, `server.ts`, `mcp-tools.ts`, `mcp-resources.ts`,
`resource-profile-image.ts`, `master-tools.ts`, `master-catalog.js`,
`resource-master-picker.generated.ts`, `game-tools.ts`, `resource-game.generated.ts`,
`resource-ui-assets.generated.ts`, `game-rules.ts`, `manna.js`, `deno.json`). No external local
dependencies or parent-directory paths are required in the deployment.

File responsibilities are explicit:

- `server.ts`: HTTP transport, OAuth authentication and request-scoped registration.
- `mcp-tools.ts`: read tools and registration of the onboarding tools.
- `master-tools.ts`: onboarding state, Master previews and first selection.
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
the advertised MCP tools. Before production, define client-specific RLS/RPC permissions
and token audience/resource binding, test revocation, choose the hosted consent
page origin, and review the deployment configuration. Do not remove the dev guard
or point this endpoint at the live game as a shortcut.

References: [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server),
[OpenAI authentication guide](https://developers.openai.com/plugins/build/auth),
[Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
