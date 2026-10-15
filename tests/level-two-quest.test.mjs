import { isLevelTwoQuestPending, isNotificationVisible, notificationOccurrence, interpolateNotification } from '../src/js/jaycee/notifications.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pending = { id: 'player-a', level: 2, skill_2_start: 'old-clock', skill_2_practice: 10 };
const active = { ...pending, level_2_accepted_at: 'accepted', skill_2_start: 'accepted' };
const unlock = { stage: 'linked_master', dismissible: true, content: { level: 2, occurrence: 'level' } };
const prepare = { stage: 'linked_master', content: { level: 2, occurrence: 'level', action: 'accept_level_two' } };
const quest = { stage: 'linked_master', content: { component: 'linked_quest' } };
const visible = (definition, player, receipt = null) => isNotificationVisible(definition, receipt, {
  hasAccount: true, hasMaster: true, player
});

assert(isLevelTwoQuestPending(pending), 'Existing Level 2 players must accept before continuing');
assert(visible(unlock, pending) && visible(prepare, pending), 'Show unlock and resource reminder together');
assert(!visible(quest, pending), 'Hide existing quest until acceptance');
assert(!isLevelTwoQuestPending(active) && !visible(prepare, active), 'Acceptance hides preparation');
assert(visible(quest, active), 'Acceptance reveals existing quest');
assert(visible(unlock, active), 'Acceptance must not dismiss the unlock message');
assert(!visible(unlock, active, { read_at: 'read' }), 'Unlock acknowledgement persists after acceptance');
assert(notificationOccurrence(unlock, pending) === notificationOccurrence(unlock, active), 'Accepting must not change unlock receipt scope');
assert(notificationOccurrence(prepare, active) === 'player-a:2', 'Preparation is scoped per player and level');
assert(notificationOccurrence(quest, active) !== notificationOccurrence(quest, pending), 'Quest occurrence uses accepted clock');
assert(notificationOccurrence(unlock, { ...active, id: 'player-b' }) !== notificationOccurrence(unlock, active), 'Games must have separate unlock receipts');
for (const level of [1, 4]) {
  const player = { ...pending, level };
  assert(!visible(unlock, player) && !visible(prepare, player), 'Level 2 notices must not appear at other levels');
  assert(visible(quest, player), 'Other quests remain visible without Level 2 acceptance');
}
assert(!isNotificationVisible(prepare, null, { hasAccount: false, hasMaster: false, player: pending }), 'Guests cannot accept Level 2');
assert(interpolateNotification('{passiveSkillName} and {skillOneName}', {
  passiveSkillName: '<Passive>', skillOneName: 'Skill One'
}) === '<Passive> and Skill One', 'Resource reminder uses actual skill names as text');

export const result = 'Level 2 tests passed: preparation, acceptance, unlock receipts, quest clocks, other levels, game isolation and skill names.';
console.log(result);
