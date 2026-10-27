import { JAYCEE_GAME_CONFIG } from "./game-config.js";

const MANNA_YEAR_SECONDS = JAYCEE_GAME_CONFIG.passive.cycleSeconds;
const MANNA_PERIODS = { hour: 3600, day: 86400, year: MANNA_YEAR_SECONDS };

export const normalizeMannaCycle = (cycle) =>
  ["hour", "day", "month", "year"].includes(String(cycle ?? "").trim())
    ? String(cycle).trim() : "year";

export const normalizeMannaUnit = (unit) =>
  /^[A-Z]{3}$/.test(String(unit ?? "").trim().toUpperCase())
    ? String(unit).trim().toUpperCase() : "EUR";

// Browser calls use its local zone. Remote callers can supply an explicit IANA zone.
const monthBoundary = (year, month, timeZone) => {
  const desired = Date.UTC(year, month, 1);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let instant = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant))
      .map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1,
      Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const next = desired - (represented - instant);
    if (next === instant) break;
    instant = next;
  }
  return instant;
};

export const getMannaCycleSeconds = (cycle, reference = new Date(), timeZone) => {
  if (cycle !== "month") return MANNA_PERIODS[cycle] || MANNA_YEAR_SECONDS;
  if (!timeZone) {
    return Math.max(1, (new Date(reference.getFullYear(), reference.getMonth() + 1, 1)
      - new Date(reference.getFullYear(), reference.getMonth(), 1)) / 1000);
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit",
  }).formatToParts(reference).map(({ type, value }) => [type, value]));
  const year = Number(parts.year);
  const month = Number(parts.month) - 1;
  return Math.max(1, (monthBoundary(year, month + 1, timeZone)
    - monthBoundary(year, month, timeZone)) / 1000);
};

export const getMannaSkillModels = () => {
  let questSeconds = MANNA_YEAR_SECONDS;
  return JAYCEE_GAME_CONFIG.activeAbilities.map((ability, index) => {
    questSeconds /= ability.ratio;
    return { skill_number: index + 1, passiveSeconds: ability.cycleSeconds, questSeconds };
  });
};

// This is the same model used by the browser's Manna bar and the remote MCP.
/**
 * @param {{activeModels?: Array<{passiveSeconds: number, questSeconds: number}>,
 * player?: Record<string, any>, playerProfile?: Record<string, any> | null,
 * accountCreatedAt?: string, practicePlayers?: Array<Record<string, any>>,
 * completedPassiveSeconds?: number, selectedAbilityIndex?: number | null,
 * lastSelectedAbilityIndex?: number | null, practicingSkillIndex?: number | null,
 * now?: Date, timeZone?: string}} options
 */
export const getMannaModel = ({ activeModels = [], player, playerProfile,
  accountCreatedAt = "", practicePlayers = [], completedPassiveSeconds = 0,
  selectedAbilityIndex = null, lastSelectedAbilityIndex = null,
  practicingSkillIndex = null, now = new Date(), timeZone } = {}) => {
  const level = Math.min(3, Math.max(1, Number(player?.level) || 1));
  const hasQuest = Number(player?.level) < 4;
  const mannaTarget = Number(playerProfile?.manna_target);
  const mannaCycle = normalizeMannaCycle(playerProfile?.manna_cycle);
  const unit = normalizeMannaUnit(playerProfile?.manna_unit);
  const viewIndex = selectedAbilityIndex ?? (hasQuest ? practicingSkillIndex
    : lastSelectedAbilityIndex ?? practicingSkillIndex ?? 3);
  const skillNumber = viewIndex >= 1 && viewIndex <= level ? viewIndex
    : viewIndex == null && hasQuest ? level : null;
  const skillModel = skillNumber === null ? null : activeModels[skillNumber - 1];
  const periodSeconds = skillModel ? Number(skillModel.passiveSeconds) : MANNA_YEAR_SECONDS;
  const startedAt = new Date((skillNumber !== null
    ? player?.[`skill_${skillNumber}_start`] : accountCreatedAt) || "");
  const validStart = Number.isFinite(startedAt.getTime());
  const cycleSeconds = getMannaCycleSeconds(mannaCycle, validStart ? startedAt : now, timeZone);
  const periodTarget = Number.isFinite(mannaTarget) && periodSeconds > 0
    ? mannaTarget * periodSeconds / cycleSeconds : 0;
  const pending = [2, 3].includes(Number(player?.level))
    && !player?.[`level_${Number(player.level)}_accepted_at`];
  const paused = skillNumber !== null && pending && skillNumber === Number(player?.level);
  let elapsedSeconds = 0;
  let gain = 0;
  let loss = 0;
  if (!paused && validStart && periodSeconds > 0) {
    elapsedSeconds = Math.min(periodSeconds, Math.max(0, (now.getTime() - startedAt.getTime()) / 1000));
    loss = -periodTarget * elapsedSeconds / periodSeconds;
    if (skillNumber !== null) {
      const practiceSeconds = Math.max(0, Number(player?.[`skill_${skillNumber}_practice`]) || 0);
      const questSeconds = Number(skillModel?.questSeconds);
      gain = questSeconds > 0 ? periodTarget * practiceSeconds / questSeconds : 0;
    } else {
      const players = new Map(practicePlayers.filter((row) => row?.id).map((row) => [row.id, row]));
      players.set(player?.id || "current", player);
      const earnedSeconds = [...players.values()].reduce((total, row) => total
        + activeModels.slice(0, Math.min(3, Number(row?.level) || 0)).reduce((sum, model, index) => {
          const passiveSeconds = Number(model.passiveSeconds);
          const questSeconds = Number(model.questSeconds);
          const practiceSeconds = Math.max(0, Number(row?.[`skill_${index + 1}_practice`]) || 0);
          return passiveSeconds > 0 && questSeconds > 0
            ? sum + practiceSeconds * passiveSeconds / questSeconds : sum;
        }, 0), Math.max(0, Number(completedPassiveSeconds) || 0));
      gain = periodTarget * earnedSeconds / periodSeconds;
    }
  }
  return {
    maxAbs: Math.abs(periodTarget) || 1, target: periodTarget, unit,
    value: gain + loss, gain, loss, paused,
    started_at: validStart ? startedAt.toISOString() : null,
    period_seconds: periodSeconds, elapsed_seconds: elapsedSeconds,
    target_cycle_seconds: cycleSeconds,
  };
};

export const getMannaRules = (profile, reference = new Date(), timeZone) => {
  const rules = {
    variables: {
      A: "Profile manna_target amount", C: "Profile manna_cycle duration in seconds",
      P: "Selected skill's passive cycle seconds", Q: "Skill practice goal seconds",
      t: "Elapsed seconds since that skill's start", p: "Current saved practice seconds for that skill",
      D: "Any desired duration in seconds",
    },
    formulas: {
      target_for_any_duration: "A * D / C",
      skill_target: "T = A * P / C",
      active_gain: "T * p / Q",
      active_loss: "-T * min(max(t, 0), P) / P",
      active_balance: "active_gain + active_loss",
      gain_per_completed_goal: "A * P / C",
      practice_needed_to_offset_loss: "Q * min(max(t, 0), P) / P",
      annual_earned_credit_seconds: "sum(completion_count_i * P_i) + sum(partial_practice_i * P_i / Q_i)",
      annual_gain: "A / C * annual_earned_credit_seconds",
      annual_loss: "-A / C * min(max(account_age_seconds, 0), year_seconds)",
      annual_balance: "annual_gain + annual_loss",
    },
    behavior: [
      "Practice and its labels belong to each participation's Master game, not the user's authored game.",
      "Each active skill has its own start, counter and balance. Practice in another slot does not change its bar.",
      "Current quest at level 2 or 3 is paused until accepted; other unlocked skills and the annual overview are not paused.",
      "Completing an objective archives a completion, keeps excess practice as remainder and restarts that skill's cycle. Expired level-4 cycles can restart on game synchronization without creating a completion or erasing partial practice.",
      "Active bars show the current cycle only. Archived goals contribute to the annual passive/ultimate overview, not to an active bar.",
      "Annual overview starts at Auth account creation, includes all participations, caps only passive elapsed loss at one configured year and does not cap gains.",
      "Month normalization uses the calendar month containing the selected skill start, or Auth creation for the annual overview. It can vary with timezone and daylight saving. The Moon skill cycle is a fixed config duration and is distinct from a calendar month.",
      "All displayed and reconstructed amounts use the current profile target and unit. Completions do not store past target amounts or historical Manna earnings, so these are revalued gains, not an immutable financial ledger.",
      "Manna is a computed game balance, not a stored wallet or a currency exchange. Unsaved browser timer seconds are unavailable to the MCP.",
    ],
    year_seconds: MANNA_YEAR_SECONDS,
    skills: getMannaSkillModels(),
  };
  if (!profile) return rules;
  const amount = Number(profile.manna_target);
  const cycle = normalizeMannaCycle(profile.manna_cycle);
  const cycleSeconds = getMannaCycleSeconds(cycle, reference, timeZone);
  return { ...rules,
    settings: { amount: Number.isFinite(amount) ? amount : 0, cycle,
      unit: normalizeMannaUnit(profile.manna_unit), reference_at: reference.toISOString(),
      time_zone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      cycle_seconds: cycleSeconds },
    cycle_targets: Object.fromEntries(["year", "month", "day", "hour"].map((period) => {
      const seconds = getMannaCycleSeconds(period, reference, timeZone);
      return [period, { seconds, amount: Number.isFinite(amount) ? amount * seconds / cycleSeconds : 0 }];
    })),
  };
};
