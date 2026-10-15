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
`level_two_quest_acceptance`. Its authenticated
`sync_skill_progress` RPC runs at page load and when practice is saved. It locks the
player row, saves the practice counter directly, checks the current skill's calculated
target, then atomically completes the notification, increments the player level and
`profiles.years_burned`, clears the completed skill's practice and resets the quest
clocks. The Level 1 to Level 2 transition leaves `skill_2_start` empty until Accept.
Earlier skills remain usable but do not advance the current quest.
At levels above 3 the third active skill continues to supply the practice target.
Keep the RPC's target ratios aligned with `src/js/config/game-config.js`.
The life bar is `(age in years + years_burned) / 1000000`.

## Content and new notifications

Catalog JSON contains plain `text`, optional `component`, and optional `action` /
`actionLabel`. Supported components are `masters`, `karma_master`, `master_choices`,
and `linked_quest`; supported actions are `signup` and `accept_level_two`. These map to existing DOM
builders in `profile-runtime.js`. Unknown components/actions do not execute code.
Never store executable HTML, scripts, arbitrary iframe URLs or callbacks in this table.

Text placeholders: `{lifeMaxYears}`, `{prayerKarmaYears}`, `{remainingKarmaYears}`,
`{firstActivePassiveTime}`, `{passiveSkillName}`, `{skillOneName}`. Text may be an array
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

If local storage is blocked, the notification store works in memory and authenticated
RPC writes still work. Guest state and unsent events cannot survive closing the page
without working browser storage. Clearing browser data also clears guest receipts.
Historic dismissals before this feature cannot be reconstructed.

## Verification

- `tests/notifications.test.mjs`: guest reload, one-time claim, offline outbox/retry,
  deduplication, account isolation, remote restore, quest lifecycle and blocked storage.
  With Node installed: `node --experimental-default-type=module --test tests/notifications.test.mjs`.
- `tests/level-two-quest.test.mjs`: Level 2 visibility before/after acceptance,
  stable unlock receipts, quest clock changes, other levels and dynamic skill names.
- `tests/level_two_quest.sql` (under `supabase/`): authenticated acceptance, paused
  advancement, retry/reload clock stability, preserved practice, receipt writes,
  ownership and Level 1/3 behavior, all rolled back. Requires a Level 2 player.
- `tests/notifications.sql`: execute as postgres with two existing auth users. It
  exercises the actual `anon` / `authenticated` roles, idempotency and RLS allow/deny
  paths inside a transaction which is rolled back.
