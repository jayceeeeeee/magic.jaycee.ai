const SOURCES = {
  skillOpen: new URL('../../assets/sounds/first_click_skill.mp3', import.meta.url).href,
  skillStart: new URL('../../assets/sounds/start_skill.mp3', import.meta.url).href,
  notification: new URL('../../assets/sounds/new_notification.mp3', import.meta.url).href,
  notificationConfirm: new URL('../../assets/sounds/confirm_notification.mp3', import.meta.url).href
};

export class SoundEffects {
  constructor() {
    this.audio = new Map();
    this.seenNotifications = new Set();
  }

  play(name) {
    if (!SOURCES[name] || globalThis.document?.visibilityState === 'hidden') return;
    try {
      let audio = this.audio.get(name);
      if (!audio) {
        audio = new Audio(SOURCES[name]);
        audio.preload = 'auto';
        this.audio.set(name, audio);
      }
      // Reuse each effect so rapid clicks restart it instead of stacking copies.
      audio.currentTime = 0;
      // Autoplay restrictions or a missing asset must never interrupt the UI.
      audio.play()?.catch(() => {});
    } catch { /* Audio is optional when the browser cannot play it. */ }
  }

  notify(keys) {
    let hasNew = false;
    for (const key of keys) {
      if (!this.seenNotifications.has(key)) hasNew = true;
      this.seenNotifications.add(key);
    }
    if (hasNew) this.play('notification');
  }
}
