import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee
} from "./profile-core.js";
import {
  JAYCEE_GAME_CONFIG
} from "../config/game-config.js";
import {
  createPlayerForGame,
  fetchAdminProfile,
  fetchPlayerById,
  fetchPlayerForGame,
  fetchPlayersForUser,
  fetchProfileByUserId,
  fetchProfileByUsername,
  fetchPublicProfiles,
  fetchSkillsByIds,
  fetchUserDynamicFractals,
  fetchUserGameSettings,
  getAvatarImageUrl,
  getDisplayValue,
  loadOptionalImage,
  startPlayerFirstQuest,
  updateProfileActiveGame
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

const getLoginUrl = () => (
  new URL(
    window.JayceeAuth?.getLoginUrl
      ? window.JayceeAuth.getLoginUrl()
      : "/login.html",
    window.location.origin
  )
);

const getSignupUrl = () => {
  return new URL("/signup.html", window.location.origin);
};

const redirectToLogin = () => {
  const loginUrl = getLoginUrl();

  loginUrl.searchParams.set("redirect", `${window.location.pathname}${window.location.search}`);
  window.location.href = loginUrl.href;
};

const redirectToSignup = () => {
  const signupUrl = getSignupUrl();
  const storedFullName = getDisplayValue(window.localStorage.getItem("player_full_name"));

  signupUrl.searchParams.set("redirect", `${window.location.pathname}${window.location.search}`);
  if (storedFullName) {
    signupUrl.searchParams.set("full_name", storedFullName);
  }
  window.location.href = signupUrl.href;
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

const getPlayerLevelTotal = (players = []) => {
  const total = (players || []).reduce((sum, player) => {
    const level = Number(player?.level);

    return sum + (Number.isFinite(level) && level > 0 ? level : 0);
  }, 0);

  return Math.max(1, total);
};

const getSelectedActiveLevel = (player, selectedAbilityIndex = 0) => {
  const level = Math.min(ACTIVE_RING_LIMIT, Math.max(1, Number(player?.level) || 1));

  return selectedAbilityIndex >= 1 && selectedAbilityIndex <= level
    ? selectedAbilityIndex
    : level;
};

const getMannaModel = ({ activeModels = [], player, playerProfile, selectedAbilityIndex = 0, now = new Date() }) => {
  const level = getSelectedActiveLevel(player, selectedAbilityIndex);
  const mannaTarget = Number(playerProfile?.manna_target);
  const mannaCycle = normalizeMannaCycle(playerProfile?.manna_cycle);
  const mannaUnit = normalizeMannaUnit(playerProfile?.manna_unit);
  const activeModel = activeModels[level - 1];
  const questStart = new Date(player?.[`skill_${level}_start`] || "");
  const periodSeconds = Number(activeModel?.passiveSeconds);
  const activeCycleSeconds = Number(activeModel?.questSeconds);

  if (!Number.isFinite(questStart.getTime()) || !(periodSeconds > 0) || !(activeCycleSeconds > 0)) {
    return { maxAbs: 1, target: 0, unit: mannaUnit, value: 0 };
  }

  const elapsedSeconds = Math.min(periodSeconds, Math.max(0, (now.getTime() - questStart.getTime()) / 1000));
  const periodTarget = Number.isFinite(mannaTarget)
    ? mannaTarget * (periodSeconds / getMannaCycleSeconds(mannaCycle, questStart))
    : 0;
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
  gameForm,
  skillForms = [],
  hasLinkedMaster = false
}) => {
  const fractal = getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.passive.fractalLabel)
    || getFractalById(dynamicFractals, gameForm?.primary_fractal);

  return createFractalMeasureModel({
    cycleSeconds: JAYCEE_GAME_CONFIG.passive.cycleSeconds,
    distanceMeters: JAYCEE_GAME_CONFIG.passive.zoneMeters,
    fractal,
    skill: hasLinkedMaster ? getSkillById(skillForms, fractal?.skill) : null
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
        skillLabel: getDisplayValue(skill?.label) || getDisplayValue(abilityConfig.skillLabel) || "Active"
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

const getUltimateModel = ({ dynamicFractals, gameForm, publicProfiles, ultimateTeammateSkillLabel, ultimateTeammateSkillDescription }) => {
  const fractal = getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.ultimate.fractalLabel)
    || getFractalById(dynamicFractals, gameForm?.ultimate_fractal);
  const label = getDisplayValue(fractal?.label) || getDisplayValue(JAYCEE_GAME_CONFIG.ultimate.fractalLabel);
  const linkedProfile = publicProfiles.find((profile) => (
    getDisplayValue(profile.id) === getDisplayValue(gameForm?.ultimate_link)
  ));

  if (!label && !ultimateTeammateSkillLabel && !linkedProfile) return null;

  return {
    label: label || "Ultimate",
    linkedProfile,
    skillLabel: ultimateTeammateSkillLabel,
    skillDescription: ultimateTeammateSkillDescription
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

const createMannaBar = (mannaModel) => createVitalBar({
  centered: true,
  current: mannaModel?.value || 0,
  label: "Manna",
  max: mannaModel?.maxAbs || 1,
  tone: "manna",
  valueText: mannaModel
    ? `${formatMannaValue(mannaModel.value, mannaModel.unit)} / ${formatMannaValue(mannaModel.target, mannaModel.unit)}`
    : "0 € / 0 €"
});

const createProfileNotice = ({
  action = null,
  content = null,
  closable = false,
  text = "",
  title,
  tone = "notification"
}) => {
  const panel = document.createElement("article");
  const header = document.createElement("h2");
  const icon = document.createElement("span");
  const copy = document.createElement("div");
  const dismissPanel = () => {
    panel.classList.add("is-dismissing");
    window.setTimeout(() => panel.remove(), 180);
  };

  panel.className = `profile-notice-panel is-${tone}`;
  header.className = "profile-notice-title";
  icon.className = "profile-notice-icon";
  icon.textContent = tone === "unlocked" ? "+" : tone === "quest" ? "!" : "i";
  header.replaceChildren(icon, title);
  copy.className = "profile-notice-copy";
  if (Array.isArray(text)) {
    text.forEach((line) => {
      const paragraph = document.createElement("p");

      paragraph.textContent = line;
      copy.append(paragraph);
    });
  } else if (getDisplayValue(text)) {
    const paragraph = document.createElement("p");

    paragraph.textContent = text;
    copy.append(paragraph);
  }
  if (content) {
    copy.append(content);
  }
  panel.append(header, copy);

  if (action) {
    panel.append(action);
  }

  if (closable) {
    const closeButton = document.createElement("button");
    const okButton = document.createElement("button");

    closeButton.className = "profile-notice-close";
    closeButton.type = "button";
    closeButton.textContent = "x";
    closeButton.setAttribute("aria-label", "Dismiss notification");
    closeButton.addEventListener("click", dismissPanel);
    okButton.className = "profile-notice-ok";
    okButton.type = "button";
    okButton.textContent = "Ok";
    okButton.addEventListener("click", dismissPanel);
    panel.append(okButton, closeButton);
  }

  return panel;
};

const createNoticeMasterBadge = (profile, fallbackUsername = "Cedricjbt") => {
  const badge = document.createElement("span");
  const avatar = document.createElement("span");
  const name = document.createElement("span");
  const username = getDisplayValue(profile?.username) || fallbackUsername;

  badge.className = "profile-notice-master-card";
  avatar.className = "profile-notice-master-avatar";
  name.className = "profile-notice-master-name";
  name.textContent = username;

  if (profile?.avatarUrl) {
    const image = document.createElement("img");

    image.alt = "";
    image.src = profile.avatarUrl;
    avatar.append(image);
  } else {
    avatar.textContent = username.slice(0, 1).toUpperCase();
  }

  badge.append(avatar, name);

  return badge;
};

const createMastersNoticeContent = (profiles, { showIntro = true, onSelect = null, isSaving = false } = {}) => {
  const content = document.createDocumentFragment();
  const message = document.createElement("p");

  message.append(
    document.createTextNode("Oh! You're in luck!"),
    document.createElement("br"),
    document.createTextNode("It looks like you're not alone in the game room. Several Masters have been there before.")
  );
  if (showIntro) content.append(message);

  if (profiles.length) {
    const carousel = document.createElement("div");
    const track = document.createElement("div");

    carousel.className = "profile-masters-carousel";
    carousel.tabIndex = 0;
    carousel.setAttribute("role", "region");
    carousel.setAttribute("aria-label", "Masters in the game room");
    track.className = "profile-masters-track";

    for (let copy = 0; copy < 2; copy += 1) {
      const group = document.createElement("div");

      group.className = "profile-masters-group";
      if (copy === 0) {
        group.setAttribute("role", onSelect ? "group" : "list");
      } else {
        group.setAttribute("aria-hidden", "true");
      }
      const repetitions = Math.ceil(12 / profiles.length);

      for (let repeat = 0; repeat < repetitions; repeat += 1) {
        profiles.forEach((profile) => {
          const card = createNoticeMasterBadge(profile);

          if (!onSelect) card.setAttribute("role", "listitem");
          if (repeat > 0) card.setAttribute("aria-hidden", "true");
          if (onSelect) {
            const choice = document.createElement("button");

            choice.className = "profile-master-choice";
            choice.type = "button";
            choice.disabled = isSaving;
            choice.setAttribute("aria-label", `Link to ${getDisplayValue(profile.username)}'s game`);
            if (copy > 0 || repeat > 0) {
              choice.tabIndex = -1;
              choice.setAttribute("aria-hidden", "true");
            }
            choice.addEventListener("click", () => {
              if (!choice.disabled) onSelect(profile);
            });
            choice.append(card);
            group.append(choice);
          } else {
            group.append(card);
          }
        });
      }
      track.append(group);
    }
    carousel.append(track);
    content.append(carousel);
  }

  return content;
};

const getActiveQuestInfo = ({ activeModels = [], player = null, selectedAbilityIndex = 0 }) => {
  const level = getSelectedActiveLevel(player, selectedAbilityIndex);
  const activeModel = activeModels[Math.max(0, Math.min(level, activeModels.length) - 1)] || activeModels[0] || null;

  if (!activeModel) {
    return {
      activeTime: "0s",
      passiveTime: "0s",
      skillName: "your skill"
    };
  }

  const startedAt = Date.parse(player?.[`skill_${level}_start`] || "");

  return {
    activeTime: formatDuration(activeModel.questSeconds, { compact: false }) || "0s",
    deadline: Number.isFinite(startedAt) ? startedAt + activeModel.passiveSeconds * 1000 : null,
    passiveTime: formatDuration(activeModel.passiveSeconds, { compact: false }) || "0s",
    skillName: getDisplayValue(activeModel.skillLabel) || getDisplayValue(activeModel.label) || "your skill"
  };
};

const updateQuestCountdown = (element, now = Date.now()) => {
  const remainingSeconds = Math.max(0, Math.ceil((Number(element.dataset.questDeadline) - now) / 1000));

  element.textContent = remainingSeconds > 0
    ? `Time remaining: ${formatDuration(remainingSeconds, { compact: false })}`
    : "Quest time expired.";
};

const createLinkedMasterNoticeContent = ({ masterProfile, questInfo }) => {
  const fragment = document.createDocumentFragment();
  const firstLine = document.createElement("p");
  const secondLine = document.createElement("p");

  firstLine.append(
    document.createTextNode("Your energy has been linked to "),
    createNoticeMasterBadge(masterProfile, "a Master"),
    document.createTextNode(".")
  );
  secondLine.textContent = `You have ${questInfo.passiveTime} to do ${questInfo.activeTime} of ${questInfo.skillName}. During this time you cannot link yourself to another Master.If you fail, your account will be deleted automatically.`;
  fragment.append(firstLine, secondLine);

  if (Number.isFinite(questInfo.deadline)) {
    const countdown = document.createElement("p");

    countdown.dataset.questDeadline = String(questInfo.deadline);
    updateQuestCountdown(countdown);
    fragment.append(countdown);
  }

  return fragment;
};

const getPendingPrayerActiveMs = () => {
  try {
    const pendingPrayer = JSON.parse(window.localStorage.getItem("pending_prayer") || "{}");
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
  activeMasterProfile = null,
  activeModels = [],
  isMasterSaving = false,
  masterLinkError = "",
  onPlay,
  onAcceptMaster,
  player,
  playerAvatarUrl = "",
  playerProfile,
  profile,
  adminProfile = null,
  publicProfiles = [],
  selectedAbilityIndex,
  totalLevel = 1
}) => {
  const panel = document.createElement("section");
  const hud = document.createElement("div");
  const identity = document.createElement("div");
  const avatar = document.createElement("div");
  const levelBadge = document.createElement("p");
  const bars = document.createElement("div");
  const profileLabel = document.createElement("h2");
  const lifeMaxYears = JAYCEE_GAME_CONFIG.lifeMaxYears;
  const lifeMaxSeconds = JAYCEE_GAME_CONFIG.lifeMaxYears * YEAR_SECONDS;
  const hasPlayerProfile = Boolean(playerProfile);
  const displayLevel = Math.max(1, Number(totalLevel) || 1);
  const effectivePlayer = player
    ? player
    : hasPlayerProfile
      ? {
        level: displayLevel,
        skill_1_practice: 0,
        skill_2_practice: 0,
        skill_3_practice: 0
      }
      : null;
  const level = hasPlayerProfile ? displayLevel : 1;
  const storedUsername = getDisplayValue(window.localStorage.getItem("player_full_name"));
  const profileName = getDisplayValue(playerProfile?.username)
    || getDisplayValue(playerProfile?.full_name)
    || storedUsername
    || "Player";
  const channelUsername = getDisplayValue(profile?.username)
    || getDisplayValue(window.localStorage.getItem("pending_prayer_target_username"))
    || "";
  const noticeMasterProfile = adminProfile || publicProfiles.find((publicProfile) => (
    getDisplayValue(publicProfile.role).toLowerCase() === "admin"
  )) || publicProfiles[0] || null;
  const noticeMasterUsername = getDisplayValue(noticeMasterProfile?.username) || "Cedricjbt";
  const noticeMasterUsernameElement = document.createElement("i");
  const noticeMasterContent = document.createDocumentFragment();
  const mannaModel = effectivePlayer && playerProfile
    ? getMannaModel({ activeModels, player: effectivePlayer, playerProfile, selectedAbilityIndex })
    : null;
  const prayerActiveMs = getPendingPrayerActiveMs();
  const firstActiveSkillMs = getFirstActiveSkillMs();
  const prayerKarmaYears = firstActiveSkillMs > 0 ? prayerActiveMs / firstActiveSkillMs : 0;
  const remainingKarmaYears = Math.max(0, lifeMaxYears - 1 - prayerKarmaYears);
  const guestLifeSeconds = prayerKarmaYears * YEAR_SECONDS;
  const profileHealthSeconds = getAgeInSeconds(playerProfile?.birth_date) || 0;
  const lifeSeconds = hasPlayerProfile ? profileHealthSeconds : guestLifeSeconds;
  const lifeValueText = effectivePlayer ? formatYearsFromSeconds(lifeSeconds) : `${formatKarmaYears(prayerKarmaYears)}y`;
  const linkedQuestInfo = getActiveQuestInfo({
    activeModels,
    player: effectivePlayer,
    selectedAbilityIndex
  });
  const firstActivePassiveTime = formatDuration(activeModels[0]?.passiveSeconds, { compact: false }) || "0s";
  panel.className = "profile-vitals-panel";
  panel.dataset.profileVitals = "";
  noticeMasterUsernameElement.textContent = noticeMasterUsername;
  noticeMasterContent.append(
    createNoticeMasterBadge(noticeMasterProfile),
    document.createTextNode(" has crossed path with you"),
    document.createElement("br"),
    document.createTextNode("and has decided to take charge of your karma!"),
    document.createElement("br"),
    document.createElement("br"),
    noticeMasterUsernameElement,
    document.createTextNode(" has the special ability to connect his energy to technology. If your prayer has been done faithfully he will be able to take your karma and help you from the spirit world. Your data will be deleted right after.")
  );
  profileLabel.className = "profile-section-label";
  profileLabel.textContent = "Profile";
  profileLabel.hidden = true;
  hud.hidden = true;
  bars.className = "profile-vital-stack";
  bars.replaceChildren(
    createVitalBar({
      current: lifeSeconds,
      label: "Health",
      max: lifeMaxSeconds,
      tone: "health",
      valueText: `${lifeValueText} / ${JAYCEE_GAME_CONFIG.lifeMaxYears.toLocaleString()}y`
    }),
    createMannaBar(mannaModel)
  );
  panel.replaceChildren();

  if (hasPlayerProfile) {
    panel.append(createProfileNotice({
      closable: true,
      text: "Congratulations! You have learned to pray! You can now save your progress and connect with a Master to continue to play.",
      title: "Unlocked",
      tone: "unlocked"
    }));
    if (activeMasterProfile) {
      panel.append(createProfileNotice({
        content: createLinkedMasterNoticeContent({
          masterProfile: activeMasterProfile,
          questInfo: linkedQuestInfo
        }),
        title: "Notification",
        tone: "notification"
      }));
    } else {
      const masterChoices = createMastersNoticeContent(publicProfiles, {
        showIntro: false,
        onSelect: onAcceptMaster,
        isSaving: isMasterSaving
      });
      const linkStatus = document.createElement("p");

      linkStatus.className = "profile-master-link-status";
      linkStatus.setAttribute("role", "status");
      linkStatus.textContent = masterLinkError || (isMasterSaving ? "Linking..." : publicProfiles.length ? "" : "No Masters available yet.");
      masterChoices.append(linkStatus);
      panel.append(createProfileNotice({
        content: masterChoices,
        text: `Unlock level 1 in a Master's game: Each Master offers a different path, with different quests and benefits. You have ${firstActivePassiveTime} to choose a Master and get your first quest. Beyond that timing your account will be deleted automatically. Click on a Master below to link to their game.`,
        title: "Quest",
        tone: "quest"
      }));
    }
  } else {
    panel.append(
      createProfileNotice({
        closable: true,
        content: createMastersNoticeContent(publicProfiles),
        title: "Notification",
        tone: "notification"
      }),
      createProfileNotice({
        closable: true,
        content: noticeMasterContent,
        title: "Notification",
        tone: "notification"
      }),
      createProfileNotice({
        closable: true,
        text: `Congratulations! You have unlocked level 1. It has been calculated by the great Masters of this game that it takes approximately ${lifeMaxYears.toLocaleString()} years for an average Human being to burn all his Karma and leave the Earth. Your prayer has burned ${formatKarmaYears(prayerKarmaYears)} years of Karma. You have more than ${formatKarmaYears(remainingKarmaYears)} years left.`,
        title: "Unlocked",
        tone: "unlocked"
      })
    );
  }

  if (!hasPlayerProfile) {
    const playButton = document.createElement("button");

    playButton.className = "profile-play-button";
    playButton.type = "button";
    playButton.textContent = "Accept";
    playButton.addEventListener("click", onPlay);
    panel.append(createProfileNotice({
      action: playButton,
      text: "Unlock Level 2: burn Karma faster and try to get enlightened in this life, save your progress and connect directly with a Master.",
      title: "Quest",
      tone: "quest"
    }));
  }

  panel.append(profileLabel);

  hud.className = "profile-player-hud";
  identity.className = "profile-player-identity";
  avatar.className = "profile-player-avatar";
  if (hasPlayerProfile && playerAvatarUrl) {
    const image = document.createElement("img");

    image.alt = "";
    image.src = playerAvatarUrl;
    avatar.append(image);
  } else {
    avatar.textContent = hasPlayerProfile
      ? getProfileInitial(playerProfile)
      : (storedUsername || "?").slice(0, 1).toUpperCase();
  }
  levelBadge.className = "profile-player-level";
  levelBadge.textContent = `${profileName} - Level ${level}`;
  identity.append(avatar, levelBadge);
  hud.append(identity, bars);
  panel.append(hud);

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
    label: getDisplayValue(skill.label),
    description: getDisplayValue(skill.description)
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
  section.hidden = true;
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
      }, ...(getDisplayValue(passiveModel.skill?.label) ? [{
        label: "Skill",
        value: passiveModel.skill.label
      }] : []), ...(getDisplayValue(passiveModel.skill?.description) ? [{
        label: "Description",
        value: passiveModel.skill.description
      }] : [])],
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
      }, ...(getDisplayValue(fractalModel.skill?.description) ? [{
        label: "Description",
        value: fractalModel.skill.description
      }] : [])],
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
      }, ...(getDisplayValue(ultimateModel.skillDescription) ? [{
        label: "Description",
        value: ultimateModel.skillDescription
      }] : [])],
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

const attachProfileAvatarUrls = async (client, profiles) => Promise.all(
  profiles.map(async (profile) => {
    try {
      return {
        ...profile,
        avatarUrl: await getAvatarImageUrl(client, profile)
      };
    } catch {
      return {
        ...profile,
        avatarUrl: ""
      };
    }
  })
);

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
  let adminProfile = null;
  let activeMasterProfile = null;
  let activeMasterGame = null;
  let currentProfile = null;
  let currentPlayer = null;
  let gameForm = createEmptyGameSettings();
  let gameSettings = null;
  let isPlayerSaving = false;
  let playerAvatarUrl = "";
  let playerProfile = null;
  let playerRows = [];
  let closingAbilityIndex = null;
  let descriptionCloseTimer = 0;
  let selectedAbilityIndex = null;
  let isMasterSaving = false;
  let masterLinkError = "";
  let supabaseClient = null;
  let skillForms = [];
  let skills = [];
  let ultimateTeammateSkillLabel = "";
  let ultimateTeammateSkillDescription = "";
  const getOwnUltimateSkillLabel = () => {
    const ultimateFractal = getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.ultimate.fractalLabel)
      || getFractalById(dynamicFractals, gameForm?.ultimate_fractal);
    const skill = getSkillById(skillForms, ultimateFractal?.skill);

    ultimateTeammateSkillDescription = getDisplayValue(skill?.description);
    return getDisplayValue(skill?.label);
  };

  const loadUltimateTeammateSkillLabel = async () => {
    const teammateId = getDisplayValue(gameForm?.ultimate_link);
    const linkedProfile = publicProfiles.find((profile) => getDisplayValue(profile.id) === teammateId);

    if (!teammateId || !linkedProfile || !supabaseClient) {
      ultimateTeammateSkillLabel = "";
      ultimateTeammateSkillDescription = "";
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
    ultimateTeammateSkillDescription = getDisplayValue(linkedSkill?.description);
  };

  const loadMasterGame = async (masterProfile, masterGame = null) => {
    if (!supabaseClient || !masterProfile) return;

    activeMasterProfile = masterProfile;
    currentProfile = masterProfile;
    activeMasterGame = masterGame || await fetchUserGameSettings(supabaseClient, masterProfile);
    dynamicFractals = await fetchUserDynamicFractals(supabaseClient, masterProfile);
    skills = await fetchSkillsByIds(supabaseClient, dynamicFractals.map((fractal) => fractal.skill));
    skillForms = createSkillForms(skills);
    gameSettings = activeMasterGame;
    gameForm = createGameForm(gameSettings);
    await loadUltimateTeammateSkillLabel();
  };

  const handlePlayClick = async () => {
    if (isPlayerSaving) return;

    if (!playerProfile) {
      redirectToSignup();
      return;
    }

    if (!supabaseClient || !gameSettings) return;

    isPlayerSaving = true;
    renderVitalsPanel();

    try {
      currentPlayer = await createPlayerForGame(supabaseClient, playerProfile, currentProfile);
      playerRows = await fetchPlayersForUser(supabaseClient, playerProfile);
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

    const corePanel = canvas.closest(".game-core-panel");
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

    const corePanel = canvas.closest(".game-core-panel");
    const existingPanel = corePanel?.querySelector("[data-profile-vitals]");

    if (!corePanel || !shouldRenderGameInterface) {
      existingPanel?.remove();
      return;
    }

    const activeModels = getActiveFractalModels({
      dynamicFractals,
      gameForm,
      skillForms
    });
    const panel = createVitalsPanel({
      activeMasterProfile,
      activeModels,
      isMasterSaving,
      masterLinkError,
      onPlay: handlePlayClick,
      onAcceptMaster: handleAcceptMasterClick,
      player: currentPlayer,
      adminProfile,
      playerAvatarUrl,
      playerProfile,
      profile: currentProfile,
      publicProfiles,
      selectedAbilityIndex,
      totalLevel: getPlayerLevelTotal(playerRows)
    });

    if (existingPanel) {
      existingPanel.replaceWith(panel);
    } else {
      corePanel.insertBefore(panel, corePanel.firstChild);
    }
  };

  const renderCoreParameters = () => {
    if (!canvas) return;

    const corePanel = canvas.closest(".game-core-panel");
    const existingPanel = corePanel?.querySelector("[data-profile-parameters]");
    const existingInventoryTitle = corePanel?.querySelector("[data-profile-inventory-title]");
    const activeModels = getActiveFractalModels({
      dynamicFractals,
      gameForm,
      skillForms
    });
    const passiveModel = getPassiveFractalModel({
      dynamicFractals,
      gameForm,
      skillForms,
      hasLinkedMaster: Boolean(activeMasterProfile && currentPlayer)
    }) || getPassiveModel({ dynamicFractals, gameForm });
    const ultimateModel = getUltimateModel({
      dynamicFractals,
      gameForm,
      publicProfiles,
      ultimateTeammateSkillLabel,
      ultimateTeammateSkillDescription
    });
    const panel = createFractalParameterPanel({
      activeModels,
      currentLevel: playerProfile
        ? Math.max(0, Number(currentPlayer?.level) || 0)
        : (document.body.classList.contains("game-page") ? 1 : 0),
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

  const handleAcceptMasterClick = async (masterProfile) => {
    if (isMasterSaving || activeMasterProfile || !masterProfile?.id || !playerProfile || !supabaseClient) return;

    isMasterSaving = true;
    masterLinkError = "";
    renderVitalsPanel();

    try {
      const masterGame = await fetchUserGameSettings(supabaseClient, masterProfile);

      if (!masterGame?.id) {
        throw new Error("This Master has no game available yet.");
      }

      let player = await fetchPlayerForGame(supabaseClient, playerProfile, masterProfile);

      if (!player) {
        player = await createPlayerForGame(supabaseClient, playerProfile, masterProfile);
      }
      if (!player?.id) {
        throw new Error("The Master link could not be created.");
      }

      player = await startPlayerFirstQuest(supabaseClient, playerProfile, player);

      const updatedProfile = await updateProfileActiveGame(supabaseClient, playerProfile, player.id);

      if (!updatedProfile) throw new Error("The Master link could not be saved. Please try again.");

      playerProfile = updatedProfile;
      currentPlayer = player;
      playerRows = await fetchPlayersForUser(supabaseClient, playerProfile);
      await loadMasterGame(masterProfile, masterGame);
    } catch (error) {
      console.error("Jaycee Master could not be linked", error);
      masterLinkError = error?.message || "The Master link could not be saved. Please try again.";
    } finally {
      isMasterSaving = false;
      renderVitalsPanel();
      renderCoreParameters();
    }
  };

  const refreshPlayerProfile = async () => {
    if (!supabaseClient) return;

    const sessionResult = await window.JayceeAuth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (!user) return;

    const refreshedProfile = await fetchProfileByUserId(supabaseClient, user.id);

    if (!refreshedProfile) return;

    playerProfile = refreshedProfile;
    if (getDisplayValue(currentProfile?.id) === getDisplayValue(refreshedProfile.id)) {
      currentProfile = refreshedProfile;
    }
    playerRows = await fetchPlayersForUser(supabaseClient, refreshedProfile);
    if (refreshedProfile.active_game) {
      currentPlayer = await fetchPlayerById(supabaseClient, refreshedProfile.active_game);
      activeMasterProfile = currentPlayer?.game_id
        ? await fetchProfileByUserId(supabaseClient, currentPlayer.game_id)
        : activeMasterProfile;
      if (activeMasterProfile) {
        await loadMasterGame(activeMasterProfile);
      }
    }

    try {
      playerAvatarUrl = await getAvatarImageUrl(supabaseClient, refreshedProfile);
    } catch (error) {
      console.warn("Jaycee player avatar could not be refreshed", error);
      playerAvatarUrl = "";
    }

    try {
      publicProfiles = await attachProfileAvatarUrls(supabaseClient, await fetchPublicProfiles(supabaseClient));
      if (activeMasterProfile) {
        activeMasterProfile = publicProfiles.find((publicProfile) => (
          getDisplayValue(publicProfile.id) === getDisplayValue(activeMasterProfile.id)
        )) || activeMasterProfile;
      }
    } catch (error) {
      console.warn("Jaycee public profiles could not be refreshed", error);
    }

    renderVitalsPanel();
    renderPresentControls();
    renderCoreParameters();
    scheduleRenderCore();
  };

  window.addEventListener("jaycee:account-updated", refreshPlayerProfile);

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

    playerRows = playerProfile ? await fetchPlayersForUser(client, playerProfile) : [];
    if (playerProfile?.active_game) {
      currentPlayer = await fetchPlayerById(client, playerProfile.active_game);
      activeMasterProfile = currentPlayer?.game_id
        ? await fetchProfileByUserId(client, currentPlayer.game_id)
        : null;
    }
    if (activeMasterProfile) {
      await loadMasterGame(activeMasterProfile);
    } else {
      dynamicFractals = hasUserProfile ? await fetchUserDynamicFractals(client, profile) : [];
      skills = hasUserProfile
        ? await fetchSkillsByIds(client, dynamicFractals.map((fractal) => fractal.skill))
        : [];
      skillForms = createSkillForms(skills);
      gameSettings = hasUserProfile ? await fetchUserGameSettings(client, profile) : null;
      gameForm = createGameForm(gameSettings);
      currentPlayer = profile && playerProfile
        ? await fetchPlayerForGame(client, playerProfile, profile)
        : currentPlayer;
    }
    if (playerProfile) {
      try {
        playerAvatarUrl = await getAvatarImageUrl(client, playerProfile);
      } catch (error) {
        console.warn("Jaycee player avatar could not be loaded", error);
        playerAvatarUrl = "";
      }
    }

    if (isPresentPage || hasUserProfile || isGamePage) {
      try {
        publicProfiles = await attachProfileAvatarUrls(client, await fetchPublicProfiles(client));
        if (activeMasterProfile) {
          activeMasterProfile = publicProfiles.find((publicProfile) => (
            getDisplayValue(publicProfile.id) === getDisplayValue(activeMasterProfile.id)
          )) || activeMasterProfile;
        }
      } catch (error) {
        console.warn("Jaycee public profiles could not be loaded", error);
        publicProfiles = [];
      }
    }
    try {
      const fetchedAdminProfile = await fetchAdminProfile(client);
      const [profileWithAvatar] = fetchedAdminProfile
        ? await attachProfileAvatarUrls(client, [fetchedAdminProfile])
        : [];

      adminProfile = profileWithAvatar || null;
    } catch (error) {
      console.warn("Jaycee admin profile could not be loaded", error);
      adminProfile = publicProfiles.find((publicProfile) => (
        getDisplayValue(publicProfile.role).toLowerCase() === "admin"
      )) || null;
    }
    await loadUltimateTeammateSkillLabel();
    avatarImage = hasUserProfile
      ? await loadOptionalImage(await getAvatarImageUrl(client, profile))
      : null;
    shell.hidden = false;
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
    const questClock = window.setInterval(() => {
      shell.querySelectorAll("[data-quest-deadline]").forEach((element) => updateQuestCountdown(element));
      const mannaBar = shell.querySelector("[data-profile-vitals] .is-manna");

      if (mannaBar) {
        const mannaModel = currentPlayer && playerProfile
          ? getMannaModel({
            activeModels: getActiveFractalModels({ dynamicFractals, gameForm, skillForms }),
            player: currentPlayer,
            playerProfile,
            selectedAbilityIndex
          })
          : null;

        mannaBar.replaceWith(createMannaBar(mannaModel));
      }
    }, 1000);

    window.addEventListener("pagehide", () => window.clearInterval(questClock), { once: true });
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

