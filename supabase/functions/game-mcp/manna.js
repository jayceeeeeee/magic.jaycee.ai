import { GAME_RULES } from "./game-rules.ts";

const MANNA_YEAR_SECONDS = GAME_RULES.skills[0].cycleSeconds;
const MANNA_PERIODS = {
  hour: GAME_RULES.skills[3].cycleSeconds,
  day: GAME_RULES.skills[2].cycleSeconds,
  year: MANNA_YEAR_SECONDS,
};

export const normalizeMannaCycle = (cycle) =>
  GAME_RULES.normalization.allowedCycles.includes(String(cycle ?? "").trim())
    ? String(cycle).trim()
    : GAME_RULES.normalization.defaultCycle;

export const normalizeMannaUnit = (unit) =>
  /^[A-Z]{3}$/.test(String(unit ?? "").trim().toUpperCase())
    ? String(unit).trim().toUpperCase()
    : GAME_RULES.normalization.defaultUnit;

// Browser calls use its local zone. Remote callers can supply an explicit IANA zone.
const monthBoundary = (year, month, timeZone) => {
  const desired = Date.UTC(year, month, 1);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant))
        .map(({ type, value }) => [type, value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const next = desired - (represented - instant);
    if (next === instant) break;
    instant = next;
  }
  return instant;
};

export const getMannaCycleSeconds = (
  cycle,
  reference = new Date(),
  timeZone,
) => {
  if (cycle !== "month") return MANNA_PERIODS[cycle] || MANNA_YEAR_SECONDS;
  if (!timeZone) {
    return Math.max(
      1,
      (new Date(reference.getFullYear(), reference.getMonth() + 1, 1) -
        new Date(reference.getFullYear(), reference.getMonth(), 1)) / 1000,
    );
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(reference).map(({ type, value }) => [type, value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month) - 1;
  return Math.max(
    1,
    (monthBoundary(year, month + 1, timeZone) -
      monthBoundary(year, month, timeZone)) / 1000,
  );
};

export const getMannaSkillModels = () =>
  GAME_RULES.skills.filter((skill) => skill.practiceGoalSeconds !== null).map((
    ability,
    index,
  ) => ({
    skill_number: index + 1,
    passiveSeconds: ability.cycleSeconds,
    questSeconds: ability.practiceGoalSeconds,
  }));

export const getProportionalManna = (
  amount,
  durationSeconds,
  referenceCycleSeconds,
) => amount * durationSeconds / referenceCycleSeconds;

// This is the same model used by the browser's Manna bar and the remote MCP.
/**
 * @param {{activeModels?: Array<{passiveSeconds: number, questSeconds: number}>,
 * player?: Record<string, any>, playerProfile?: Record<string, any> | null,
 * accountCreatedAt?: string, practicePlayers?: Array<Record<string, any>>,
 * completedPassiveSeconds?: number, selectedAbilityIndex?: number | null,
 * lastSelectedAbilityIndex?: number | null, practicingSkillIndex?: number | null,
 * now?: Date, timeZone?: string}} options
 */
export const getMannaModel = (
  {
    activeModels = [],
    player,
    playerProfile,
    accountCreatedAt = "",
    practicePlayers = [],
    completedPassiveSeconds = 0,
    selectedAbilityIndex = null,
    lastSelectedAbilityIndex = null,
    practicingSkillIndex = null,
    now = new Date(),
    timeZone,
  } = {},
) => {
  const level = Math.min(3, Math.max(1, Number(player?.level) || 1));
  const hasQuest = Number(player?.level) < 4;
  const mannaTarget = Number(playerProfile?.manna_target);
  const mannaCycle = normalizeMannaCycle(playerProfile?.manna_cycle);
  const unit = normalizeMannaUnit(playerProfile?.manna_unit);
  const viewIndex = selectedAbilityIndex ??
    (hasQuest
      ? practicingSkillIndex
      : lastSelectedAbilityIndex ?? practicingSkillIndex ?? 3);
  const skillNumber = viewIndex >= 1 && viewIndex <= level
    ? viewIndex
    : viewIndex == null && hasQuest
    ? level
    : null;
  const skillModel = skillNumber === null
    ? null
    : activeModels[skillNumber - 1];
  const periodSeconds = skillModel
    ? Number(skillModel.passiveSeconds)
    : MANNA_YEAR_SECONDS;
  const startedAt = new Date(
    (skillNumber !== null
      ? player?.[`skill_${skillNumber}_start`]
      : accountCreatedAt) || "",
  );
  const validStart = Number.isFinite(startedAt.getTime());
  const cycleSeconds = getMannaCycleSeconds(
    mannaCycle,
    validStart ? startedAt : now,
    timeZone,
  );
  const periodTarget = Number.isFinite(mannaTarget) && periodSeconds > 0
    ? getProportionalManna(mannaTarget, periodSeconds, cycleSeconds)
    : 0;
  const pending = [2, 3].includes(Number(player?.level)) &&
    !player?.[`level_${Number(player.level)}_accepted_at`];
  const paused = skillNumber !== null && pending &&
    skillNumber === Number(player?.level);
  let elapsedSeconds = 0;
  let gain = 0;
  let loss = 0;
  if (!paused && validStart && periodSeconds > 0) {
    elapsedSeconds = Math.min(
      periodSeconds,
      Math.max(0, (now.getTime() - startedAt.getTime()) / 1000),
    );
    loss = -periodTarget * elapsedSeconds / periodSeconds;
    if (skillNumber !== null) {
      const practiceSeconds = Math.max(
        0,
        Number(player?.[`skill_${skillNumber}_practice`]) || 0,
      );
      const questSeconds = Number(skillModel?.questSeconds);
      gain = questSeconds > 0
        ? periodTarget * practiceSeconds / questSeconds
        : 0;
    } else {
      const players = new Map(
        practicePlayers.filter((row) => row?.id).map((row) => [row.id, row]),
      );
      players.set(player?.id || "current", player);
      const earnedSeconds = [...players.values()].reduce((total, row) =>
        total +
        activeModels.slice(0, Math.min(3, Number(row?.level) || 0)).reduce(
          (sum, model, index) => {
            const passiveSeconds = Number(model.passiveSeconds);
            const questSeconds = Number(model.questSeconds);
            const practiceSeconds = Math.max(
              0,
              Number(row?.[`skill_${index + 1}_practice`]) || 0,
            );
            return passiveSeconds > 0 && questSeconds > 0
              ? sum + practiceSeconds * passiveSeconds / questSeconds
              : sum;
          },
          0,
        ), Math.max(0, Number(completedPassiveSeconds) || 0));
      gain = periodTarget * earnedSeconds / periodSeconds;
    }
  }
  return {
    maxAbs: Math.abs(periodTarget) || 1,
    target: periodTarget,
    unit,
    value: gain + loss,
    gain,
    loss,
    paused,
    started_at: validStart ? startedAt.toISOString() : null,
    period_seconds: periodSeconds,
    elapsed_seconds: elapsedSeconds,
    target_cycle_seconds: cycleSeconds,
  };
};

export const getMannaRules = (profile, reference = new Date(), timeZone) => {
  const rules = {
    variables: Object.fromEntries(
      Object.entries(GAME_RULES.manna.variables)
        .map(([name, variable]) => [name, variable.description]),
    ),
    formulas: Object.fromEntries(
      Object.entries(GAME_RULES.manna.equations)
        .map(([name, equation]) => [
          name,
          name === "skill_target"
            ? equation.expression
            : equation.expression.split(" = ")[1]
              .replace(/\bAnnualGain\b/g, "annual_gain").replace(
                /\bAnnualLoss\b/g,
                "annual_loss",
              )
              .replace(/\bGain\b/g, "active_gain").replace(
                /\bLoss\b/g,
                "active_loss",
              )
              .replace(/\bE\b/g, "annual_earned_credit_seconds"),
        ]),
    ),
    behavior: [...GAME_RULES.manna.behavior, GAME_RULES.normalization.month],
    year_seconds: MANNA_YEAR_SECONDS,
    skills: getMannaSkillModels(),
  };
  if (!profile) return rules;
  const amount = Number(profile.manna_target);
  const cycle = normalizeMannaCycle(profile.manna_cycle);
  const cycleSeconds = getMannaCycleSeconds(cycle, reference, timeZone);
  return {
    ...rules,
    settings: {
      amount: Number.isFinite(amount) ? amount : 0,
      cycle,
      unit: normalizeMannaUnit(profile.manna_unit),
      reference_at: reference.toISOString(),
      time_zone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      cycle_seconds: cycleSeconds,
    },
    cycle_targets: Object.fromEntries(
      ["year", "month", "day", "hour"].map((period) => {
        const seconds = getMannaCycleSeconds(period, reference, timeZone);
        return [period, {
          seconds,
          amount: Number.isFinite(amount)
            ? getProportionalManna(amount, seconds, cycleSeconds)
            : 0,
        }];
      }),
    ),
  };
};
