export class PracticeTimer {
  constructor({ save, onSaved = () => {}, onChange = () => {} }) {
    Object.assign(this, { save, onSaved, onChange });
    this.active = null;
    this.pending = [];
    this.inFlight = null;
    this.error = "";
    this.continuation = null;
    this.run = null;
  }

  start(playerId, skillNumber, questStart, options = {}) {
    if (![1, 2, 3].includes(skillNumber)) return;
    this.stop();
    const now = performance.now();
    this.run = { enabled: false, limit: 1, ...options, skillNumber, completed: 0 };
    this.beginCycle(playerId, skillNumber, questStart, now, options.remainingSeconds);
    this.onChange();
  }

  beginCycle(playerId, skillNumber, questStart, now, remainingSeconds) {
    const seconds = remainingSeconds ?? this.run?.cycleSeconds;
    this.active = { playerId, skillNumber, questStart, since: now, sessionSince: now,
      cycleEnd: Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Infinity };
  }

  get skillNumber() { return this.active?.skillNumber ?? this.continuation?.skillNumber ?? null; }

  tick() {
    if (!this.active || performance.now() < this.active.cycleEnd) return;
    const entry = { ...this.active, totalSeconds: this.elapsed(), cycleComplete: true,
      practiceValue: this.run.cycleSeconds, run: this.run };
    this.pending.push(entry);
    this.continuation = entry;
    this.active = null;
    this.onChange();
    void this.flush();
  }

  elapsed() {
    return this.active ? Math.max(0, Math.min(performance.now(), this.active.cycleEnd) - this.active.since) / 1000 : 0;
  }

  // Checkpoints move `since` for saving slices, but the visible session continues.
  sessionElapsed() {
    return this.active ? Math.max(0, performance.now() - this.active.sessionSince) / 1000 : 0;
  }

  stop() {
    this.continuation = null;
    if (!this.active) { this.onChange(); return; }
    const totalSeconds = this.elapsed();
    if (totalSeconds > 0) this.pending.push({ ...this.active, totalSeconds });
    this.active = null;
    this.onChange();
    void this.flush();
  }

  // Save a slice while continuing to measure the remaining active practice.
  checkpoint() {
    this.tick();
    if (this.active) {
      const now = Math.min(performance.now(), this.active.cycleEnd);
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
        const entry = this.pending[0];
        const player = await this.save(entry);
        this.pending.shift();
        this.error = "";
        await this.onSaved(player);
        if (entry.cycleComplete && player.completed_skills?.includes(entry.skillNumber)) {
          entry.run.completed++;
          if (this.continuation === entry) {
            this.continuation = null;
            const next = player.player;
            if (entry.run.enabled && (!entry.run.limit || entry.run.completed < entry.run.limit)
              && next?.id === entry.playerId && Number(next.level) >= entry.skillNumber) {
              this.beginCycle(entry.playerId, entry.skillNumber,
                next[`skill_${entry.skillNumber}_start`] || null, entry.cycleEnd,
                Math.max(0, entry.run.cycleSeconds - (Number(next[`skill_${entry.skillNumber}_practice`]) || 0)));
            }
          }
        } else if (this.continuation === entry) {
          this.continuation = null;
        }
        this.onChange();
      }
    })().catch(() => {
      this.error = "Practice could not be saved. Keep this page open and reconnect to retry.";
      this.onChange();
    }).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}
