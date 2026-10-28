const SOURCES = {
  menuPlay: '/src/assets/sounds/play_main_menu.mp3',
  buttonClick: '/src/assets/sounds/first_click_skill.mp3',
  skillStart: '/src/assets/sounds/start_skill.mp3',
  notification: '/src/assets/sounds/new_notification.mp3',
  notificationConfirm: '/src/assets/sounds/first_click_skill.mp3'
};

export class SoundEffects {
  constructor() {
    this.audio = new Map();
    this.seenNotifications = new Set();
  }

  getAudio(name) {
    if (!SOURCES[name]) return null;
    let audio = this.audio.get(name);
    if (!audio) {
      audio = new Audio(SOURCES[name]);
      audio.preload = 'auto';
      this.audio.set(name, audio);
    }
    return audio;
  }

  preload(names) {
    for (const name of names) {
      try { this.getAudio(name); } catch { /* Optional audio. */ }
    }
  }

  play(name, { waitForEnd = false } = {}) {
    let finished = Promise.resolve();
    let finish = () => {};
    if (globalThis.document?.visibilityState === 'hidden') return finished;
    try {
      const audio = this.getAudio(name);
      if (!audio) return finished;
      // Reuse each effect so rapid clicks restart it instead of stacking copies.
      audio.currentTime = 0;
      if (waitForEnd) {
        finished = new Promise((resolve) => {
          let timeout;
          finish = () => {
            clearTimeout(timeout);
            audio.removeEventListener('ended', finish);
            audio.removeEventListener('error', finish);
            audio.removeEventListener('abort', finish);
            resolve();
          };
          audio.addEventListener('ended', finish, { once: true });
          audio.addEventListener('error', finish, { once: true });
          audio.addEventListener('abort', finish, { once: true });
          // Let short clips finish; cap navigation waits for longer/stalled audio.
          timeout = setTimeout(finish, 1500);
        });
      }
      // Autoplay restrictions or a missing asset must never interrupt the UI.
      audio.play()?.catch(() => finish());
    } catch { finish(); /* Audio is optional when the browser cannot play it. */ }
    return finished;
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
