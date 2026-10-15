# Notifications

`sql/notifications.sql` is the canonical schema and catalog seed. It was applied to
the project's database as `notification_persistence_v1`, followed by
`notification_receipt_catalog_index` and `rename_notification_definitions_to_notifications`. Do not rerun
this initial schema on an existing installation; future changes need a new migration.

## Data model

- `notifications`: shared, ordered catalog. Guests and accounts can read
  enabled definitions. Only database administrators can edit them.
- `user_notifications`: one receipt per auth user, definition and occurrence.
  `read_at`, `dismissed_at`, `clicked_at`, and `completed_at` are independent timestamps.
  RLS restricts reads/inserts/updates to the owner; deleting an account removes receipts.
- `record_notification_events(jsonb)`: authenticated, invoker RPC. Batch limit 100;
  timestamps come from Postgres and retries never clear existing timestamps.

Information notices disappear after **Ok** (`read`) or **x** (`dismissed`). Quest
buttons record `clicked`, but quests remain visible until their saved game condition
changes. Account creation resolves `create_account.v1`; a saved Master link resolves
`choose_master.v1`. The linked quest is scoped to the player, saved level and current
skill's start date. Later levels omit the initial energy-link introduction.
Notification receipts never grant game progress.

Level 2 first shows `level_two_unlocked.v1` and `level_two_prepare.v1`. The reminder
names the Master's passive and first active skill and asks the player to review their
description resources. It has an **Accept** button; opening resources is not tracked
or enforced. The existing linked quest is hidden until acceptance. The authenticated
`accept_level_two_quest` RPC locks the owned player, saves `level_2_accepted_at`,
starts `skill_2_start`, and completes the preparation receipt atomically. Retries keep
the accepted clock. Level 2 practice and advancement are blocked until acceptance;
existing practice is preserved. Earlier skills remain available. New Level 2 players
receive no second quest clock until Accept. Existing Level 2 players also see this
step; their old clock is replaced when they accept.

`sql/level_two_quest.sql` upgrades an existing installation with this flow and the
updated progression RPC. The two new notices use a stable `player-id:2` occurrence
so accepting (and changing the clock) does not replay an acknowledged unlock notice.

`sql/skill_progression.sql` reflects `skill_progression_v1`,
`simplify_skill_progression_v2` (which removed the practice-session table), and
`level_two_quest_acceptance` and subsequent upgrades, including
`completed_practice_history`. Its authenticated
`sync_skill_progress` RPC runs at page load and when practice is saved. It locks the
player row, saves the practice counter directly, checks the current skill's calculated
target, then atomically archives completed goals and resets only the completed
skill's start and practice counter (retaining any excess practice). Other skills'
clocks/counters are preserved. Completing the current quest also completes its
notification and increments the player level once. `sql/practice_goal_karma.sql`
awards one `profiles.years_burned` per completed practice goal, including earlier
skills and Level 4 practice. Multiple goals in one save award one year each;
partial practice, clock renewal and retried saves do not award additional years.
The next quest still waits for Accept, which starts its own clock.
Earlier skills remain usable and archive their completed goals without advancing
the current quest.
Completing the third active skill reaches Level 4, where timed quest progression ends.
Keep the RPC's target ratios aligned with `src/js/config/game-config.js`.
The life bar is `(age in years + years_burned) / 1000000`.

Manna supports Year, Month, Day and Hour target cycles. `profiles.manna_cycle` is
already text, so Hour requires no database migration. Each active skill has its own
Manna calculation from its saved start timestamp and practice counter:
`target = manna_target * passive_seconds / manna_cycle_seconds`,
`loss = -target * min(elapsed_seconds, passive_seconds) / passive_seconds`,
`gain = target * practice_seconds / quest_seconds`.
Other active skills' practice is not added to that skill's balance. Selection shows
the selected skill's result directly, without scaling a shared balance to match.
Targets below one unit retain their correct bar scale. An unaccepted current quest
is paused; earlier unlocked skills retain their independent calculations.

Selected skill details take priority over an ongoing practice's display. Below
Level 4, no selection uses the practiced skill, then the current quest's skill.
At Level 4, closing a description retains the last selected Manna view for the page;
with no selection history it defaults to the practiced skill or Skill 3. Switching
Master clears that selection history. Passive and Ultimate retain an annual overview using
the authenticated user's account creation date (`auth.users.created_at` from the session),
completed practice history and partial practice
from unlocked skills across the user's saved games. That
overview runs at every level, including while waiting to accept a quest. Its loss
clock never resets on skill completion, a Master switch or reaching Level 4;
elapsed loss remains capped at one year. The overview is not projected onto active skills. Calendar-month conversion for an
active skill uses its own start month. Manna remains derived from existing saved
clocks/counters; no new database balance column is created.

`sql/completed_practice_history.sql` adds `practice_completions`. Only complete goals
are recorded with four fields: `id`, `player_id`, `skill_number`, `completed_at`.
Each row represents one completed goal, including when a save contains several goals.
Owner and Master come from the linked player; durations come from the skill number
using the shared progression constants. The leftover time remains on `player`.
Incomplete practice creates no history row. `sql/simplify_practice_history.sql`
upgrades the initial wider table. Deleting a player also deletes its goal history.
At Level 4, natural clock expiry preserves practice and creates no completion row.
The private ownership-checked helper writes history while browsers have owner-only
read access. Row locks and the old start timestamp prevent duplicate completions
on retries. `sync_skill_progress` returns the owner's accumulated passive seconds;
the annual view adds these to partial practice before converting to the current
Manna target/cycle, so archiving does not erase earned annual credit. Past goals
whose counters were already cleared before this upgrade cannot be reconstructed.

Because targets are proportional to passive duration, the instantaneous currency
loss rate simplifies to `manna_target / manna_cycle_seconds` before the period cap
(for the same target-cycle length). Independent calculations do not force that
rate to differ; skill clocks, caps, practice durations and gains remain skill-specific.

## Level 3 and Master games

`sql/level_three_and_master_games.sql` was applied as `level_three_master_games`.
It adds `player.level_3_accepted_at` and extends acceptance to Levels 2 and 3 with
`accept_player_quest(player_id, level)`. The Level 2 RPC remains a compatibility
wrapper. Level 2 completion preserves `skill_3_start`; Level 3 cannot start or
advance before Accept. Existing Level 3 players also need to accept; their saved
practice is retained. Level 4 behavior is defined by the subsequent upgrade below.

Each level first displays an unlock notice, an account-feature unlock notice, and
a preparation quest. `level_two_map.v1` announces Map/Health/Manna editing;
`level_three_game.v1` announces the Skills editor. Notices use stable player/level
occurrences. Level 3 preparation names the passive, first and second active skills.
Preparation at either level includes the prior-skill practice reminder followed by
an invitation and carousel to choose another Master. The Level 2 text edited in the
database is preserved by the upgrade; only its action changes to `accept_quest`.

`switch_player_master` locks and checks the active participation and saves the new
profile link atomically. Switching is allowed before accepting a Level 2 or 3 quest,
or when first choosing a Master. It is blocked during accepted quests. Each Master's
game retains its own participation and progress; a new game starts at Level 1.
Account Map and Skills unlocks use the highest level among the user's saved
participations, so switching does not remove earned account features.

The Skills section appears at Level 3, before quest acceptance. It edits five game
slots (passive, three active, ultimate). A selector shows one editable skill at a time;
Ultimate is disabled and marked Locked below Level 4, and becomes editable at Level 4.
Its saved name/resources are preserved when editing the other four slots. Description textareas start at one line,
grow with their text, and stop at 200px. Draft edits survive selector changes.
The account's main Save button saves changed skills through `save_own_game`; the
game/skills RPC is transactional, while the profile save remains a separate request.
Unchanged or hidden skill settings are not submitted. Incomplete drafts remain
editable. No special `profiles.role` is assigned.

`sql/master_eligibility_and_visibility.sql` was subsequently applied as
`master_eligibility_managed_visibility`. Master discovery and switching now share
`is_public_master`: the profile must be visible, have a username and game, and all
five skill slots must reference existing skills with nonblank names. The browser
loads this list through the invoker `list_public_masters` RPC, available to guests
and accounts.

Visibility defaults to `false`. The initial visibility upgrade restricted changes
to trusted database/backend access; the Level 4 upgrade below now permits earned
visibility changes. Game saves never change visibility. Public profile inserts by
browser roles remain forbidden. Existing visible profiles remain unchanged.
The legacy `save_own_game` publication argument is retained for compatibility;
`true` is rejected and false/omitted leaves visibility untouched. Apply upgrades
in order; rerunning the older Level 3 upgrade would restore obsolete function bodies.

The upgrade also adds indexed `skills.user_id`, attributes existing skills to their
sole game owner, and replaces unrestricted skill writes with owner-only policies.
Shared/unowned legacy slots are cloned on save. Game/skill authoring requires an
owned participation at Level 3 or higher through the invoker `can_author_game` helper.
No other player's skills can be edited through the editor or direct table updates.

## Level 4 and permanent accounts

`sql/level_four_permanent_accounts.sql` was applied as `level_four_permanent_accounts`.
Completing Level 3 automatically reaches Level 4 with no preparation/Accept step.
`level_four_unlocked.v1` announces the level, and `level_four_permanent.v1` announces
the permanent link/account and visibility control. `{masterName}` comes from the
profile currently linked by `profiles.master`. Both notices are dismissible and
use stable player/level occurrences. The timed linked quest is hidden at Level 4.

Ultimate is a description-only ability, like Passive: no countdown, target, Start
button or practice timer. Earlier active skills retain their descriptions' countdown,
practice progress and Start/Stop controls at Level 4. Completed practice goals
continue burning one year each, without further levels or quest notifications.

`sql/level_four_repeating_skill_cycles.sql` was applied as
`level_four_repeating_skill_cycles`. On Level 4+ sync, expired or missing active-skill
start timestamps restart at the current server time. Only the affected clocks
change: practice counters, level, rewards, accepted state and permanent milestone
are preserved. Durations match game-config.js (2551442.803, 86400 and 3600 seconds).
Pre-Level 4 expired quests lock the account as described below. The page checks for expired
cycles each second and syncs only when needed, with one request at a time and a
retry delay on failure. Load/practice sync handles expiry while the page was closed.
Queued practice is flushed before a background renewal. Ongoing Level 4 practice
is retained and uses the new clock for future saves.

`profiles.permanent_account_at` records the milestone automatically when the linked
participation reaches Level 4. Existing linked Level 4+ profiles are backfilled.
The browser cannot forge this status below Level 4, clear it, change its timestamp,
or change the Master link after it is granted. The status survives participation
row changes and retains account authoring access. Permanent accounts are excluded
from quest-expiry locking.

`sql/quest_account_lock.sql` adds managed `profiles.locked` (default false).
The currently linked game determines the account deadline: Level 1 uses Skill 1;
an accepted Level 2/3 uses its own skill, while a pending Level 2 uses Skill 1
and a pending Level 3 uses Skill 2. Level 4/permanent accounts are exempt.
`sql/pending_quest_account_deadline.sql` upgrades the initial lock behavior.
Expiry preserves clocks/practice and rejects late practice
before progression. The lock commits as a normal RPC response, then the page
clears the session and redirects to `/`. Auth also checks on session load/login,
at the deadline and periodically while open. A server cron checks once per minute
even with the site closed. A lock bans Auth login/refresh, revokes all sessions,
and restrictive RLS denies authenticated writes/private reads with stale tokens.
Browser users cannot change the lock flag. To restore an account, set
`profiles.locked=false` as an administrator. The trigger removes the Auth ban and
restarts only the enforced skill's clock (the previous skill while awaiting Accept),
preserving all practice.
This upgrade follows the completed-practice-history upgrades; do not rerun older
progression replacements afterward.

At Level 4 the Master section reveals **Make my account visible**, saved using
the main account Save button. The profile trigger enforces the Level 4/permanent
milestone on direct API updates too. Accounts remain private until visibility is
explicitly changed; discovery still requires all five skills to be named. Ultimate
editing also unlocks at Level 4 so a player can finish configuring those five slots.

The account Master section displays the profile linked by `profiles.master`, with
its avatar/name and no Master editor. Its visibility control remains hidden below
Level 4. It disables making a private account public until all five names are present
and lists the missing slots live as skills are edited. Already visible accounts can
always be made private. The main Save button validates this state and saves changed
skills before enabling visibility, so newly entered names pass server validation.
`sql/visibility_requires_named_skills.sql` was applied as
`visibility_requires_named_skills`: the profile trigger rejects publication with
any missing/blank skill slot, including direct API requests. It shares the invoker
`has_named_game_skills` predicate with Master discovery. No new database columns
are added by this upgrade.

## Content and new notifications

Catalog JSON contains plain `text`, optional `component`, and optional `action` /
`actionLabel`. Supported components are `masters`, `karma_master`, `master_choices`,
and `linked_quest`; supported actions are `signup`, `accept_quest`, and legacy
`accept_level_two`. These map to existing DOM
builders in `profile-runtime.js`. Unknown components/actions do not execute code.
Never store executable HTML, scripts, arbitrary iframe URLs or callbacks in this table.

Text placeholders: `{lifeMaxYears}`, `{prayerKarmaYears}`, `{remainingKarmaYears}`,
`{firstActivePassiveTime}`, `{passiveSkillName}`, `{skillOneName}`, `{skillTwoName}`,
`{skillThreeName}`, `{skillFourName}` (Ultimate), `{masterName}`. Text may be an array
of paragraphs; values and text render as text nodes. `content.level` restricts a
notice to that player level, and `content.occurrence = "level"` uses a stable level receipt.
Avatars, carousels,
quest countdowns and dynamic Master copy remain code-owned components.

Stages: `guest`, `account`, `choose_master`, `linked_master`. The browser derives
eligibility from the current viewer's account and Master link, including on public
game pages. To add a new stage or component, implement its renderer/eligibility first.
To edit copy while preserving acknowledgements, keep the definition ID. To deliberately
announce something again, seed a new versioned ID, e.g. `prayer_learned.v2`.
Disable obsolete definitions with `enabled = false`; retain their receipts.

## Guests, offline use and sessions

Guests use browser-local receipts, with no anonymous Supabase account or public
receipt-writing endpoint. Their outbox is claimed once by the next account opened
on that browser. It is moved into that account's durable local outbox before the
guest copy is removed, so a failed upload can retry without leaking into a second
account. Guest activity belongs to the browser, so a shared browser cannot identify
different signed-out people. Signing out starts a fresh guest notification history.

Account caches/outboxes are namespaced by auth user ID. Network failures keep queued
events and a visible sync status. Retries run on reconnect, return to the tab, or
page restoration. Successful loads restore receipts from Supabase for other devices;
storage events share local acknowledgements between tabs. Identity changes reload
the game so stale state cannot be attributed to the next account.

After a successful full receipt fetch, the database replaces acknowledged local
history, including deleted receipts and timestamps reset to null. Unsynced outbox
actions are retained and retried. An offline/failed fetch keeps the cached history.
When manually resetting a quest for testing, reset its player acceptance/clock and
the corresponding notification receipts, then reload the page. Resetting only the
player does not clear an already read unlock notification.

If local storage is blocked, the notification store works in memory and authenticated
RPC writes still work. Guest state and unsent events cannot survive closing the page
without working browser storage. Clearing browser data also clears guest receipts.
Historic dismissals before this feature cannot be reconstructed.

## Verification

`sql/first_master_selection_deadline.sql` extends the account lock to first-time
Master selection: one Skill 1 passive/Moon cycle (2551442.803 seconds) from Auth
account creation. Only unlinked, nonpublic, nonadmin, nonpermanent profiles with
no previous participation qualify. The existing minute cron and login access check
both enforce this deadline, even while the browser is closed. Linking a Master
replaces it with the usual game deadline. An administrator unlock starts a fresh
selection cycle via the managed `master_selection_started_at` field; browsers
cannot edit that field. The carousel countdown uses the same duration and start.

- `supabase/tests/first_master_selection_deadline.sql`: initial deadline,
  reconnect/offline locking, exemptions, managed clock and admin unlock. Rolled back.

- `tests/notifications.test.mjs`: guest reload, one-time claim, offline outbox/retry,
  deduplication, account isolation, remote restore, quest lifecycle and blocked storage.
  With Node installed: `node --experimental-default-type=module --test tests/notifications.test.mjs`.
- `tests/level-two-quest.test.mjs`: Level 2 visibility before/after acceptance,
  stable unlock receipts, quest clock changes, other levels and dynamic skill names.
- `tests/level_two_quest.sql` (under `supabase/`): authenticated acceptance, paused
  advancement, retry/reload clock stability, preserved practice, receipt writes,
  ownership and Level 1/3 behavior, all rolled back. Requires a Level 2 player.
- `tests/level-three-quest.test.mjs`: Level 3 preparation/acceptance and receipt scope.
- `tests/level-three.browser.ps1`: headless Chrome checks for rendering, italic skill
  names, carousel selection, practice/countdown gating, editor validation/save and
  live Skills unlocking. Uses mocks and writes its harness only to TEMP.
- `supabase/tests/level_three_master_games.sql`: real-role Level 3 progression,
  acceptance, authoring/managed visibility, owner-only skill edits, level gating and
  switching. All game/player/profile/receipt test changes are rolled back.
- `supabase/tests/master_eligibility_and_visibility.sql`: private saves, forbidden
  browser visibility changes, legacy publication protection, anonymous discovery,
  missing slots and blank skill names. All test changes are rolled back.
- `tests/level-four.test.mjs`: unlock receipt scope, dismissal, and absence of a Level 4 quest/Accept.
- `tests/manna.test.mjs` (run through the browser harness): independent skill clocks,
  practice isolation and skill-specific gains, Hour and calendar-month conversion,
  fractional targets, passive loss caps, pending quest pause, annual passive view
  and last-selection/Skill 3 fallback at Level 4, plus annual credit continuity
  after archiving and aggregation without double-counting partial practice.
- `supabase/tests/level_four_permanent_accounts.sql`: automatic Level 4 transition,
  permanent milestone/link, practice goal karma without further levels, visibility authorization,
  complete public game discovery and permanent access after participation changes.
  All fixture changes are rolled back.
- `supabase/tests/level_four_repeating_skill_cycles.sql`: only expired clocks renew,
  practice/level/rewards/milestones remain unchanged, practice saves survive renewal,
  stale cycle saves are ignored and earlier quest clocks do not renew. Rolled back.
- `tests/notifications.sql`: execute as postgres with two existing auth users. It
  exercises the actual `anon` / `authenticated` roles, idempotency and RLS allow/deny
  paths inside a transaction which is rolled back.
- `supabase/tests/completed_practice_history.sql`: partial practice, natural expiry,
  complete-only history, isolated skill resets, retained excess, retry deduplication,
  multiple goals, level progression, owner-only reads and forbidden browser inserts.
  All fixture/history/reward changes are rolled back.
- `supabase/tests/quest_account_lock.sql`: current versus pending/permanent quests,
  expiry before late saves, managed lock protection, Auth ban/session revocation,
  stale-token denial, administrator unlock and background enforcement. Rolled back.
- `tests/quest-lock-auth.test.mjs` (through the browser harness): automatic logout,
  expired/banned login rejection, restored login and deadline scheduling with mocks.
