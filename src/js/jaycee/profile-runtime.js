import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee
} from "./profile-core.js";
import {
  JAYCEE_GAME_CYCLE_LABELS,
  JAYCEE_GAME_CONFIG
} from "../config/game-config.js";
import {
  createPlayerForGame,
  fetchPlayerForGame,
  fetchProfileByUserId,
  fetchProfileByUsername,
  fetchPublicProfiles,
  fetchSkillsByIds,
  fetchUserDynamicFractals,
  fetchUserGameSettings,
  getAvatarImageUrl,
  getDisplayValue,
  getThemeSettingsFromProfile,
  loadOptionalImage
} from "../config/data.js";

const PROFILE_CORE_METRICS = {
  fullSquare: true
};
const PROFILE_RING_FILL_ALPHA = 0.26;
const ACTIVE_RING_LIMIT = 3;
const YEAR_SECONDS = JAYCEE_GAME_CONFIG.passive.cycleSeconds;
const DAY_SECONDS = 24 * 60 * 60;
const MANNA_CYCLE_SECONDS = {
  day: DAY_SECONDS,
  month: YEAR_SECONDS / 12,
  year: YEAR_SECONDS
};

const applyProfileTheme = (profile) => {
  const theme = getThemeSettingsFromProfile(profile).theme;

  document.body.dataset.theme = theme;
};

const getLoginUrl = () => (
  new URL(
    window.JayceeAuth?.getLoginUrl
      ? window.JayceeAuth.getLoginUrl()
      : "/auth.html",
    window.location.origin
  )
);

const redirectToLogin = () => {
  const loginUrl = getLoginUrl();

  loginUrl.searchParams.set("redirect", `${window.location.pathname}${window.location.search}`);
  window.location.href = loginUrl.href;
};

const getEmptyLabels = (count) => Array.from({ length: count }, () => "");

const formatDuration = (secondsValue, { compact = true } = {}) => {
  let seconds = Math.round(Number(secondsValue));

  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  const day = 24 * 60 * 60;
  const hour = 60 * 60;
  const days = Math.floor(seconds / day);
  seconds -= days * 24 * 60 * 60;
  const hours = Math.floor(seconds / hour);
  seconds -= hours * hour;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  const parts = [
    ...(days ? [`${days}d`] : []),
    ...(hours ? [`${hours}h`] : []),
    ...(minutes ? [`${minutes}min`] : []),
    ...(seconds ? [`${seconds}s`] : [])
  ];

  if (compact && parts.length > 2) {
    return parts.slice(0, 2).join(" ");
  }

  return parts.join(" ");
};

const formatDistance = (metersValue) => {
  const meters = Number(metersValue);

  if (!Number.isFinite(meters) || meters <= 0) return "";

  if (meters >= 1000) {
    const kilometers = meters / 1000;

    return `${Number.isInteger(kilometers) ? kilometers : Number(kilometers.toFixed(2))}km`;
  }

  return `${Number.isInteger(meters) ? meters : Number(meters.toFixed(2))}m`;
};

const getAgeInYears = (birthDate) => {
  const value = getDisplayValue(birthDate);
  const date = value ? new Date(`${value}T00:00:00`) : null;

  if (!date || Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const birthdayThisYear = new Date(now.getFullYear(), date.getMonth(), date.getDate());

  if (now < birthdayThisYear) {
    age -= 1;
  }

  return Math.max(0, age);
};

const getAgeInSeconds = (birthDate) => {
  const age = getAgeInYears(birthDate);

  return age === null ? null : age * YEAR_SECONDS;
};

const formatYearsFromSeconds = (secondsValue) => {
  const seconds = Number(secondsValue);

  if (!Number.isFinite(seconds) || seconds <= 0) return "0y";

  const years = Math.round(seconds / YEAR_SECONDS);

  return `${years.toLocaleString()}y`;
};

const normalizeMannaCycle = (cycle) => (
  Object.prototype.hasOwnProperty.call(MANNA_CYCLE_SECONDS, getDisplayValue(cycle))
    ? getDisplayValue(cycle)
    : "year"
);

const normalizeMannaUnit = (unit) => (
  /^[A-Z]{3}$/.test(getDisplayValue(unit).toUpperCase())
    ? getDisplayValue(unit).toUpperCase()
    : "EUR"
);

const getMannaCycleSeconds = (cycle, now = new Date()) => {
  if (cycle === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return Math.max(1, (end.getTime() - start.getTime()) / 1000);
  }

  return MANNA_CYCLE_SECONDS[cycle] || MANNA_CYCLE_SECONDS.year;
};

const getCurrencySymbol = (unit) => {
  const currency = normalizeMannaUnit(unit);

  try {
    const symbol = new Intl.NumberFormat(undefined, {
      currency,
      currencyDisplay: "narrowSymbol",
      style: "currency"
    }).formatToParts(0).find((part) => part.type === "currency")?.value;

    return symbol || currency;
  } catch (error) {
    return currency;
  }
};

const formatMannaValue = (value, unit) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return "";

  const amount = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(numericValue);

  return `${amount} ${getCurrencySymbol(unit)}`;
};

const getProfileInitial = (profile) => (
  (getDisplayValue(profile?.username) || getDisplayValue(profile?.full_name) || "?").slice(0, 1).toUpperCase()
);

const getCurrentPeriodBounds = (level, now = new Date()) => {
  if (level === 1) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return { end, start };
  }

  if (level === 2) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return { end, start };
  }

  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + 1);

  return { end, start };
};

const getSelectedActiveLevel = (player, selectedAbilityIndex = 0) => {
  const level = Math.min(ACTIVE_RING_LIMIT, Math.max(1, Number(player?.level) || 1));

  return selectedAbilityIndex >= 1 && selectedAbilityIndex <= level
    ? selectedAbilityIndex
    : level;
};

const getMannaModel = ({ player, playerProfile, selectedAbilityIndex = 0 }) => {
  const level = getSelectedActiveLevel(player, selectedAbilityIndex);
  const mannaTarget = Number(playerProfile?.manna_target);
  const mannaCycle = normalizeMannaCycle(playerProfile?.manna_cycle);
  const mannaUnit = normalizeMannaUnit(playerProfile?.manna_unit);
  const now = new Date();
  const abilityConfig = JAYCEE_GAME_CONFIG.activeAbilities[level - 1] || JAYCEE_GAME_CONFIG.activeAbilities[0];
  const { end, start } = getCurrentPeriodBounds(level, now);
  const periodSeconds = Math.max(1, (end.getTime() - start.getTime()) / 1000);
  const elapsedSeconds = Math.min(periodSeconds, Math.max(0, (now.getTime() - start.getTime()) / 1000));
  const periodTarget = Number.isFinite(mannaTarget)
    ? mannaTarget * (periodSeconds / getMannaCycleSeconds(mannaCycle, now))
    : 0;
  const activeCycleSeconds = periodSeconds / Math.max(1, Number(abilityConfig?.ratio) || 1);
  const practiceSeconds = Number(player?.[`skill_${level}_practice`]) || 0;
  const negativeManna = -periodTarget * (elapsedSeconds / periodSeconds);
  const positiveManna = activeCycleSeconds > 0
    ? periodTarget * (practiceSeconds / activeCycleSeconds)
    : 0;
  const value = negativeManna + positiveManna;

  return {
    maxAbs: Math.max(1, Math.abs(periodTarget)),
    target: periodTarget,
    unit: mannaUnit,
    value
  };
};

const getFractalById = (dynamicFractals, fractalId) => (
  dynamicFractals.find((fractal) => getDisplayValue(fractal.id) === getDisplayValue(fractalId)) || null
);

const getFractalByLabel = (dynamicFractals, label) => (
  dynamicFractals.find((fractal) => (
    getDisplayValue(fractal.label).toLowerCase() === getDisplayValue(label).toLowerCase()
  )) || null
);

const createFractalMeasureModel = ({
  cycleSeconds,
  distanceMeters,
  fractal,
  passiveSeconds = null,
  skill = null,
  skillLabel = ""
}) => {
  if (!fractal) return null;

  return {
    cycleSeconds,
    distanceMeters,
    fractal,
    label: getDisplayValue(fractal.label) || "Fractal",
    passiveSeconds,
    skill,
    skillLabel,
    questSeconds: cycleSeconds
  };
};

const getPassiveFractalModel = ({
  dynamicFractals,
  gameForm
}) => {
  const fractal = getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.passive.fractalLabel)
    || getFractalById(dynamicFractals, gameForm?.primary_fractal);

  return createFractalMeasureModel({
    cycleSeconds: JAYCEE_GAME_CONFIG.passive.cycleSeconds,
    distanceMeters: JAYCEE_GAME_CONFIG.passive.zoneMeters,
    fractal
  });
};

const getActiveFractals = (dynamicFractals, gameForm) => {
  const excludedIds = new Set([
    getDisplayValue(gameForm?.primary_fractal),
    getDisplayValue(gameForm?.ultimate_fractal)
  ].filter(Boolean));

  return JAYCEE_GAME_CONFIG.activeAbilities
    .map((ability) => getFractalByLabel(dynamicFractals, ability.fractalLabel))
    .filter((fractal) => (
      fractal
      && getDisplayValue(fractal.id)
      && getDisplayValue(fractal.skill)
      && !excludedIds.has(getDisplayValue(fractal.id))
    ));
};

const getActiveFractalModels = ({
  dynamicFractals,
  gameForm,
  skillForms
}) => {
  let previousQuestSeconds = Number(JAYCEE_GAME_CONFIG.passive.cycleSeconds);
  let previousDistanceMeters = Number(JAYCEE_GAME_CONFIG.passive.zoneMeters);
  const activeFractals = getActiveFractals(dynamicFractals, gameForm);
  const models = activeFractals.length
    ? activeFractals
    : JAYCEE_GAME_CONFIG.activeAbilities.map((ability, index) => ({
      id: `default-active-${index + 1}`,
      label: ability.fractalLabel,
      skill: ""
    }));

  return models
    .slice(0, ACTIVE_RING_LIMIT)
    .map((fractal, index) => {
      const abilityConfig = JAYCEE_GAME_CONFIG.activeAbilities[index] || {};
      const skill = getSkillById(skillForms, fractal.skill);
      const skillRatio = Number(abilityConfig.ratio);
      const questSeconds = Number.isFinite(previousQuestSeconds) && Number.isFinite(skillRatio) && skillRatio > 0
        ? previousQuestSeconds / skillRatio
        : null;
      const distanceMeters = Number.isFinite(previousDistanceMeters) && Number.isFinite(skillRatio) && skillRatio > 0
        ? previousDistanceMeters / skillRatio
        : null;

      if (!fractal) return null;

      previousQuestSeconds = questSeconds;
      previousDistanceMeters = distanceMeters;

      return createFractalMeasureModel({
        cycleSeconds: questSeconds,
        distanceMeters,
        fractal: {
          ...fractal,
          label: abilityConfig.fractalLabel || fractal.label
        },
        passiveSeconds: abilityConfig.cycleSeconds,
        skill,
        skillLabel: getDisplayValue(skill.label) || getDisplayValue(abilityConfig.skillLabel) || "Active"
      });
    })
    .filter(Boolean);
};

const getPassiveModel = ({ dynamicFractals, gameForm }) => {
  const fractal = getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.passive.fractalLabel)
    || getFractalById(dynamicFractals, gameForm?.primary_fractal);
  const label = getDisplayValue(JAYCEE_GAME_CONFIG.passive.fractalLabel || fractal?.label);

  if (!label && !getDisplayValue(JAYCEE_GAME_CONFIG.passive.cycleSeconds) && !getDisplayValue(JAYCEE_GAME_CONFIG.passive.zoneMeters)) return null;

  return {
    distanceMeters: Number(JAYCEE_GAME_CONFIG.passive.zoneMeters),
    label: label || "Passive",
    cycleSeconds: Number(JAYCEE_GAME_CONFIG.passive.cycleSeconds)
  };
};

const getSkillById = (skillForms, skillId) => (
  (skillForms || []).find((skill) => getDisplayValue(skill.id) === getDisplayValue(skillId)) || null
);

const getCurrentQuestModel = ({
  dynamicFractals = [],
  gameForm = {},
  player,
  selectedAbilityIndex = 0,
  skillForms = []
}) => {
  if (!player) return null;

  const level = getSelectedActiveLevel(player, selectedAbilityIndex);
  const activeModels = getActiveFractalModels({
    dynamicFractals,
    gameForm,
    skillForms
  });
  const questActiveIndex = Math.min(level, activeModels.length) - 1;
  const activeModel = activeModels[questActiveIndex] || null;

  if (!activeModel) return null;

  const skillName = getDisplayValue(activeModel?.skillLabel)
    || getDisplayValue(activeModel?.skill?.label)
    || getDisplayValue(activeModel?.label)
    || "your skill";
  const duration = formatDuration(activeModel?.questSeconds, { compact: false }) || "0s";

  return {
    cycleLabel: JAYCEE_GAME_CYCLE_LABELS.activeAbilities[level - 1] || "Cycle",
    duration,
    skillName
  };
};

const getUltimateModel = ({ dynamicFractals, gameForm, publicProfiles, ultimateTeammateSkillLabel }) => {
  const fractal = getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.ultimate.fractalLabel)
    || getFractalById(dynamicFractals, gameForm?.ultimate_fractal);
  const label = getDisplayValue(fractal?.label);
  const linkedProfile = publicProfiles.find((profile) => (
    getDisplayValue(profile.id) === getDisplayValue(gameForm?.ultimate_link)
  ));

  if (!label && !ultimateTeammateSkillLabel && !linkedProfile) return null;

  return {
    label: label || "Ultimate",
    linkedProfile,
    skillLabel: ultimateTeammateSkillLabel
  };
};

const getPublicProfileUrl = (profile) => {
  const username = getDisplayValue(profile?.username);

  return username ? `/game.html?username=${encodeURIComponent(username)}` : "";
};

const createGameSelect = (profiles, selectedUsername = "") => {
  const label = document.createElement("label");
  const text = document.createElement("span");
  const select = document.createElement("select");
  const defaultOption = document.createElement("option");

  label.className = "profile-fractal-select";
  text.textContent = "Choose a game";
  defaultOption.value = "";
  defaultOption.textContent = "jaycee";
  select.replaceChildren(defaultOption, ...profiles.map((profile) => {
    const option = document.createElement("option");
    const username = getDisplayValue(profile.username);

    option.value = username;
    option.textContent = username;

    return option;
  }));
  select.value = selectedUsername;
  select.addEventListener("change", () => {
    const username = getDisplayValue(select.value);

    if (!username) return;
    window.location.href = `/game.html?username=${encodeURIComponent(username)}`;
  });
  label.append(text, select);

  return label;
};

const createVitalBar = ({ centered = false, current, label, max, tone, valueText }) => {
  const bar = document.createElement("div");
  const header = document.createElement("div");
  const name = document.createElement("span");
  const value = document.createElement("span");
  const track = document.createElement("div");
  const fill = document.createElement("span");
  const numericCurrent = Number(current);
  const numericMax = Number(max);
  const progress = Number.isFinite(numericCurrent) && Number.isFinite(numericMax) && numericMax > 0
    ? centered
      ? Math.min(1, Math.max(0, (numericCurrent / numericMax + 1) / 2))
      : Math.min(1, Math.max(0, numericCurrent / numericMax))
    : 0;

  bar.className = `profile-vital-bar is-${tone}`;
  bar.classList.toggle("is-centered", centered);
  bar.classList.toggle("is-empty", !valueText);
  header.className = "profile-vital-header";
  name.textContent = label;
  value.textContent = valueText;
  track.className = "profile-vital-track";
  fill.className = "profile-vital-fill";
  if (centered) {
    const offset = Math.abs(progress - 0.5) * 100;

    fill.style.left = progress >= 0.5 ? "50%" : `${50 - offset}%`;
    fill.style.width = `${offset}%`;
  } else {
    fill.style.width = `${progress * 100}%`;
  }
  header.append(name, value);
  track.append(fill);
  bar.append(header, track);

  return bar;
};

const createProfileNotice = ({
  action = null,
  closable = false,
  text,
  title,
  tone = "notification"
}) => {
  const panel = document.createElement("article");
  const header = document.createElement("h2");
  const icon = document.createElement("span");
  const copy = document.createElement("p");

  panel.className = `profile-notice-panel is-${tone}`;
  header.className = "profile-notice-title";
  icon.className = "profile-notice-icon";
  icon.textContent = tone === "unlocked" ? "+" : tone === "quest" ? "!" : "i";
  header.replaceChildren(icon, title);
  copy.className = "profile-notice-copy";
  copy.textContent = text;
  panel.append(header, copy);

  if (action) {
    panel.append(action);
  }

  if (closable) {
    const closeButton = document.createElement("button");

    closeButton.className = "profile-notice-close";
    closeButton.type = "button";
    closeButton.textContent = "x";
    closeButton.setAttribute("aria-label", "Dismiss notification");
    closeButton.addEventListener("click", () => {
      panel.classList.add("is-dismissing");
      window.setTimeout(() => panel.remove(), 180);
    });
    panel.append(closeButton);
  }

  return panel;
};

const getPendingPrayerActiveMs = () => {
  try {
    const pendingPrayer = JSON.parse(window.localStorage.getItem("jaycee_pending_prayer") || "{}");
    const activeMs = Number(pendingPrayer.active_typing_ms);

    if (Number.isFinite(activeMs)) {
      return Math.max(0, activeMs);
    }

    return Math.max(0, (Number(pendingPrayer.active_typing_seconds) || 0) * 1000);
  } catch {
    return 0;
  }
};

const getFirstActiveSkillMs = () => {
  const firstActiveAbility = JAYCEE_GAME_CONFIG.activeAbilities?.[0];
  const ratio = Number(firstActiveAbility?.ratio) || 1;

  return (JAYCEE_GAME_CONFIG.passive.cycleSeconds / ratio) * 1000;
};

const formatKarmaYears = (yearsValue) => {
  const years = Number(yearsValue);

  if (!Number.isFinite(years) || years <= 0) return "0";

  return years.toLocaleString(undefined, {
    maximumFractionDigits: years < 1 ? 8 : 2
  });
};

const createVitalsPanel = ({
  dynamicFractals,
  gameForm,
  onPlay,
  player,
  playerAvatarUrl = "",
  playerProfile,
  profile,
  selectedAbilityIndex,
  skillForms
}) => {
  const panel = document.createElement("section");
  const hud = document.createElement("div");
  const identity = document.createElement("div");
  const avatar = document.createElement("div");
  const levelBadge = document.createElement("p");
  const bars = document.createElement("div");
  const profileLabel = document.createElement("h2");
  const playButton = document.createElement("button");
  const lifeMaxSeconds = JAYCEE_GAME_CONFIG.lifeMaxYears * YEAR_SECONDS;
  const lifeMaxYears = JAYCEE_GAME_CONFIG.lifeMaxYears;
  const isGuestPlayer = !player;
  const hasPlayer = Boolean(player) || isGuestPlayer;
  const hasPlayerProfile = Boolean(playerProfile);
  const guestLevelYears = 1;
  const level = Number(player?.level) || 1;
  const storedUsername = getDisplayValue(window.localStorage.getItem("jaycee_username"));
  const channelUsername = getDisplayValue(profile?.username)
    || getDisplayValue(window.localStorage.getItem("jaycee_pending_prayer_target_username"))
    || "";
  const mannaModel = player ? getMannaModel({ player, playerProfile, selectedAbilityIndex }) : null;
  const prayerActiveMs = getPendingPrayerActiveMs();
  const firstActiveSkillMs = getFirstActiveSkillMs();
  const prayerKarmaYears = firstActiveSkillMs > 0 ? prayerActiveMs / firstActiveSkillMs : 0;
  const guestLifeSeconds = prayerKarmaYears * YEAR_SECONDS;
  const lifeSeconds = player ? Number(player.life_bar) || 0 : guestLifeSeconds;
  const lifeValueText = player ? formatYearsFromSeconds(lifeSeconds) : `${formatKarmaYears(prayerKarmaYears)}y`;
  const remainingKarmaYears = Math.max(0, lifeMaxYears - guestLevelYears - prayerKarmaYears);
  const questModel = getCurrentQuestModel({
    dynamicFractals,
    gameForm,
    player,
    selectedAbilityIndex,
    skillForms
  });

  panel.className = "profile-vitals-panel";
  panel.dataset.profileVitals = "";
  profileLabel.className = "profile-section-label";
  profileLabel.textContent = "Profile";
  bars.className = "profile-vital-stack";
  bars.replaceChildren(
    createVitalBar({
      current: lifeSeconds,
      label: "Health",
      max: lifeMaxSeconds,
      tone: "health",
      valueText: `${lifeValueText} / ${JAYCEE_GAME_CONFIG.lifeMaxYears.toLocaleString()}y`
    }),
    createVitalBar({
      centered: true,
      current: mannaModel?.value || 0,
      label: "Manna",
      max: mannaModel?.maxAbs || 1,
      tone: "manna",
      valueText: player && mannaModel
        ? `${formatMannaValue(mannaModel.value, mannaModel.unit)} / ${formatMannaValue(mannaModel.target, mannaModel.unit)}`
        : "0 € / 0 €"
    })
  );
  panel.replaceChildren();

  if (player && questModel) {
    panel.append(createProfileNotice({
      text: `You have 1 ${questModel.cycleLabel} to do ${questModel.duration} of ${questModel.skillName}.`,
      title: "Quest",
      tone: "quest"
    }));
  } else if (!player) {
    panel.append(createProfileNotice({
      closable: true,
      text: `Congratulations! You have unlocked level 1. It has been calculated by the great Masters of this game that it takes approximately ${lifeMaxYears.toLocaleString()} years for an average Human being to burn all his Karma and leave the Earth. Your prayer has burned ${formatKarmaYears(prayerKarmaYears)} years of Karma. You have more than ${formatKarmaYears(remainingKarmaYears)} years left.`,
      title: "Unlocked",
      tone: "unlocked"
    }));
  }

  if (!player) {
    playButton.className = "profile-play-button";
    playButton.type = "button";
    playButton.textContent = hasPlayerProfile ? "Play" : "Log in / create account";
    playButton.addEventListener("click", onPlay);
    panel.append(createProfileNotice({
      action: playButton,
      text: `Unlock Level 2: Save your progress, obtain a new ability, burn more Karma and obtain more resources from ${channelUsername || "this profile"}.`,
      title: "Quest",
      tone: "quest"
    }));
  }

  panel.append(profileLabel);

  if (hasPlayer || !hasPlayerProfile) {
    hud.className = "profile-player-hud";
    identity.className = "profile-player-identity";
    avatar.className = "profile-player-avatar";
    if (player && playerAvatarUrl) {
      const image = document.createElement("img");

      image.alt = "";
      image.src = playerAvatarUrl;
      avatar.append(image);
    } else {
      avatar.textContent = player ? getProfileInitial(playerProfile) : (storedUsername || "?").slice(0, 1).toUpperCase();
    }
    levelBadge.className = "profile-player-level";
    levelBadge.textContent = `${storedUsername || getDisplayValue(playerProfile?.username) || "Player"} - Level ${level}`;
    identity.append(avatar, levelBadge);
    hud.append(identity, bars);
    panel.append(hud);
  }

  if (!player && hasPlayerProfile) {
    panel.append(bars);
  }

  return panel;
};

const getPublicProfileUsernameFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const queryUsername = getDisplayValue(params.get("username"));

  if (queryUsername) return queryUsername;
  if (!window.location.pathname.endsWith("/game.html")) return "";

  const match = window.location.pathname.match(/\/jaycee-([^/]+)\.html$/);

  return match && match[1] !== "profile" ? decodeURIComponent(match[1]) : "";
};

const createEmptyGameSettings = () => ({
  primary_fractal: "",
  ultimate_fractal: "",
  ultimate_link: ""
});

const createGameForm = (settings) => ({
  primary_fractal: getDisplayValue(settings?.primary_fractal),
  ultimate_fractal: getDisplayValue(settings?.ultimate_fractal),
  ultimate_link: getDisplayValue(settings?.ultimate_link)
});

const createSkillForms = (skills) => (
  (skills || []).map((skill) => ({
    id: skill.id,
    label: getDisplayValue(skill.label)
  }))
);

const createLockedIcon = (className = "profile-ability-lock-icon") => {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  icon.classList.add(className);
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  rect.setAttribute("x", "5");
  rect.setAttribute("y", "10");
  rect.setAttribute("width", "14");
  rect.setAttribute("height", "10");
  rect.setAttribute("rx", "2");
  path.setAttribute("d", "M8 10V7a4 4 0 0 1 8 0v3");
  icon.append(rect, path);

  return icon;
};

const createFractalParameterPanel = ({
  activeModels,
  currentLevel = 0,
  isDescriptionClosing = false,
  onSelect,
  passiveModel,
  selectedIndex = null,
  ultimateModel
}) => {
  if (!passiveModel && !activeModels.length && !ultimateModel) return null;

  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const buttons = document.createElement("div");
  const description = document.createElement("article");
  const descriptionTitle = document.createElement("h3");
  const list = document.createElement("dl");
  const abilities = [];

  section.className = "profile-parameter-panel";
  section.dataset.profileParameters = "";
  heading.textContent = "Abilities";
  buttons.className = "profile-ability-bar";
  description.className = "profile-parameter-section";
  list.className = "profile-parameter-list";

  if (passiveModel) {
    abilities.push({
      label: passiveModel.label,
      rows: [{
        label: "Passive",
        value: formatDuration(passiveModel.cycleSeconds, { compact: false }) || "00:00:00"
      }, {
        label: "Zone",
        value: formatDistance(passiveModel.distanceMeters) || "0m"
      }],
      type: "passive",
      unlockLevel: 0
    });
  }
  activeModels.forEach((fractalModel) => {
    abilities.push({
      label: fractalModel.label,
      rows: [{
        label: "Passive",
        value: formatDuration(fractalModel.passiveSeconds, { compact: false }) || "00:00:00"
      }, {
        label: "Active",
        value: formatDuration(fractalModel.questSeconds, { compact: false }) || "00:00:00"
      }, {
        label: "Zone",
        value: formatDistance(fractalModel.distanceMeters) || "0m"
      }, {
        label: "Skill",
        value: fractalModel.skillLabel
      }],
      type: "active",
      unlockLevel: abilities.length
    });
  });

  if (ultimateModel) {
    const profileUrl = getPublicProfileUrl(ultimateModel.linkedProfile);

    abilities.push({
      label: ultimateModel.label,
      rows: [{
        href: profileUrl,
        isProfileLink: true,
        label: "Follows",
        value: getDisplayValue(ultimateModel.linkedProfile?.username) || "No follows"
      }, {
        label: "Skill",
        value: ultimateModel.skillLabel || "No skill"
      }],
      type: "ultimate",
      unlockLevel: 4
    });
  }

  const activeIndex = selectedIndex === null || selectedIndex === undefined
    ? null
    : Math.min(Math.max(0, selectedIndex), Math.max(0, abilities.length - 1));
  const activeAbility = activeIndex === null ? null : abilities[activeIndex];

  abilities.forEach((ability, index) => {
    const button = document.createElement("button");
    const isLocked = currentLevel < ability.unlockLevel;
    const isActive = !isLocked && !isDescriptionClosing && index === activeIndex;

    button.className = "profile-ability-button";
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-locked", isLocked);
    button.classList.add(ability.type === "active" ? "is-active-skill" : `is-${ability.type}`);
    button.type = "button";
    button.dataset.state = ability.type === "passive" ? "Passive" : isLocked ? "" : ability.type === "ultimate" ? "Ultimate" : "Ready";
    button.disabled = isLocked;
    button.textContent = ability.label;
    button.setAttribute("aria-pressed", String(isActive));
    if (isLocked) {
      const lockStatus = document.createElement("span");
      const lockText = document.createElement("span");

      lockStatus.className = "profile-ability-lock-status";
      lockText.textContent = "Locked";
      lockStatus.append(createLockedIcon(), lockText);
      button.append(lockStatus);
    } else {
      button.addEventListener("click", () => onSelect?.(index));
    }
    buttons.append(button);
  });

  if (activeAbility && currentLevel >= activeAbility.unlockLevel) {
    descriptionTitle.textContent = "Description";
    description.classList.toggle("is-closing", isDescriptionClosing);
    activeAbility.rows.forEach((row) => {
      const label = document.createElement("dt");
      const value = document.createElement("dd");

      label.textContent = row.label;
      if (row.href) {
        const link = document.createElement("a");

        link.className = row.isProfileLink ? "profile-parameter-profile-link" : "";
        link.href = row.href;
        link.textContent = row.value;
        value.append(link);
      } else {
        value.textContent = row.value;
      }
      list.append(label, value);
    });
    description.append(descriptionTitle, list);
  }

  section.append(heading, buttons);

  if (description.childElementCount) {
    section.append(description);
  }

  return section;
};

const createProfileCoreState = ({
  avatarImage,
  hasUserProfile
}) => {
  return {
    ...createJayceeState({
      coreSquareLabels: getEmptyLabels(JAYCEE_ORDER.length),
      rings: []
    }),
    activeSquareNumber: 0,
    metrics: PROFILE_CORE_METRICS,
    squareBorderAlpha: 0.46,
    squareFillAlpha: hasUserProfile ? 0 : PROFILE_RING_FILL_ALPHA,
    squareCellBorderAlpha: 0.34,
    squareSubCellBorderAlpha: hasUserProfile ? 0.18 : undefined,
    showSquareInteriorFractals: hasUserProfile,
    mapSquare: null,
    squareBackgroundImage: null,
    squareCenterBackgroundImage: avatarImage
  };
};

export const initJayceePage = async () => {
  const shell = document.querySelector("[data-profile-shell]");
  const canvas = document.querySelector("[data-profile-canvas]");
  const publicUsername = getDisplayValue(shell?.dataset.profileUsername) || getPublicProfileUsernameFromUrl();
  const pageMode = getDisplayValue(shell?.dataset.profileMode) || (publicUsername ? "public" : "profile");
  const isGamePage = document.body.classList.contains("game-page");
  const isPresentPage = pageMode === "present";
  const isEditableProfilePage = pageMode === "profile" && !publicUsername;
  const hasUserProfile = Boolean(publicUsername) || isEditableProfilePage;
  const shouldRenderGameInterface = isGamePage || hasUserProfile;

  if (!shell || !canvas) return;

  let dynamicFractals = [];
  let publicProfiles = [];
  let avatarImage = null;
  let currentProfile = null;
  let currentPlayer = null;
  let gameForm = createEmptyGameSettings();
  let gameSettings = null;
  let isPlayerSaving = false;
  let playerAvatarUrl = "";
  let playerProfile = null;
  let closingAbilityIndex = null;
  let descriptionCloseTimer = 0;
  let selectedAbilityIndex = null;
  let supabaseClient = null;
  let skillForms = [];
  let skills = [];
  let ultimateTeammateSkillLabel = "";
  const getOwnUltimateSkillLabel = () => {
    const ultimateFractal = getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.ultimate.fractalLabel)
      || getFractalById(dynamicFractals, gameForm?.ultimate_fractal);
    const skill = getSkillById(skillForms, ultimateFractal?.skill);

    return getDisplayValue(skill?.label);
  };

  const loadUltimateTeammateSkillLabel = async () => {
    const teammateId = getDisplayValue(gameForm?.ultimate_link);
    const linkedProfile = publicProfiles.find((profile) => getDisplayValue(profile.id) === teammateId);

    if (!teammateId || !linkedProfile || !supabaseClient) {
      ultimateTeammateSkillLabel = "";
      return;
    }

    if (getDisplayValue(currentProfile?.id) === teammateId) {
      ultimateTeammateSkillLabel = getOwnUltimateSkillLabel();
      return;
    }

    const linkedGame = await fetchUserGameSettings(supabaseClient, linkedProfile);
    const linkedFractals = await fetchUserDynamicFractals(supabaseClient, linkedProfile);
    const linkedUltimateFractal = getFractalByLabel(linkedFractals, JAYCEE_GAME_CONFIG.ultimate.fractalLabel)
      || getFractalById(linkedFractals, linkedGame?.ultimate_fractal);
    const [linkedSkill] = await fetchSkillsByIds(supabaseClient, [linkedUltimateFractal?.skill]);

    ultimateTeammateSkillLabel = getDisplayValue(linkedSkill?.label);
  };

  const handlePlayClick = async () => {
    if (isPlayerSaving) return;

    if (!playerProfile) {
      redirectToLogin();
      return;
    }

    if (!supabaseClient || !currentProfile) return;

    isPlayerSaving = true;
    renderVitalsPanel();

    try {
      currentPlayer = await createPlayerForGame(supabaseClient, playerProfile, currentProfile, {
        life_bar: getAgeInSeconds(playerProfile.birth_date) || 0
      });
    } catch (error) {
      console.error("Jaycee player could not be created", error);
    } finally {
      isPlayerSaving = false;
      renderVitalsPanel();
      renderCoreParameters();
    }
  };

  const renderPresentControls = () => {
    if (!canvas) return;

    const corePanel = canvas.closest(".jaycee-profile-core");
    const existingControls = corePanel?.querySelector("[data-profile-present-controls]");

    if (!corePanel || !isPresentPage) {
      existingControls?.remove();
      corePanel?.classList.remove("has-fractal-controls");
      return;
    }

    const controls = existingControls || document.createElement("div");

    corePanel.classList.add("has-fractal-controls");
    controls.className = "profile-fractal-selectors";
    controls.dataset.profilePresentControls = "";
    controls.replaceChildren(createGameSelect(publicProfiles));

    if (!existingControls) {
      corePanel.insertBefore(controls, canvas);
    }
  };

  const renderVitalsPanel = () => {
    if (!canvas) return;

    const corePanel = canvas.closest(".jaycee-profile-core");
    const existingPanel = corePanel?.querySelector("[data-profile-vitals]");

    if (!corePanel || !shouldRenderGameInterface) {
      existingPanel?.remove();
      return;
    }

    const panel = createVitalsPanel({
      dynamicFractals,
      gameForm,
      onPlay: handlePlayClick,
      player: currentPlayer,
      playerAvatarUrl,
      playerProfile,
      profile: currentProfile,
      selectedAbilityIndex,
      skillForms
    });

    if (existingPanel) {
      existingPanel.replaceWith(panel);
    } else {
      corePanel.insertBefore(panel, corePanel.firstChild);
    }
  };

  const renderCoreParameters = () => {
    if (!canvas) return;

    const corePanel = canvas.closest(".jaycee-profile-core");
    const existingPanel = corePanel?.querySelector("[data-profile-parameters]");
    const existingInventoryTitle = corePanel?.querySelector("[data-profile-inventory-title]");
    const activeModels = getActiveFractalModels({
      dynamicFractals,
      gameForm,
      skillForms
    });
    const passiveModel = getPassiveFractalModel({
      dynamicFractals,
      gameForm
    }) || getPassiveModel({ dynamicFractals, gameForm });
    const ultimateModel = getUltimateModel({
      dynamicFractals,
      gameForm,
      publicProfiles,
      ultimateTeammateSkillLabel
    });
    const panel = createFractalParameterPanel({
      activeModels,
      currentLevel: Number(currentPlayer?.level) || (document.body.classList.contains("game-page") ? 1 : 0),
      onSelect: (index) => {
        if (descriptionCloseTimer) {
          window.clearTimeout(descriptionCloseTimer);
          descriptionCloseTimer = 0;
        }

        if (selectedAbilityIndex === index) {
          closingAbilityIndex = index;
          selectedAbilityIndex = null;
          renderCoreParameters();
          renderVitalsPanel();
          descriptionCloseTimer = window.setTimeout(() => {
            closingAbilityIndex = null;
            descriptionCloseTimer = 0;
            renderCoreParameters();
          }, 180);
          return;
        }

        closingAbilityIndex = null;
        selectedAbilityIndex = index;
        renderCoreParameters();
        renderVitalsPanel();
      },
      isDescriptionClosing: closingAbilityIndex !== null,
      passiveModel,
      selectedIndex: closingAbilityIndex ?? selectedAbilityIndex,
      ultimateModel
    });

    if (!corePanel || !panel) {
      existingPanel?.remove();
      existingInventoryTitle?.remove();
      return;
    }

    if (existingPanel) {
      existingPanel.replaceWith(panel);
    } else {
      corePanel.insertBefore(panel, canvas);
    }

    existingInventoryTitle?.remove();
  };

  const renderCore = () => {
    if (!canvas) return;
    if (document.body.classList.contains("game-page")) return;

    const coreState = createProfileCoreState({
      avatarImage,
      hasUserProfile
    });
    drawJaycee(canvas, coreState);
  };

  const scheduleRenderCore = () => {
    if (!canvas) return;

    window.requestAnimationFrame(renderCore);
  };

  try {
    const client = await window.JayceeAuth.getSupabaseClient();
    supabaseClient = client;
    const sessionResult = await window.JayceeAuth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (isEditableProfilePage && !user) {
      redirectToLogin();
      return;
    }

    const profile = !hasUserProfile
      ? null
      : publicUsername
        ? await fetchProfileByUsername(client, publicUsername)
        : await fetchProfileByUserId(client, user.id);
    currentProfile = profile;
    playerProfile = user
      ? getDisplayValue(profile?.id) === getDisplayValue(user.id)
        ? profile
        : await fetchProfileByUserId(client, user.id)
      : null;

    if (hasUserProfile && !profile) {
      shell.hidden = false;
      console.warn("Jaycee profile not found.");
      return;
    }

    shell.hidden = false;
    if (isEditableProfilePage) {
      applyProfileTheme(profile);
    }

    dynamicFractals = hasUserProfile ? await fetchUserDynamicFractals(client, profile) : [];
    skills = hasUserProfile
      ? await fetchSkillsByIds(client, dynamicFractals.map((fractal) => fractal.skill))
      : [];
    skillForms = createSkillForms(skills);
    gameSettings = hasUserProfile ? await fetchUserGameSettings(client, profile) : null;
    gameForm = createGameForm(gameSettings);
    currentPlayer = hasUserProfile && playerProfile
      ? await fetchPlayerForGame(client, playerProfile, profile)
      : null;
    if (playerProfile) {
      try {
        playerAvatarUrl = await getAvatarImageUrl(client, playerProfile);
      } catch (error) {
        console.warn("Jaycee player avatar could not be loaded", error);
        playerAvatarUrl = "";
      }
    }

    publicProfiles = (isPresentPage || hasUserProfile) ? await fetchPublicProfiles(client) : [];
    await loadUltimateTeammateSkillLabel();
    avatarImage = hasUserProfile
      ? await loadOptionalImage(await getAvatarImageUrl(client, profile))
      : null;
    renderCore();
    if (canvas) {
      const resizeObserver = new ResizeObserver(scheduleRenderCore);

      resizeObserver.observe(canvas);
      if (canvas.parentElement) {
        resizeObserver.observe(canvas.parentElement);
      }
      window.addEventListener("resize", scheduleRenderCore);
      window.addEventListener("load", scheduleRenderCore);
    }
    renderVitalsPanel();
    renderPresentControls();
    renderCoreParameters();
    scheduleRenderCore();
  } catch (error) {
    console.error("Jaycee profile load failed", error);
    shell.hidden = false;
  }
};

export const startJayceePage = () => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initJayceePage, { once: true });
  } else {
    initJayceePage();
  }
};

export const startJayceeProfilePage = () => {
  startJayceePage();
};
