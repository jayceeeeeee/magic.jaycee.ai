import {
  GAME_RESOURCES,
  getGameConfig,
  getMannaExamples,
} from "../game-resources.ts";
import {
  getMannaModel,
  getMannaRules,
  getMannaSkillModels,
} from "../../src/js/config/manna.js";
import { JAYCEE_GAME_CONFIG } from "../../src/js/config/game-config.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const near = (actual: number, expected: number) => {
  assert(
    Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)),
    `Expected ${expected}, got ${actual}`,
  );
};

Deno.test("resource rules use the browser's canonical game and math modules", () => {
  const config = getGameConfig();
  assert(
    config.game_config === JAYCEE_GAME_CONFIG,
    "Resource copied game configuration instead of using the shared source",
  );
  assert(
    JSON.stringify(config.manna_rules) === JSON.stringify(getMannaRules()),
    "Resource formulas diverged from the game",
  );
  assert(
    new Set(GAME_RESOURCES.map((resource) => resource.uri)).size === 3,
    "Expected three unique knowledge resources",
  );
  let cumulativeRatio = 1;
  for (const [index, target] of config.practice_goal_targets.entries()) {
    cumulativeRatio *= JAYCEE_GAME_CONFIG.activeAbilities[index].ratio;
    near(
      target.target_seconds,
      JAYCEE_GAME_CONFIG.passive.cycleSeconds / cumulativeRatio,
    );
  }
});

Deno.test("worked examples execute the same engine and expose explicit synthetic inputs", () => {
  const examples = getMannaExamples();
  const activeModels = getMannaSkillModels();
  assert(
    examples.synthetic,
    "Examples must not be mistaken for personal balances",
  );
  for (const example of examples.active_cycles) {
    const input = example.input;
    const computed = getMannaModel({
      activeModels,
      player: input.player,
      playerProfile: input.player_profile,
      selectedAbilityIndex: input.selected_skill,
      now: new Date(input.now),
      timeZone: input.time_zone,
    });
    assert(
      JSON.stringify(example.result) === JSON.stringify(computed),
      "Worked example diverged from the actual engine",
    );
    near(example.result.gain, example.result.target / 4);
    near(example.result.loss, -example.result.target / 2);
    near(example.result.value, -example.result.target / 4);
  }
  const annual = examples.annual_overview;
  const computed = getMannaModel({
    activeModels,
    player: annual.input.player,
    playerProfile: annual.input.player_profile,
    accountCreatedAt: annual.input.account_created_at,
    completedPassiveSeconds: annual.input.completed_passive_seconds,
    selectedAbilityIndex: 0,
    now: new Date(annual.input.now),
    timeZone: annual.input.time_zone,
  });
  assert(
    JSON.stringify(annual.result) === JSON.stringify(computed),
    "Annual example diverged from the engine",
  );
  const monthly = examples.calendar_month.result;
  if (!("settings" in monthly)) {
    throw new Error("Calendar example is missing its normalization settings");
  }
  near(monthly.settings.cycle_seconds, 31 * 86400 - 3600);
  near(monthly.cycle_targets.month.amount, 310);
});
