import { isNotificationVisible, isQuestPending, notificationOccurrence } from '../src/js/jaycee/notifications.js';

const assert = (value, message) => { if (!value) throw new Error(message); };
const player = { id: 'player', level: 4 };
const options = { hasAccount: true, hasMaster: true, player };
const unlock = { stage: 'linked_master', dismissible: true, content: { level: 4, occurrence: 'level' } };
const permanent = { ...unlock };
assert(!isQuestPending(player), 'Level 4 must not need acceptance');
assert(isNotificationVisible(unlock, null, options) && isNotificationVisible(permanent, null, options), 'Level 4 must show both unlock notices');
assert(!isNotificationVisible(unlock, { read_at: 'read' }, options), 'Unlock acknowledgement must persist');
assert(isNotificationVisible(permanent, null, options), 'Unlock acknowledgement must not dismiss the permanent account notice');
assert(!isNotificationVisible({ stage: 'linked_master', content: { component: 'linked_quest' } }, null, options), 'Level 4 must not show another timed quest');
assert(!isNotificationVisible({ stage: 'linked_master', content: { action: 'accept_quest' } }, null, options), 'Level 4 must not show Accept');
assert(notificationOccurrence(unlock, player) === 'player:4', 'Level 4 notices must use stable level receipts');
for (const level of [1, 2, 3]) assert(!isNotificationVisible(unlock, null, { ...options, player: { ...player, level } }), 'Level 4 notice leaked to an earlier level');
export const result = 'Level 4 notification tests passed.';
console.log(result);
