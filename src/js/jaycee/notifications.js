const PREFIX = 'jaycee:notifications:v1:';
const emptyState = () => ({ receipts: {}, pending: {} });
const keyFor = (id, occurrence = 'once') => JSON.stringify([id, occurrence]);
const eventKey = (event) => JSON.stringify([event.notification_id, event.occurrence, event.action]);
const fields = { read: 'read_at', dismissed: 'dismissed_at', clicked: 'clicked_at', completed: 'completed_at' };
const browserStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export const interpolateNotification = (text, values) => String(text || '').replace(
  /\{([a-zA-Z]+)\}/g, (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token
);

export const isLevelTwoQuestPending = (player) => Number(player?.level) === 2 && !player?.level_2_accepted_at;

export const notificationOccurrence = (definition, player) => {
  if (definition.stage !== 'linked_master') return 'once';
  const level = Math.max(1, Number(player?.level) || 1);
  const key = `${player?.id || 'none'}:${level}`;
  return definition.content?.occurrence === 'level' ? key
    : `${key}:${player?.[`skill_${Math.min(3, level)}_start`] || 'none'}`;
};

export const isNotificationVisible = (definition, receipt, { hasAccount, hasMaster, player = null }) => {
  if (definition.content?.level && Number(player?.level) !== definition.content.level) return false;
  if (definition.content?.component === 'linked_quest' && isLevelTwoQuestPending(player)) return false;
  if (definition.content?.action === 'accept_level_two' && !isLevelTwoQuestPending(player)) return false;
  const eligible = definition.stage === 'guest' ? !hasAccount
    : definition.stage === 'account' ? hasAccount
      : definition.stage === 'choose_master' ? hasAccount && !hasMaster
        : definition.stage === 'linked_master' ? hasAccount && hasMaster : false;
  return eligible && !receipt?.completed_at
    && !(definition.dismissible && (receipt?.read_at || receipt?.dismissed_at || receipt?.clicked_at));
};

// Local storage is a guest store and an account-scoped durable outbox, never an auth credential.
export class NotificationStore {
  constructor({ client, userId = null, storage = browserStorage(), onChange = () => {} }) {
    Object.assign(this, { client, userId, storage, onChange });
    this.storageKey = PREFIX + (userId || 'guest');
    this.state = this.read(this.storageKey, emptyState());
    this.definitions = this.read(PREFIX + 'catalog', []);
    this.error = '';
    this.durable = Boolean(storage);
    this.inFlight = null;
  }

  read(key, fallback) {
    try {
      const value = JSON.parse(this.storage?.getItem(key) || 'null');
      if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
      return value?.receipts && value?.pending ? value : fallback;
    } catch { return fallback; }
  }

  write(key, value) {
    try { this.storage?.setItem(key, JSON.stringify(value)); return Boolean(this.storage); }
    catch { return false; }
  }

  mergeLocal() {
    const stored = this.read(this.storageKey, emptyState());
    for (const [key, receipt] of Object.entries(stored.receipts)) {
      this.state.receipts[key] = { ...this.state.receipts[key], ...receipt };
    }
    this.state.pending = { ...this.state.pending, ...stored.pending };
  }

  receipt(id, occurrence = 'once') { return this.state.receipts[keyFor(id, occurrence)]; }

  record(id, action, occurrence = 'once') {
    if (!fields[action]) return;
    this.mergeLocal();
    const key = keyFor(id, occurrence);
    const receipt = this.state.receipts[key] ||= {};
    if (receipt[fields[action]]) return;
    receipt[fields[action]] = new Date().toISOString();
    if (action === 'clicked' || action === 'dismissed') receipt.read_at ||= receipt[fields[action]];
    const event = { notification_id: id, occurrence, action };
    this.state.pending[eventKey(event)] = event;
    this.durable = this.write(this.storageKey, this.state);
    if (!this.durable) {
      this.error = 'Browser storage is unavailable. Unsynced notification changes will be lost if you leave.';
      this.onChange();
    }
    // Persist synchronously before any navigation; RPC can safely retry next visit.
    void this.flush();
  }

  async load() {
    this.error = '';
    try {
      const { data, error } = await this.client.from('notifications')
        .select('id, stage, position, title, tone, dismissible, content').eq('enabled', true).order('position');
      if (error) throw error;
      this.definitions = data || [];
      this.write(PREFIX + 'catalog', this.definitions);
      if (this.userId) {
        // Transfer once to this account's durable outbox, before removing the guest copy.
        const guestKey = PREFIX + 'guest';
        const guest = this.read(guestKey, emptyState());
        this.mergeLocal();
        for (const [key, receipt] of Object.entries(guest.receipts)) {
          this.state.receipts[key] = { ...this.state.receipts[key], ...receipt };
        }
        Object.assign(this.state.pending, guest.pending);
        if (this.write(this.storageKey, this.state)) {
          try { this.storage?.removeItem(guestKey); } catch { /* Retry transfer next visit. */ }
        }
        const remoteReceipts = {};
        for (let offset = 0; ; offset += 1000) {
          const { data: receipts, error: receiptError } = await this.client.from('user_notifications')
            .select('notification_id, occurrence, read_at, dismissed_at, clicked_at, completed_at')
            .eq('user_id', this.userId).order('notification_id').order('occurrence').range(offset, offset + 999);
          if (receiptError) throw receiptError;
          for (const row of receipts || []) {
            const key = keyFor(row.notification_id, row.occurrence);
            const receipt = remoteReceipts[key] ||= {};
            for (const field of Object.values(fields)) if (row[field]) receipt[field] = row[field];
          }
          if ((receipts || []).length < 1000) break;
        }
        // A successful full fetch is authoritative, including deleted/reset receipts.
        // Retain only local actions still waiting to be uploaded, not old synced history.
        this.mergeLocal();
        for (const event of Object.values(this.state.pending)) {
          const key = keyFor(event.notification_id, event.occurrence);
          const field = fields[event.action];
          if (!field) continue;
          const receipt = remoteReceipts[key] ||= {};
          receipt[field] ||= this.state.receipts[key]?.[field] || new Date().toISOString();
          if (event.action === 'clicked' || event.action === 'dismissed') receipt.read_at ||= receipt[field];
        }
        this.state.receipts = remoteReceipts;
        this.write(this.storageKey, this.state);
        await this.flush();
      }
    } catch (error) {
      console.warn('Jaycee notifications could not be loaded', error);
      this.error = 'Notifications could not be synced. Reconnect to retry.';
    }
  }

  flush() {
    if (!this.userId || this.inFlight) return this.inFlight || Promise.resolve();
    this.inFlight = (async () => {
      this.mergeLocal();
      while (Object.keys(this.state.pending).length) {
        const batch = Object.entries(this.state.pending).slice(0, 100);
        const { error } = await this.client.rpc('record_notification_events', { p_events: batch.map(([, event]) => event) });
        if (error) throw error;
        this.mergeLocal();
        for (const [key] of batch) delete this.state.pending[key];
        this.write(this.storageKey, this.state);
      }
      this.error = '';
    })().catch((error) => {
      console.warn('Jaycee notification events remain queued', error);
      this.error = this.durable
        ? 'Notification changes are saved on this device. Reconnect to sync.'
        : 'Notification changes could not be saved. Keep this page open and reconnect to retry.';
    }).finally(() => { this.inFlight = null; this.onChange(); });
    return this.inFlight;
  }
}
