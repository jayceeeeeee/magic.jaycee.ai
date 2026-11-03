import { PracticeTimer } from "../../src/js/jaycee/practice-timer.js";
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
Deno.test("Using clock continues across checkpoints while saved slices remain exact", async () => {
  const original = Object.getOwnPropertyDescriptor(performance, "now");
  let now = 0;
  Object.defineProperty(performance, "now", { configurable: true, value: () => now });
  try {
    let savedSeconds = 0;
    const timer = new PracticeTimer({ save: async (slice: any) => { savedSeconds += slice.totalSeconds; return {}; } });
    timer.start("player", 1, "quest");
    now = 10000; await timer.checkpoint();
    now = 20000; await timer.checkpoint();
    now = 25000;
    assert(timer.sessionElapsed() === 25 && timer.elapsed() === 5, "Using clock restarted at a checkpoint");
    assert(timer.project({ id: "player", skill_1_practice: savedSeconds }).skill_1_practice === 25, "Live practice was double-counted");
    timer.stop(); await timer.flush();
    assert(savedSeconds === 25 && timer.sessionElapsed() === 0, "Stop changed the measured total");
    timer.start("player", 1, "quest");
    assert(timer.sessionElapsed() === 0, "New practice did not reset the Using clock");
  } finally {
    if (original) Object.defineProperty(performance, "now", original);
    else Reflect.deleteProperty(performance, "now");
  }
});

Deno.test("Continuity saves twelve exact cycles, renews clocks and stops at the limit", async () => {
  const original = Object.getOwnPropertyDescriptor(performance, "now");
  let now = 0;
  Object.defineProperty(performance, "now", { configurable: true, value: () => now });
  try {
    let completions = 0;
    let clock = "clock-0";
    let partial = 7;
    const timer = new PracticeTimer({ save: async (entry: any) => {
      assert(entry.questStart === clock, "Saved against an outdated cycle clock");
      const value = entry.practiceValue ?? partial + entry.totalSeconds;
      const complete = value === 30;
      if (complete) { completions++; clock = `clock-${completions}`; }
      partial = complete ? 0 : value;
      return { completed_skills: complete ? [3] : [], player: {
        id: "player", level: 4, skill_3_start: clock, skill_3_practice: partial
      } };
    } });
    timer.start("player", 3, clock, { enabled: true, limit: 12, cycleSeconds: 30, remainingSeconds: 23 });
    now = 10000; await timer.checkpoint();
    now = 23050; timer.tick(); await timer.flush();
    assert(completions === 1 && timer.active?.questStart === "clock-1", "First partial cycle did not continue");
    // A delayed UI tick must catch up without crediting a thirteenth cycle.
    now = 500000; timer.tick(); await timer.flush();
    while (timer.active) { timer.tick(); await timer.flush(); }
    assert(completions === 12 && timer.run?.completed === 12, "Wrong number of archived cycles");
    assert(!timer.skillNumber && partial === 0, "Limited run did not stop exactly at its goal");
  } finally {
    if (original) Object.defineProperty(performance, "now", original);
    else Reflect.deleteProperty(performance, "now");
  }
});

Deno.test("Infinite continuity retries a failed cycle once and Stop cancels a pending restart", async () => {
  const original = Object.getOwnPropertyDescriptor(performance, "now");
  let now = 0;
  Object.defineProperty(performance, "now", { configurable: true, value: () => now });
  try {
    let fail = true, saved = 0;
    const timer = new PracticeTimer({ save: async () => {
      if (fail) throw new Error("offline");
      saved++;
      return { completed_skills: [3], player: { id: "player", level: 4, skill_3_start: `next-${saved}`, skill_3_practice: 0 } };
    } });
    timer.start("player", 3, "first", { enabled: true, limit: null, cycleSeconds: 30 });
    now = 31000; timer.tick(); await timer.flush();
    assert(timer.error && timer.pending.length === 1 && !timer.active, "Failure lost the pending cycle");
    fail = false; await timer.flush();
    assert(saved === 1 && timer.active && !timer.error, "Retry did not resume infinite continuity");
    fail = true; now = 61000; timer.tick(); await timer.flush();
    timer.stop(); fail = false; await timer.flush();
    assert(saved === 2 && !timer.skillNumber, "Stop allowed a pending cycle to restart");
    timer.start("player", 3, "manual", { enabled: true, cycleSeconds: 30 });
    now += 5000; timer.stop(); await timer.flush();
    assert(!timer.active, "Manual partial stop restarted continuity");
  } finally {
    if (original) Object.defineProperty(performance, "now", original);
    else Reflect.deleteProperty(performance, "now");
  }
});

Deno.test("Disabled continuity always stops after one cycle, regardless of the limit", async () => {
  const original = Object.getOwnPropertyDescriptor(performance, "now");
  let now = 0;
  Object.defineProperty(performance, "now", { configurable: true, value: () => now });
  try {
    for (const limit of [12, null, 1]) {
      let saved = 0;
      const timer = new PracticeTimer({ save: async () => {
        saved++;
        return { completed_skills: [3], player: { id: "player", level: 4, skill_3_start: "next" } };
      } });
      timer.start("player", 3, "first", { enabled: false, limit, cycleSeconds: 30 });
      now += 90000; timer.tick(); await timer.flush();
      assert(saved === 1 && !timer.skillNumber, "Disabled continuity repeated the skill");
    }
  } finally {
    if (original) Object.defineProperty(performance, "now", original);
    else Reflect.deleteProperty(performance, "now");
  }
});
