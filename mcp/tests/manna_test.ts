import { getMannaCycleSeconds, getMannaModel, getMannaRules, getMannaSkillModels } from "../../supabase/functions/game-mcp/manna.js";
import { runMannaTests } from "../../tests/manna.test.mjs";

const near = (actual: number, expected: number) => {
  if (Math.abs(actual - expected) > 1e-8 * Math.max(1, Math.abs(expected))) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
};

Deno.test("shared Manna model preserves all existing browser balance rules", () => {
  runMannaTests(getMannaModel);
});

Deno.test("calendar months use the selected timezone including DST and month boundaries", () => {
  near(getMannaCycleSeconds("month", new Date("2026-03-15T00:00:00Z"), "Europe/Paris"), 31 * 86400 - 3600);
  near(getMannaCycleSeconds("month", new Date("2026-11-15T00:00:00Z"), "America/New_York"), 30 * 86400 + 3600);
  near(getMannaCycleSeconds("month", new Date("2026-02-28T16:00:00Z"), "Asia/Tokyo"), 31 * 86400);
  near(getMannaCycleSeconds("month", new Date("2026-02-28T16:00:00Z"), "UTC"), 28 * 86400);
});

Deno.test("Manna gains and losses use the skill's practice goal and independent passive cycle", () => {
  const models = getMannaSkillModels();
  const now = new Date("2026-10-27T12:00:00Z");
  const options = { activeModels: models, now, timeZone: "UTC", selectedAbilityIndex: 2,
    playerProfile: { manna_target: 100, manna_cycle: "day" },
    player: { level: 4, skill_2_start: "2026-10-27T00:00:00Z", skill_2_practice: 300 } };
  const view = getMannaModel(options);
  near(view.target, 100);
  near(view.gain, 100 * 300 / 720);
  near(view.loss, -50);
  near(view.value, view.gain + view.loss);
  const doubled = getMannaModel({ ...options, playerProfile: { manna_target: 200, manna_cycle: "day" } });
  near(doubled.gain, view.gain * 2);
  near(doubled.loss, view.loss * 2);
  const rules = getMannaRules({ manna_target: 310, manna_cycle: "month" }, now, "Asia/Tokyo");
  if (!("cycle_targets" in rules)) throw new Error("Personalized cycle targets are missing");
  near(rules.cycle_targets.day.amount, 10);
  near(rules.cycle_targets.hour.amount, 10 / 24);
});
