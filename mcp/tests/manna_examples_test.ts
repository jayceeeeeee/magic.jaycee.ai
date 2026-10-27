import { GAME_RULES } from "../../supabase/functions/game-mcp/game-rules.ts";
import {
  getMannaModel,
  getMannaRules,
  getMannaSkillModels,
} from "../../supabase/functions/game-mcp/manna.js";

const near = (actual: number, expected: number) => {
  if (Math.abs(actual - expected) > 1e-8 * Math.max(1, Math.abs(expected))) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
};

// Worked examples are regression fixtures, not resources shipped to clients.
Deno.test("active examples: quarter goal earned halfway through each fixed cycle", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const activeModels = getMannaSkillModels();
  for (const [index, model] of activeModels.entries()) {
    const skill = index + 1;
    const result = getMannaModel({
      activeModels,
      now,
      timeZone: "UTC",
      selectedAbilityIndex: skill,
      playerProfile: {
        manna_target: 240,
        manna_cycle: "day",
        manna_unit: "EUR",
      },
      player: {
        id: "example",
        level: 4,
        [`skill_${skill}_start`]: new Date(
          now.getTime() - model.passiveSeconds * 500,
        ).toISOString(),
        [`skill_${skill}_practice`]: model.questSeconds / 4,
      },
    });
    const target = 240 * model.passiveSeconds / 86400;
    near(result.gain, target / 4);
    near(result.loss, -target / 2);
    near(result.value, -target / 4);
  }
});

Deno.test("annual and calendar examples: archived Moon goals, partial Earth and Paris DST", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const activeModels = getMannaSkillModels();
  const year = GAME_RULES.skills[0].cycleSeconds;
  const result = getMannaModel({
    activeModels,
    now,
    timeZone: "UTC",
    selectedAbilityIndex: 0,
    playerProfile: { manna_target: 240, manna_cycle: "day", manna_unit: "EUR" },
    player: { id: "example", level: 4, skill_3_practice: 15 },
    accountCreatedAt: new Date(now.getTime() - year * 500).toISOString(),
    completedPassiveSeconds: activeModels[0].passiveSeconds * 2,
  });
  const gain = 240 / 86400 * (activeModels[0].passiveSeconds * 2 + 1800);
  const loss = -240 / 86400 * year / 2;
  near(result.gain, gain);
  near(result.loss, loss);
  near(result.value, gain + loss);
  const monthly = getMannaRules(
    { manna_target: 310, manna_cycle: "month", manna_unit: "EUR" },
    new Date("2026-03-15T00:00:00Z"),
    "Europe/Paris",
  );
  if (!("settings" in monthly)) throw new Error("Missing normalized settings");
  near(monthly.settings.cycle_seconds, 31 * 86400 - 3600);
  near(monthly.cycle_targets.month.amount, 310);
});
