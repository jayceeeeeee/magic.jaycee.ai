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
