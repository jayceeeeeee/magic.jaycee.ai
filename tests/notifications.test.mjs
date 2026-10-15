import { NotificationStore, isNotificationVisible, interpolateNotification, notificationOccurrence } from '../src/js/jaycee/notifications.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const linkedDefinition = { stage: 'linked_master' };
assert(notificationOccurrence(linkedDefinition, { id: 'player', level: 2, skill_2_start: 'second' })
  === 'player:2:second', 'Level 2 guidance must use the second quest clock');
assert(notificationOccurrence(linkedDefinition, { id: 'player', level: 3, skill_3_start: 'third' })
  === 'player:3:third', 'Level 3 guidance must use the third quest clock');
const storageMock = () => {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
};
const clientMock = () => {
  const api = { fail: false, calls: [], receipts: [], definitions: [
    { id: 'notice.v1', stage: 'guest', dismissible: true },
    { id: 'quest.v1', stage: 'guest', dismissible: false }
  ] };
  api.from = (table) => {
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, range() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: table === 'notifications' ? api.definitions : api.receipts }).then(resolve, reject); }
    };
    return query;
  };
  api.rpc = async (_name, args) => {
    api.calls.push(args.p_events);
    return { error: api.fail ? new Error('offline') : null };
  };
  return api;
};

const storage = storageMock();
const client = clientMock();
const guest = new NotificationStore({ client, storage });
await guest.load();
guest.record('notice.v1', 'dismissed');
const reloaded = new NotificationStore({ client, storage });
assert(reloaded.receipt('notice.v1').dismissed_at, 'Guest dismissal must survive reload');
assert(!isNotificationVisible(client.definitions[0], reloaded.receipt('notice.v1'), { hasAccount: false }), 'Dismissed notice must stay hidden');
assert(isNotificationVisible(client.definitions[1], { clicked_at: 'now', read_at: 'now' }, { hasAccount: false }), 'Clicking a quest must not complete it');
assert(!isNotificationVisible(client.definitions[1], { completed_at: 'now' }, { hasAccount: false }), 'Completed quest must stay hidden');
assert(!isNotificationVisible(client.definitions[0], null, { hasAccount: true }), 'Guest notices must not show for an account');

client.fail = true;
const account = new NotificationStore({ client, storage, userId: 'alice' });
await account.load();
assert(account.receipt('notice.v1').dismissed_at, 'Guest receipts must transfer to the account');
assert(Object.keys(account.state.pending).length === 1, 'Offline writes must remain queued');
assert(!storage.getItem('jaycee:notifications:v1:guest'), 'Guest state must be claimed only once');
const offlineReload = new NotificationStore({ client, storage, userId: 'alice' });
assert(offlineReload.receipt('notice.v1').dismissed_at, 'Account outbox must survive reload while offline');
client.fail = false;
await offlineReload.flush();
assert(Object.keys(offlineReload.state.pending).length === 0, 'Successful retry must drain outbox');
const callsBefore = client.calls.length;
offlineReload.record('notice.v1', 'dismissed');
assert(client.calls.length === callsBefore, 'Repeated dismissals must not send duplicate events');

const other = new NotificationStore({ client, storage, userId: 'bob' });
await other.load();
assert(!other.receipt('notice.v1'), 'Another account must not inherit account or claimed guest receipts');
client.receipts = [{ notification_id: 'notice.v1', occurrence: 'once', read_at: 'server-time' }];
const device = new NotificationStore({ client, storage: storageMock(), userId: 'alice' });
await device.load();
assert(device.receipt('notice.v1').read_at === 'server-time', 'Another device must restore receipts from DB');
device.record('quest.v1', 'clicked');
await device.flush();
assert(!device.receipt('quest.v1').completed_at, 'Recording a click must not complete a quest');
device.record('quest.v1', 'completed');
await device.flush();
assert(device.receipt('quest.v1').completed_at, 'Game resolution must persist');

const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
const restricted = new NotificationStore({ client, storage: brokenStorage, userId: 'alice' });
await restricted.load();
restricted.record('quest.v1', 'clicked');
await restricted.flush();
assert(restricted.receipt('quest.v1').clicked_at, 'Blocked browser storage must still allow account persistence');
assert(interpolateNotification('{name}: {missing}', { name: '<script>' }) === '<script>: {missing}', 'Interpolation must preserve text and unknown tokens');
assert(notificationOccurrence({ stage: 'linked_master' }, { id: 'p1', skill_1_start: 'start' }) !== notificationOccurrence({ stage: 'linked_master' }, { id: 'p2', skill_1_start: 'start' }), 'Different games must have different quest occurrences');
export const result = 'Notification tests passed: guest reload, claim, offline retry, deduplication, account isolation, remote restore, quest lifecycle, blocked storage, interpolation, occurrence scope.';
console.log(result);
