import { GAME_RULES } from "../../supabase/functions/game-mcp/game-rules.ts";
import { GAME_RULES as BROWSER_RULES } from "../../src/js/config/game-rules.js";
import { syncGame } from "../../scripts/sync-game.ts";
import {
  getMannaCycleSeconds,
  getMannaModel,
  getMannaRules,
  getMannaSkillModels,
  getProportionalManna,
} from "../../supabase/functions/game-mcp/manna.js";
import { getMannaModel as browserManna } from "../../src/js/config/manna.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const near = (actual: number, expected: number) =>
  assert(
    Math.abs(actual - expected) < 1e-8 * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );

Deno.test("exact immutable rules and generated browser sources stay synchronized", async () => {
  await syncGame(true);
  assert(
    JSON.stringify(GAME_RULES) === JSON.stringify(BROWSER_RULES),
    "Browser rules diverged",
  );
  const expected = [
    ["skill_0", "Stars", 31556926.08, null, 40075017],
    ["skill_1", "Moon", 2551442.803, 17280, 21944],
    ["skill_2", "Sun", 86400, 720, 914],
    ["skill_3", "Earth", 3600, 30, 38],
    ["skill_4", "Body", null, null, null],
  ];
  assert(
    JSON.stringify(
      GAME_RULES.skills.map((
        s,
      ) => [
        s.skillColumn,
        s.fractalLabel,
        s.cycleSeconds,
        s.practiceGoalSeconds,
        s.zoneMeters,
      ]),
    ) === JSON.stringify(expected),
    "Fixed Skill mapping changed",
  );
  assert(
    GAME_RULES.lifeMaxYears === 1000000 &&
      GAME_RULES.baseZoneMeters === 40075017,
    "Fixed constants changed",
  );
  assert(
    GAME_RULES.skills[1].skillLabel === "Prayer",
    "Existing Skill label changed",
  );
  GAME_RULES.skills.forEach((s) =>
    assert(
      s.zoneMeters === null || Number.isInteger(s.zoneMeters),
      "Fractional zone",
    )
  );
  const verifyFrozen = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    assert(Object.isFrozen(value), "Mutable rules object");
    Object.values(value).forEach(verifyFrozen);
  };
  verifyFrozen(GAME_RULES);
  assert(
    Object.keys(GAME_RULES.manna.equations).length === 9,
    "Expected nine documented equations",
  );
  for (const equation of Object.values(GAME_RULES.manna.equations)) {
    assert(
      equation.description && equation.expression,
      "Equation lacks documentation",
    );
  }
  const catalog = getMannaRules();
  assert(
    !("gain_per_completed_goal" in catalog.formulas) &&
      !("practice_needed_to_offset_loss" in catalog.formulas),
    "Redundant public equations remain",
  );
});

Deno.test("fixed goals preserve legacy ratios; zones use cumulative final rounding", () => {
  let practice = GAME_RULES.skills[0].cycleSeconds as number;
  let zone = GAME_RULES.baseZoneMeters as number;
  for (const [index, ratio] of GAME_RULES.ratios.entries()) {
    practice /= ratio;
    zone /= ratio;
    assert(
      practice === GAME_RULES.skills[index + 1].practiceGoalSeconds,
      "Practice behavior differs from legacy formula",
    );
    assert(
      Math.round(zone) === GAME_RULES.skills[index + 1].zoneMeters,
      "Zone rounding differs from specification",
    );
  }
});

Deno.test("proportional, active and annual equations agree with the browser engine", () => {
  near(getProportionalManna(240, 3600, 86400), 10);
  const now = new Date("2026-01-15T00:00:00Z");
  const activeModels = getMannaSkillModels();
  const profile = { manna_target: 240, manna_cycle: "day", manna_unit: "EUR" };
  const player: Record<string, unknown> = { id: "current", level: 4 };
  for (const [index, model] of activeModels.entries()) {
    player[`skill_${index + 1}_start`] = new Date(
      now.getTime() - model.passiveSeconds * 2000,
    ).toISOString();
    player[`skill_${index + 1}_practice`] = model.questSeconds / 2;
    const options = {
      activeModels,
      player,
      playerProfile: profile,
      now,
      timeZone: "UTC",
      selectedAbilityIndex: index + 1,
    };
    const view = getMannaModel(options);
    near(view.target, 240 * model.passiveSeconds / 86400);
    near(view.gain, view.target / 2);
    near(view.loss, -view.target); // Loss caps at one cycle.
    near(view.value, -view.target / 2);
    assert(
      JSON.stringify(view) === JSON.stringify(browserManna(options)),
      "Browser active balance diverged",
    );
  }
  const archived = activeModels[0].passiveSeconds * 2;
  const options = {
    activeModels,
    player,
    playerProfile: profile,
    now,
    timeZone: "UTC",
    selectedAbilityIndex: 0,
    accountCreatedAt: "2020-01-01T00:00:00Z",
    completedPassiveSeconds: archived,
    practicePlayers: [player, {
      id: "other",
      level: 1,
      skill_1_practice: activeModels[0].questSeconds / 4,
    }],
  };
  const annual = getMannaModel(options);
  const credit = archived +
    activeModels.reduce((sum, m) => sum + m.passiveSeconds / 2, 0) +
    activeModels[0].passiveSeconds / 4;
  near(annual.gain, 240 / 86400 * credit);
  near(annual.loss, -240 / 86400 * GAME_RULES.skills[0].cycleSeconds);
  near(annual.value, annual.gain + annual.loss);
  assert(
    JSON.stringify(annual) === JSON.stringify(browserManna(options)),
    "Browser annual balance diverged",
  );
  const future = getMannaModel({
    ...options,
    accountCreatedAt: "2030-01-01T00:00:00Z",
  });
  near(future.loss, 0);
});

Deno.test("calendar normalization preserves leap years, local month and both DST transitions", () => {
  near(
    getMannaCycleSeconds("month", new Date("2024-02-15T00:00:00Z"), "UTC"),
    29 * 86400,
  );
  near(
    getMannaCycleSeconds(
      "month",
      new Date("2026-03-15T00:00:00Z"),
      "America/New_York",
    ),
    31 * 86400 - 3600,
  );
  near(
    getMannaCycleSeconds(
      "month",
      new Date("2026-10-15T00:00:00Z"),
      "Europe/Paris",
    ),
    31 * 86400 + 3600,
  );
  assert(
    getMannaCycleSeconds("month", new Date("2026-02-15T00:00:00Z"), "UTC") !==
      GAME_RULES.skills[1].cycleSeconds,
    "Moon is not a calendar month",
  );
  near(getMannaCycleSeconds("year"), 31556926.08);
  near(getMannaCycleSeconds("day"), 86400);
  near(getMannaCycleSeconds("hour"), 3600);
});
