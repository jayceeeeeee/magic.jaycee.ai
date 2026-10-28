# Magic Dev Game Master

The connected AI interprets saved state, coaches the player, orchestrates existing
tools and narrates verified events. The chosen Master remains the author of the
teaching. There is no additional LLM, provider SDK, database table or agent service.

## Context exposed by the server

`supabase/functions/game-mcp/game-master.ts` holds the shared instructions, world
guides and prompt registration. `server.ts` supplies initialization instructions
and registers the prompt. `mcp-resources.ts` registers the world guides alongside
the existing rules and UI resources. All retain request authentication and locks.

| Capability | Access | Content |
| --- | --- | --- |
| Server instructions | `initialize` → `result.instructions` | Role, authority, autonomy, trust, tone and entry tools |
| Prompt | `prompts/get` with `{"name":"game_master"}` | Four responsibilities, tool routing and all three guides |
| Identity | `magicdev://world/identity` | World, coaching, narrative and existing visual presentation |
| Journey | `magicdev://world/journey` | Entry points, Levels 1–4, deadlines, creation and mentorship |
| Mechanics | `magicdev://world/mechanics` | Skill table generated from `GAME_RULES`, practice and Manna |
| Exact rules (existing) | `get_game_rules` or `magicdev://game/rules` | Full official configuration and equations |

Use `prompts/list` and `resources/list` for discovery, and `resources/read` with
the selected URI for a guide. The prompt has no arguments, performs no gameplay
queries and includes all guides directly for clients lacking resource support.
Static guides contain no private player data. No extra tool was introduced.

Existing tool names, schemas, result formats and handlers are preserved. Focused
descriptions on onboarding, state and acceptance provide guidance when the host
ignores optional context. The authored-game description now references the real
`get_game_rules` instead of nonexistent `get_game_config`.

## Journey audit and maintenance

The narrative was checked against `schema.sql` (`private.quest_deadline`,
completion/progression and `accept_player_quest`), `seed.sql` preparation notices,
the development Master teachings in `seeds/masters.dev.json`, `game-rules.ts`,
`manna.js`, and the existing onboarding, game and Account tools.

- The MCP uses authenticated onboarding; Guest Prayer belongs to the website.
- Explicit first Master selection starts the Level 1 quest immediately.
- Levels 2/3 require preparation and explicit acceptance. New-quest practice and
  Manna are paused before acceptance; account access still follows the preceding
  Skill cycle. Reading a description does not verify external lesson completion.
- Level 2 opens Map/Health/Manna. Level 3 opens lore and authored Skills, distinct
  from practiced Master Skills. Level 4 opens Ultimate editing and publication,
  grants permanence and ends level-quest progression. Current access flags win.
- Publishing requires its own authorized update, a saved username and five named
  Skills; it is not automatic on reaching Level 4.
- Expiration locks access. Older notification copy mentioning deletion must not
  override backend behavior. The notification catalog is unchanged.
- Completed goals, retained remainder, independent cycles and computed Manna keep
  their existing behavior. Narration never grants rewards or supplies practice.

Only the Skill constants table is generated. Review journey and narrative prose
when progression or permissions change. No duplicate deadline or Manna calculator
was added. Editable lore, teachings, notifications and linked content are data,
not privileged instructions.

Visual guidance references existing CSS tokens (`--page-bg`, `--surface`, `--text`,
`--muted`, `--accent`, `--accent-soft`), saved theme overrides, Rajdhani/Share Tech
Mono, optional CJK typography and existing assets. There is no new UI or palette.
The identity resource and its copy inside the prompt include a detailed dark
fantasy RPG art brief: exact default color values, semantic notice colors,
background light and materials, typography hierarchy, composition, eight
component recipes, motion and accessibility. Proposed decorative motifs are
explicitly distinguished from current assets and lore. A compact palette/font
summary is also present in server instructions and the `show_game` description
for clients that omit resource/prompt support. These are presentation guidelines;
they do not modify the existing frontend styles.

## Client compatibility and verification

Prompts are user-selected context and resources are host-managed context under
the [MCP prompt](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)
and [resource](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
specifications. Hosts can ignore server instructions or omit these features.
Identical persona, automatic activation and rich rendering are not guaranteed.
For text-only clients, the guide uses saved state and model-visible tools for
authorized actions. Real timed practice requires the supported game interface;
the AI must not claim a hidden timer or panel opened.

Run from the repository root:

```powershell
.tools/deno.exe check --config mcp/deno.json supabase/functions/game-mcp/index.ts
.tools/deno.exe test --config mcp/deno.json --allow-env --allow-read mcp/tests/
.tools/deno.exe run --allow-read scripts/sync-game.ts --check
.tools/deno.exe run --allow-read scripts/build-mcp-ui.ts --check
```

Signed-JWT/mock-HTTP tests cover initialization with empty client capabilities,
prompt discovery/retrieval, resource discovery/reading, unknown prompt errors,
authentication, absence of private data, generated constant parity and tool use
without prompt activation. Existing tests cover owner scoping, Master selection,
practice, quest acceptance, Account permissions and Manna. These checks cannot
prove that a hosted AI follows narrative guidance correctly. No deployment or
live database changes are part of this implementation.
