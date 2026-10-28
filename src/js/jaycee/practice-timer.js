export class PracticeTimer {
  constructor({ save, onSaved = () => {}, onChange = () => {} }) {
    Object.assign(this, { save, onSaved, onChange });
    this.active = null;
    this.pending = [];
    this.inFlight = null;
    this.error = "";
  }

  start(playerId, skillNumber, questStart) {
    if (![1, 2, 3].includes(skillNumber)) return;
    this.stop();
    const now = performance.now();
    this.active = { playerId, skillNumber, questStart, since: now, sessionSince: now };
    this.onChange();
  }

  elapsed() {
    return this.active ? Math.max(0, performance.now() - this.active.since) / 1000 : 0;
  }

  // Checkpoints move `since` for saving slices, but the visible session continues.
  sessionElapsed() {
    return this.active ? Math.max(0, performance.now() - this.active.sessionSince) / 1000 : 0;
  }

  stop() {
    if (!this.active) return;
    const totalSeconds = this.elapsed();
    if (totalSeconds > 0) this.pending.push({ ...this.active, totalSeconds });
    this.active = null;
    this.onChange();
    void this.flush();
  }

  // Save a slice while continuing to measure the remaining active practice.
  checkpoint() {
    if (this.active) {
      const now = performance.now();
      const totalSeconds = Math.max(0, now - this.active.since) / 1000;
      if (totalSeconds > 0) this.pending.push({ ...this.active, totalSeconds });
      this.active.since = now;
    }
    return this.flush();
  }

  project(player) {
    if (!player) return null;
    const projected = { ...player };
    const entries = this.active ? [...this.pending, { ...this.active, totalSeconds: this.elapsed() }] : this.pending;
    for (const entry of entries) {
      if (entry.playerId !== player.id) continue;
      const column = `skill_${entry.skillNumber}_practice`;
      projected[column] = (Number(projected[column]) || 0) + entry.totalSeconds;
    }
    return projected;
  }

  flush() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      while (this.pending.length) {
        const player = await this.save(this.pending[0]);
        this.pending.shift();
        this.error = "";
        await this.onSaved(player);
        this.onChange();
      }
    })().catch(() => {
      this.error = "Practice could not be saved. Keep this page open and reconnect to retry.";
      this.onChange();
    }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}
