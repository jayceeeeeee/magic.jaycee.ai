# Unified game rules refactoring

## Result

`supabase/functions/game-mcp/game-rules.ts` defines the single authoritative,
versioned, deeply frozen `GAME_RULES` object. All Edge implementation is at the
function root. The frontend consumes automatically generated artifacts, with
source parity enforced by checks and tests. There are no manually edited copies.

## Files

Created:

- `supabase/functions/game-mcp/game-rules.ts`: fixed values, Skill mapping,
  nine documented equations, variables, units, normalization and conventions.
- `supabase/functions/game-mcp/manna.js`: canonical deterministic engine moved
  from the frontend, preserving saved-data and calendar behavior.
- `scripts/sync-game.ts`: explicit generation and read-only drift verification.
- `src/js/config/game-rules.js`: generated browser rules.
- `mcp/tests/game_rules_test.ts`: exact constants, frozen rules, synchronization,
  legacy arithmetic equivalence, balance parity and calendar regression tests.

Moved:

- `mcp/game-resources.ts` to `supabase/functions/game-mcp/mcp-resources.ts`.
  The old location is removed after updating all imports.
- `profile-image-widget.ts` to `resource-profile-image.ts`, identifying its role.

Removed:

- Both `game-config.js` adapters (Edge and browser). All consumers now use
  `GAME_RULES` directly. The redundant `get_game_config` tool and the three legacy
  knowledge resources were removed at the user's request.

Modified:

- `src/js/config/manna.js`: generated browser engine.
- `src/js/config/data.js` and `src/js/jaycee/game-editor.js`: direct rules consumers.
- `src/js/jaycee/profile-runtime.js`: uses fixed practice objectives and zones,
  including the first objective's practice duration.
- `supabase/functions/game-mcp/server.ts`: transport/auth only; tools moved into
  `mcp-tools.ts`, all resource registrations into `mcp-resources.ts`.
- `mcp/deno.json`, `scripts/check-frontend.ts`, `scripts/serve.ts`,
  `tests/browser.ps1`: synchronization guards and current test permissions.
- `mcp/tests/manna_test.ts`, `manna_examples_test.ts`, `server_test.ts`: canonical engine
  imports, fixed values, nine tools, official Resource/Tool parity and player APIs.
- `tests/game-page.test.mjs` and `tests/referrals.test.mjs`: direct rules fixtures.
- Repository/MCP/Supabase documentation: current architecture and usage.

## Constants and simplifications

- Five existing columns and Fractals preserved; Prayer remains the existing Moon
  default Skill label. Actual user/Master-defined Skill identities are untouched.
- Cycles: 31556926.08, 2551442.803, 86400, 3600 seconds, and null for Body.
- Fixed active practice objectives: 17280, 720, 30 seconds.
- Fixed zones: 40075017, 21944, 914, 38 integer meters, and null for Body.
- Life limit: 1000000 years; reference ratios: 1826.211, 24, 24.
- Runtime division for goals and zones removed. Legacy practice divisions produce
  exactly the new values. Previously fractional zones are rounded only after
  cumulative scaling; rounding each intermediate zone would give different results.
- Manna documentation derives from the nine equations in `GAME_RULES`; redundant
  `gain_per_completed_goal` and `practice_needed_to_offset_loss` catalog entries
  removed. Existing player-specific completed-gain output fields are preserved.
- Proportional conversion is an exported engine function. Month boundaries remain
  dynamic; fixed Moon cycles never use calendar-month duration.

## MCP compatibility

- Official JSON Resource: `magicdev://game/rules`.
- Parameterless read-only Tool: `get_game_rules`, returning the identical object.
- Eight player-specific tools remain usable. `get_game_rules` replaces the removed
  `get_game_config` tool; refresh client tool discovery after deployment.
- Three old knowledge resources and their response adapters were removed.
  Worked examples remain only as test fixtures in `manna_examples_test.ts`.
- The image UI resource is preserved. Total: nine tools, two resources (official
  rules and image viewer), zero prompts.
- Existing OAuth and account-lock checks still apply to requests. Rule payloads
  have no personal values, and their readers perform no player calculations.

## Validation and limits

- Deno MCP suite: 17 tests, including real signed test JWTs with mocked Auth/data.
- Deno entrypoint type check and static frontend audit.
- Chrome headless browser regression suite, including auth, current game UI,
  practice gating, Level 2/3 acceptance, skills, notifications and account saves.
- No schema, player data, authentication flow or database functions were changed.
  Existing SQL completion/deadline routines contain legacy constants; their
  practice arithmetic equals the fixed goals exactly. They remain outside this
  application/MCP refactoring to preserve the specified Supabase behavior.
- Changing canonical files requires regenerating browser artifacts and deploying
  the Edge function. Static website publication remains a separate existing step.
- Live authenticated client reconnection must be tested separately; automated
  integration tests mock database/Auth responses and do not mutate real accounts.

## Development deployment

Deployed to `magic-dev` (`mylnagvqngsgcmlvwttu`), function `game-mcp`, version 15,
on 2026-10-27, continuing the explicitly approved development deployment.
Production was not changed. This includes direct rules consumers, separated MCP
registration files, removal of `get_game_config` and removal of the three legacy
knowledge resources. Only rules and the image viewer remain registered.
The deployed eight source/configuration files were fetched back and matched
against the local files; all are at the function root. Live discovery returned
HTTP 200, and an anonymous `resources/list` request returned HTTP 401.
No live authenticated player call was performed during this refactoring.
