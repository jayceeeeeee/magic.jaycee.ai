import { renderSkillMarkdown } from "./markdown.js";
import { PracticeTimer } from "./practice-timer.js";
import { SoundEffects } from "./sounds.js";
import { NotificationStore, interpolateNotification, isNotificationVisible, notificationOccurrence, isLevelTwoQuestPending } from "./notifications.js";
import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee
} from "./profile-core.js";
import {
  JAYCEE_GAME_CONFIG,
  JAYCEE_GAME_SKILL_COLUMNS
} from "../config/game-config.js";
import {
  acceptLevelTwoQuest,
  createPlayerForGame,
  fetchAdminProfile,
  fetchPlayerForGame,
  fetchPlayersForUser,
  fetchProfileByUserId,
  fetchProfileByUsername,
  fetchPublicProfiles,
  fetchSkillsByIds,
  fetchUserGameSettings,
  getAvatarImageUrl,
  getDisplayValue,
  loadOptionalImage,
  recordSkillPractice,
  startPlayerFirstQuest,
  syncSkillProgress,
  updateProfileMaster
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

  if ((level === 2 && isLevelTwoQuestPending(player))
    || !Number.isFinite(questStart.getTime()) || !(periodSeconds > 0) || !(activeCycleSeconds > 0)) {
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

const getSkillById = (skills, skillId) => (
  (skills || []).find((skill) => getDisplayValue(skill.id) === getDisplayValue(skillId)) || null
);

const getPassiveSkillModel = ({ gameForm, skillForms, hasLinkedMaster = false }) => ({
  cycleSeconds: JAYCEE_GAME_CONFIG.passive.cycleSeconds,
  distanceMeters: JAYCEE_GAME_CONFIG.passive.zoneMeters,
  label: JAYCEE_GAME_CONFIG.passive.fractalLabel,
  skill: hasLinkedMaster ? getSkillById(skillForms, gameForm?.[JAYCEE_GAME_CONFIG.passive.skillColumn]) : null
});

const getActiveSkillModels = ({ gameForm, skillForms }) => {
  let previousQuestSeconds = Number(JAYCEE_GAME_CONFIG.passive.cycleSeconds);
  let previousDistanceMeters = Number(JAYCEE_GAME_CONFIG.passive.zoneMeters);

  return JAYCEE_GAME_CONFIG.activeAbilities.map((abilityConfig) => {
    const skill = getSkillById(skillForms, gameForm?.[abilityConfig.skillColumn]);
    const ratio = Number(abilityConfig.ratio);
    const questSeconds = previousQuestSeconds / ratio;
    const distanceMeters = previousDistanceMeters / ratio;

    previousQuestSeconds = questSeconds;
    previousDistanceMeters = distanceMeters;

    return {
      cycleSeconds: questSeconds,
      distanceMeters,
      label: abilityConfig.fractalLabel,
      passiveSeconds: abilityConfig.cycleSeconds,
      questSeconds,
      skill,
      skillLabel: getDisplayValue(skill?.label) || "No skill"
    };
  });
};

const getUltimateModel = ({ gameForm, skillForms }) => {
  const skill = getSkillById(skillForms, gameForm?.[JAYCEE_GAME_CONFIG.ultimate.skillColumn]);

  return {
    label: JAYCEE_GAME_CONFIG.ultimate.fractalLabel,
    skillLabel: getDisplayValue(skill?.label),
    skillDescription: typeof skill?.description === "string" ? skill.description : ""
  };
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

const updateVitalBar = (bar, { centered = false, current, max, valueText }) => {
  if (!bar) return;
  const fill = bar.querySelector(".profile-vital-fill");
  const numericCurrent = Number(current);
  const numericMax = Number(max);
  const progress = Number.isFinite(numericCurrent) && Number.isFinite(numericMax) && numericMax > 0
    ? centered
      ? Math.min(1, Math.max(0, (numericCurrent / numericMax + 1) / 2))
      : Math.min(1, Math.max(0, numericCurrent / numericMax))
    : 0;

  bar.classList.toggle("is-empty", !valueText);
  bar.querySelector(".profile-vital-header span:last-child").textContent = valueText;
  if (centered) {
    const offset = Math.abs(progress - 0.5) * 100;

    fill.style.left = progress >= 0.5 ? "50%" : `${50 - offset}%`;
    fill.style.width = `${offset}%`;
  } else {
    fill.style.width = `${progress * 100}%`;
  }
};

const createVitalBar = ({ centered = false, current, label, locked = false, max, tone, valueText }) => {
  const bar = document.createElement("div");
  const header = document.createElement("div");
  const name = document.createElement("span");
  const value = document.createElement("span");
  const track = document.createElement("div");
  const fill = document.createElement("span");

  bar.className = `profile-vital-bar is-${tone}`;
  bar.classList.toggle("is-centered", centered);
  bar.classList.toggle("is-locked", locked);
  header.className = "profile-vital-header";
  name.className = "profile-vital-name";
  name.textContent = label;
  if (locked) {
    const badge = document.createElement("small");
    badge.className = "profile-vital-lock";
    badge.append(createLockedIcon("profile-vital-lock-icon"), document.createTextNode("Locked"));
    name.append(badge);
  }
  track.className = "profile-vital-track";
  fill.className = "profile-vital-fill";
  header.append(name, value);
  track.append(fill);
  bar.append(header, track);
  updateVitalBar(bar, { centered, current, max, valueText });

  return bar;
};

const createMannaBar = (mannaModel, locked = false) => createVitalBar({
  centered: true,
  current: mannaModel?.value || 0,
  label: "Manna",
  locked,
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
  onEvent = () => {},
  text = "",
  textValues = {},
  title,
  tone = "notification"
}) => {
  const panel = document.createElement("article");
  const header = document.createElement("h2");
  const icon = document.createElement("span");
  const copy = document.createElement("div");
  const dismissPanel = (action) => {
    if (panel.classList.contains("is-dismissing")) return;
    onEvent(action);
    panel.classList.add("is-dismissing");
    window.setTimeout(() => panel.remove(), 180);
  };

  panel.className = `profile-notice-panel is-${tone}`;
  header.className = "profile-notice-title";
  icon.className = "profile-notice-icon";
  icon.textContent = tone === "unlocked" ? "+" : tone === "quest" ? "!" : "i";
  header.replaceChildren(icon, title);
  copy.className = "profile-notice-copy";
  const lines = Array.isArray(text) ? text : getDisplayValue(text) ? [text] : [];
  lines.forEach((line) => {
    const paragraph = document.createElement("p");

    String(line).split(/(\{[a-zA-Z]+\})/g).forEach((part) => {
      const key = part.slice(1, -1);
      const value = interpolateNotification(part, textValues);
      if ((part === '{passiveSkillName}' || part === '{skillOneName}') && Object.hasOwn(textValues, key)) {
        const emphasis = document.createElement("em");
        emphasis.textContent = value;
        paragraph.append(emphasis);
      } else {
        paragraph.append(document.createTextNode(value));
      }
    });
    copy.append(paragraph);
  });
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
    closeButton.addEventListener("click", () => dismissPanel("dismissed"));
    okButton.className = "profile-notice-ok";
    okButton.type = "button";
    okButton.textContent = "Ok";
    okButton.addEventListener("click", () => dismissPanel("read"));
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
      requiredTime: "0s",
      practiceTime: "0s",
      passiveTime: "0s",
      skillName: "your skill"
    };
  }

  const startedAt = level === 2 && isLevelTwoQuestPending(player)
    ? NaN : Date.parse(player?.[`skill_${level}_start`] || "");
  const practiceSeconds = Math.max(0, Number(player?.[`skill_${level}_practice`]) || 0);
  const remainingPracticeSeconds = Math.max(0, Number(activeModel.questSeconds) - practiceSeconds);

  return {
    activeTime: formatDuration(Math.ceil(remainingPracticeSeconds), { compact: false }) || "0s",
    requiredTime: formatDuration(activeModel.questSeconds, { compact: false }) || "0s",
    practiceTime: formatDuration(Math.floor(practiceSeconds), { compact: false }) || "0s",
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

const createQuestCountdown = (deadline) => {
  if (!Number.isFinite(deadline)) return null;

  const countdown = document.createElement("p");

  countdown.dataset.questDeadline = String(deadline);
  updateQuestCountdown(countdown);
  return countdown;
};

const getLinkedQuestText = (questInfo) => (
  `You have ${questInfo.passiveTime} to do ${questInfo.requiredTime} of ${questInfo.skillName}. During this time you cannot link yourself to another Master. If you fail, your account will be deleted automatically. Click on the new unlocked skill below to start.`
);

const updatePracticeDetails = (element, questInfo) => {
  const countdown = element.querySelector("[data-practice-deadline]");
  if (Number.isFinite(questInfo.deadline)) {
    countdown.dataset.questDeadline = String(questInfo.deadline);
    updateQuestCountdown(countdown);
  } else {
    delete countdown.dataset.questDeadline;
    countdown.textContent = "Time remaining: —";
  }
  element.querySelector("[data-practice-progress]").textContent = `Practice: ${questInfo.practiceTime} / ${questInfo.activeTime}`;
};

const createLinkedMasterNoticeContent = ({ masterProfile, questInfo, level = 1 }) => {
  const fragment = document.createDocumentFragment();
  const firstLine = document.createElement("p");
  const secondLine = document.createElement("p");

  firstLine.append(
    document.createTextNode("Your energy has been linked to "),
    createNoticeMasterBadge(masterProfile, "a Master"),
    document.createTextNode(".")
  );
  secondLine.textContent = getLinkedQuestText(questInfo);
  if (level === 1) fragment.append(firstLine);
  fragment.append(secondLine);

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
  accountCreatedAt = "",
  activeMasterProfile = null,
  activeModels = [],
  isMasterSaving = false,
  masterLinkError = "",
  notifications = null,
  sounds,
  passiveSkillName = "your passive skill",
  onAcceptLevelTwoQuest,
  isQuestAcceptSaving = false,
  questAcceptError = "",
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
  const profileHealthSeconds = (getAgeInSeconds(playerProfile?.birth_date) || 0)
    + (Number(playerProfile?.years_burned) || 0) * YEAR_SECONDS;
  const lifeSeconds = hasPlayerProfile ? profileHealthSeconds : guestLifeSeconds;
  const lifeValueText = effectivePlayer ? formatYearsFromSeconds(lifeSeconds) : `${formatKarmaYears(prayerKarmaYears)}y`;
  const linkedQuestInfo = getActiveQuestInfo({
    activeModels,
    player: effectivePlayer
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
    document.createTextNode(" has the special ability "),
    Object.assign(document.createElement("i"), { textContent: "Technomancy" }),
    document.createTextNode(" that allows him to connect his energy to technology. If your prayer has been done faithfully he will be able to take your karma and help you from the spirit world. Your data will be deleted right after.")
  );
  profileLabel.className = "profile-section-label";
  profileLabel.textContent = "Profile";
  profileLabel.hidden = !hasPlayerProfile;
  hud.hidden = !hasPlayerProfile;
  bars.className = "profile-vital-stack";
  bars.replaceChildren(
    createVitalBar({
      current: lifeSeconds,
      label: "Health",
      locked: !(Number(player?.level) >= 2),
      max: lifeMaxSeconds,
      tone: "health",
      valueText: `${lifeValueText} / ${JAYCEE_GAME_CONFIG.lifeMaxYears.toLocaleString()}y`
    }),
    createMannaBar(mannaModel, !(Number(player?.level) >= 2))
  );
  panel.replaceChildren();

  const values = {
    lifeMaxYears: lifeMaxYears.toLocaleString(),
    prayerKarmaYears: formatKarmaYears(prayerKarmaYears),
    remainingKarmaYears: formatKarmaYears(remainingKarmaYears),
    firstActivePassiveTime,
    passiveSkillName,
    skillOneName: activeModels[0]?.skillLabel || "your first skill"
  };
  // Only named, code-owned components/actions can be selected by catalog JSON.
  // Text always goes through textContent: database content cannot inject HTML.
  for (const definition of notifications?.definitions || []) {
    const occurrence = notificationOccurrence(definition, player);
    if (!isNotificationVisible(definition, notifications.receipt(definition.id, occurrence), {
      hasAccount: hasPlayerProfile, hasMaster: Boolean(activeMasterProfile), player
    })) continue;
    const onEvent = (action) => {
      sounds.play('notificationConfirm');
      notifications.record(definition.id, action, occurrence);
    };
    let content = null;
    let action = null;
    const component = definition.content?.component;
    if (component === 'masters') content = createMastersNoticeContent(publicProfiles);
    else if (component === 'karma_master') content = noticeMasterContent;
    else if (component === 'linked_quest') content = createLinkedMasterNoticeContent({
      masterProfile: activeMasterProfile, questInfo: linkedQuestInfo, level: Number(player?.level) || 1
    });
    else if (component === 'master_choices') {
      const masterChoices = createMastersNoticeContent(publicProfiles, {
        showIntro: false,
        onSelect: (master) => { onEvent('clicked'); onAcceptMaster(master); },
        isSaving: isMasterSaving
      });
      const linkStatus = document.createElement("p");
      const createdAt = Date.parse(accountCreatedAt);
      const selectionDurationSeconds = Number(activeModels[0]?.passiveSeconds);
      const countdown = createQuestCountdown(createdAt + selectionDurationSeconds * 1000);

      if (countdown) masterChoices.prepend(countdown);
      linkStatus.className = "profile-master-link-status";
      linkStatus.setAttribute("role", "status");
      linkStatus.textContent = masterLinkError || (isMasterSaving ? "Linking..." : publicProfiles.length ? "" : "No Masters available yet.");
      masterChoices.append(linkStatus);
      content = masterChoices;
    }
    if (definition.content?.action === 'signup') {
      action = document.createElement('button');
      action.className = 'profile-play-button';
      action.type = 'button';
      action.textContent = definition.content.actionLabel || 'Accept';
      action.addEventListener('click', () => { onEvent('clicked'); onPlay(); });
    }
    if (definition.content?.action === 'accept_level_two') {
      action = document.createElement('button');
      action.className = 'profile-play-button';
      action.type = 'button';
      action.textContent = isQuestAcceptSaving ? 'Starting...' : 'Accept';
      action.disabled = isQuestAcceptSaving;
      action.addEventListener('click', () => { void onAcceptLevelTwoQuest(); });
      if (questAcceptError) {
        const status = document.createElement('p');
        status.setAttribute('role', 'alert');
        status.textContent = questAcceptError;
        content = status;
      }
    }
    const notice = createProfileNotice({
      action, content, onEvent,
      closable: definition.dismissible,
      text: definition.content?.text,
      textValues: values,
      title: definition.title,
      tone: definition.tone
    });
    notice.dataset.notificationKey = JSON.stringify([definition.id, occurrence]);
    panel.append(notice);
  }
  const syncStatus = document.createElement('p');
  syncStatus.dataset.notificationStatus = '';
  syncStatus.setAttribute('role', 'status');
  syncStatus.textContent = notifications?.error || '';
  syncStatus.hidden = !syncStatus.textContent;
  panel.append(syncStatus);

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

const createGameForm = (settings) => Object.fromEntries(
  JAYCEE_GAME_SKILL_COLUMNS.map((column) => [column, getDisplayValue(settings?.[column])])
);

const createEmptyGameSettings = () => createGameForm(null);

const createSkillForms = (skills) => (
  (skills || []).map((skill) => ({
    id: skill.id,
    label: getDisplayValue(skill.label),
    description: typeof skill.description === "string" ? skill.description : ""
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

const createSkillPanel = ({
  activeModels,
  currentLevel = 0,
  isDescriptionClosing = false,
  onSelect,
  onTogglePractice,
  passiveModel,
  player = null,
  practicingSkillIndex = null,
  selectedIndex = null,
  ultimateModel
}) => {
  if (!passiveModel && !activeModels.length && !ultimateModel) return null;

  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const buttons = document.createElement("div");
  const description = document.createElement("article");
  const abilities = [];

  section.className = "profile-parameter-panel";
  section.dataset.profileParameters = "";
  heading.textContent = "Abilities";
  buttons.className = "profile-ability-bar";
  description.className = "profile-parameter-section";

  if (passiveModel) {
    abilities.push({
      label: getDisplayValue(passiveModel.skill?.label) || "No skill",
      description: passiveModel.skill?.description || "",
      type: "passive",
      unlockLevel: 0
    });
  }
  activeModels.forEach((skillModel, index) => {
    abilities.push({
      label: getDisplayValue(skillModel.skillLabel) || "No skill",
      description: skillModel.skill?.description || "",
      type: "active",
      unlockLevel: index + 1
    });
  });

  if (ultimateModel) {
    abilities.push({
      label: getDisplayValue(ultimateModel.skillLabel) || "No skill",
      description: ultimateModel.skillDescription || "",
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
    button.classList.toggle("is-practicing", index === practicingSkillIndex);
    button.classList.add(ability.type === "active" ? "is-active-skill" : `is-${ability.type}`);
    button.type = "button";
    button.dataset.skillIndex = String(index);
    button.dataset.skillLabel = ability.label;
    button.dataset.state = ability.type === "passive" ? "Passive" : isLocked ? "" : ability.type === "ultimate" ? "Ultimate" : "Ready";
    button.disabled = isLocked;
    button.textContent = ability.label;
    button.title = "View skill details";
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
    description.classList.toggle("is-closing", isDescriptionClosing);
    if (activeAbility.type === "active") {
      const details = document.createElement("div");
      const countdown = document.createElement("p");
      const progress = document.createElement("p");

      details.className = "profile-skill-practice-details";
      details.dataset.skillPracticeDetails = String(activeIndex);
      countdown.dataset.practiceDeadline = "";
      progress.dataset.practiceProgress = "";
      details.append(countdown, progress);
      updatePracticeDetails(details, getActiveQuestInfo({ activeModels, player, selectedAbilityIndex: activeIndex }));
      description.append(details);
      if (activeAbility.description.trim()) description.append(document.createElement("hr"));
    }
    if (activeAbility.description.trim()) {
      const text = document.createElement("div");

      text.className = "profile-skill-description";
      renderSkillMarkdown(text, activeAbility.description);
      description.append(text);
    }
    if (activeAbility.type === "active") {
      const toggle = document.createElement("button");

      toggle.type = "button";
      toggle.className = "profile-play-button";
      toggle.dataset.practiceToggle = String(activeIndex);
      toggle.disabled = isDescriptionClosing || !player?.id || !activeModels[activeIndex - 1]?.skill
        || (activeIndex === 2 && isLevelTwoQuestPending(player));
      toggle.textContent = practicingSkillIndex === activeIndex ? "Stop" : "Start";
      toggle.addEventListener("click", () => onTogglePractice?.(activeIndex));
      description.append(toggle);
    }
  }

  section.append(heading, buttons);
  const practiceStatus = document.createElement("p");
  practiceStatus.className = "profile-practice-status";
  practiceStatus.setAttribute("role", "status");
  section.append(practiceStatus);

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
  let accountCreatedAt = "";
  let playerRows = [];
  let closingAbilityIndex = null;
  let descriptionCloseTimer = 0;
  let selectedAbilityIndex = null;
  let isMasterSaving = false;
  let masterLinkError = "";
  let supabaseClient = null;
  let skillForms = [];
  let skills = [];
  let practice = null;
  let notifications = null;
  const sounds = new SoundEffects();
  let isQuestAcceptSaving = false;
  let questAcceptError = "";
  const closeSkillDescription = (index) => {
    if (descriptionCloseTimer) window.clearTimeout(descriptionCloseTimer);
    selectedAbilityIndex = null;
    closingAbilityIndex = index;
    renderCoreParameters();
    renderVitalsPanel();
    shell.querySelector(`[data-skill-index="${index}"]`)?.focus();
    descriptionCloseTimer = window.setTimeout(() => {
      closingAbilityIndex = null;
      descriptionCloseTimer = 0;
      renderCoreParameters();
    }, 180);
  };
  const applySkillProgress = ({ player, years_burned, completed_occurrence }) => {
    const previous = currentPlayer;
    const progressed = previous?.id === player.id && Number(previous.level) !== Number(player.level);
    if (previous?.id === player.id) currentPlayer = player;
    playerRows = playerRows.map((row) => row.id === player.id ? player : row);
    if (playerProfile) playerProfile.years_burned = years_burned;
    if (previous?.id === player.id) {
      window.dispatchEvent(new CustomEvent("jaycee:player-updated", { detail: { player } }));
    }
    // A reset in another tab also ends practice against the previous quest clock.
    if (practice?.active?.playerId === player.id
      && practice.active.questStart !== (player[`skill_${practice.active.skillNumber}_start`] || null)) {
      practice.active = null;
    }
    if (completed_occurrence) notifications?.record('master_linked.v1', 'completed', completed_occurrence);
    if (progressed) {
      if (selectedAbilityIndex !== null) {
        closeSkillDescription(selectedAbilityIndex);
      } else {
        renderVitalsPanel();
        renderCoreParameters();
      }
      scheduleRenderCore();
    }
  };
  const loadMasterGame = async (masterProfile, masterGame = null) => {
    if (!supabaseClient || !masterProfile) return;

    activeMasterProfile = masterProfile;
    currentProfile = masterProfile;
    activeMasterGame = masterGame || await fetchUserGameSettings(supabaseClient, masterProfile);

    skills = await fetchSkillsByIds(supabaseClient, JAYCEE_GAME_SKILL_COLUMNS.map((column) => activeMasterGame?.[column]));
    skillForms = createSkillForms(skills);
    gameSettings = activeMasterGame;
    gameForm = createGameForm(gameSettings);
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

  const handleAcceptLevelTwoQuest = async () => {
    if (isQuestAcceptSaving || !supabaseClient || !isLevelTwoQuestPending(currentPlayer)) return;
    isQuestAcceptSaving = true;
    questAcceptError = "";
    renderVitalsPanel();
    try {
      if (practice) await practice.flush();
      const result = await acceptLevelTwoQuest(supabaseClient, currentPlayer.id);
      applySkillProgress(result);
      notifications?.record('level_two_prepare.v1', 'completed', `${result.player.id}:2`);
      sounds.play('notificationConfirm');
    } catch (error) {
      console.error("Jaycee Level 2 quest could not be started", error);
      questAcceptError = error?.message || "The quest could not be started. Please try again.";
    } finally {
      isQuestAcceptSaving = false;
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

    const activeModels = getActiveSkillModels({
      gameForm,
      skillForms
    });
    // Resolution follows saved game state, never merely clicking a quest action.
    if (playerProfile && notifications) {
      notifications.record('create_account.v1', 'completed');
      if (activeMasterProfile) notifications.record('choose_master.v1', 'completed');
    }
    const panel = createVitalsPanel({
      accountCreatedAt,
      activeMasterProfile,
      activeModels,
      isMasterSaving,
      masterLinkError,
      notifications,
      sounds,
      passiveSkillName: getPassiveSkillModel({ gameForm, skillForms, hasLinkedMaster: true }).skill?.label || "your passive skill",
      onAcceptLevelTwoQuest: handleAcceptLevelTwoQuest,
      isQuestAcceptSaving,
      questAcceptError,
      onPlay: handlePlayClick,
      onAcceptMaster: handleAcceptMasterClick,
      player: practice?.project(currentPlayer) || currentPlayer,
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
    sounds.notify(Array.from(panel.querySelectorAll('[data-notification-key]'),
      (notice) => notice.dataset.notificationKey));
    updateLiveUI();
  };

  const renderCoreParameters = () => {
    if (!canvas) return;

    const corePanel = canvas.closest(".game-core-panel");
    const existingPanel = corePanel?.querySelector("[data-profile-parameters]");
    const existingInventoryTitle = corePanel?.querySelector("[data-profile-inventory-title]");

    if (!corePanel || !playerProfile || !activeMasterProfile || !currentPlayer) {
      existingPanel?.remove();
      existingInventoryTitle?.remove();
      return;
    }

    const activeModels = getActiveSkillModels({
      gameForm,
      skillForms
    });
    const passiveModel = getPassiveSkillModel({
      gameForm,
      skillForms,
      hasLinkedMaster: Boolean(activeMasterProfile && currentPlayer)
    });
    const ultimateModel = getUltimateModel({
      gameForm,
      skillForms
    });
    const panel = createSkillPanel({
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
          closeSkillDescription(index);
          return;
        }

        closingAbilityIndex = null;
        selectedAbilityIndex = index;
        sounds.play('skillOpen');
        renderCoreParameters();
        renderVitalsPanel();
      },
      onTogglePractice: (index) => {
        if (!practice || !currentPlayer || closingAbilityIndex !== null
          || index < 1 || index > ACTIVE_RING_LIMIT || Number(currentPlayer.level) < index
          || (index === 2 && isLevelTwoQuestPending(currentPlayer))
          || !activeModels[index - 1]?.skill) return;

        if (practice.active?.skillNumber === index) {
          practice.stop();
          closeSkillDescription(index);
          return;
        }
        practice.start(currentPlayer.id, index, currentPlayer[`skill_${index}_start`] || null);
        sounds.play('skillStart');
        updateLiveUI();
      },
      isDescriptionClosing: closingAbilityIndex !== null,
      passiveModel,
      player: practice?.project(currentPlayer) || currentPlayer,
      practicingSkillIndex: practice?.active?.skillNumber ?? null,
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
    updateLiveUI();
  };

  const updateLiveUI = () => {
    const player = practice?.project(currentPlayer) || currentPlayer;
    const activeSkill = practice?.active?.skillNumber;
    const models = getActiveSkillModels({ gameForm, skillForms });
    shell.querySelectorAll("[data-skill-practice-details]").forEach((element) => {
      updatePracticeDetails(element, getActiveQuestInfo({
        activeModels: models, player, selectedAbilityIndex: Number(element.dataset.skillPracticeDetails)
      }));
    });
    const mannaModel = player && playerProfile ? getMannaModel({
      activeModels: models, player, playerProfile,
      selectedAbilityIndex: activeSkill ?? selectedAbilityIndex
    }) : null;

    updateVitalBar(shell.querySelector("[data-profile-vitals] .is-manna"), {
      centered: true, current: mannaModel?.value || 0, max: mannaModel?.maxAbs || 1,
      valueText: mannaModel
        ? `${formatMannaValue(mannaModel.value, mannaModel.unit)} / ${formatMannaValue(mannaModel.target, mannaModel.unit)}`
        : "0 € / 0 €"
    });
    if (playerProfile) {
      const health = (getAgeInSeconds(playerProfile.birth_date) || 0)
        + (Number(playerProfile.years_burned) || 0) * YEAR_SECONDS;
      updateVitalBar(shell.querySelector("[data-profile-vitals] .is-health"), {
        current: health, max: JAYCEE_GAME_CONFIG.lifeMaxYears * YEAR_SECONDS,
        valueText: `${formatYearsFromSeconds(health)} / ${JAYCEE_GAME_CONFIG.lifeMaxYears.toLocaleString()}y`
      });
    }

    shell.querySelectorAll("[data-skill-index]").forEach((button) => {
      const index = Number(button.dataset.skillIndex);
      const isPracticing = index === activeSkill;
      button.classList.toggle("is-practicing", isPracticing);
      button.setAttribute("aria-pressed", String(button.classList.contains("is-active")));
      button.dataset.state = isPracticing
        ? `Using · ${formatDuration(Math.floor(practice.elapsed()), { compact: false }) || "0s"}`
        : index === 0 ? "Passive" : button.disabled ? "" : index === 4 ? "Ultimate" : "Ready";
    });
    shell.querySelectorAll("[data-practice-toggle]").forEach((button) => {
      const isPracticing = Number(button.dataset.practiceToggle) === activeSkill;
      button.textContent = isPracticing ? "Stop" : "Start";
      button.setAttribute("aria-pressed", String(isPracticing));
    });
    const status = shell.querySelector(".profile-practice-status");
    if (status) status.textContent = practice?.error || "";
    const quest = Math.min(ACTIVE_RING_LIMIT, Math.max(1, Number(currentPlayer?.level) || 1));
    if (activeSkill === quest && models[quest - 1]?.skill
      && Number(player?.[`skill_${quest}_practice`]) >= models[quest - 1].questSeconds) {
      practice.stop();
    }
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

      const updatedProfile = await updateProfileMaster(supabaseClient, playerProfile, masterProfile.id);

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
    if (practice) await practice.flush();

    accountCreatedAt = getDisplayValue(user.created_at);

    const refreshedProfile = await fetchProfileByUserId(supabaseClient, user.id);

    if (!refreshedProfile) return;

    playerProfile = refreshedProfile;
    if (getDisplayValue(currentProfile?.id) === getDisplayValue(refreshedProfile.id)) {
      currentProfile = refreshedProfile;
    }
    playerRows = await fetchPlayersForUser(supabaseClient, refreshedProfile);
    activeMasterProfile = refreshedProfile.master
      ? await fetchProfileByUserId(supabaseClient, refreshedProfile.master)
      : null;
    currentPlayer = activeMasterProfile
      ? await fetchPlayerForGame(supabaseClient, refreshedProfile, activeMasterProfile)
      : null;
    if (currentPlayer) applySkillProgress(await syncSkillProgress(supabaseClient, currentPlayer.id));
    if (practice?.active && practice.active.playerId !== currentPlayer?.id) practice.stop();
    if (activeMasterProfile) await loadMasterGame(activeMasterProfile);

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

    accountCreatedAt = getDisplayValue(user?.created_at);

    notifications = new NotificationStore({
      client, userId: user?.id,
      onChange: () => {
        const status = shell.querySelector('[data-notification-status]');
        if (status) {
          status.textContent = notifications.error;
          status.hidden = !notifications.error;
        }
      }
    });
    await notifications.load();
    const syncNotifications = async () => {
      await notifications.load();
      renderVitalsPanel();
    };
    window.addEventListener('online', syncNotifications);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void syncNotifications();
    });
    window.addEventListener('storage', (event) => {
      if (event.key !== notifications.storageKey) return;
      notifications.mergeLocal();
      renderVitalsPanel();
    });
    // Reinitialize all user-owned state when the session identity changes, including in another tab.
    client.auth.onAuthStateChange((_event, session) => {
      if ((session?.user?.id || null) !== (user?.id || null)) {
        window.setTimeout(() => {
          if (_event === 'SIGNED_OUT') window.location.replace('/');
          else window.location.reload();
        }, 0);
      }
    });

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
    if (playerProfile?.master) {
      activeMasterProfile = await fetchProfileByUserId(client, playerProfile.master);
      currentPlayer = activeMasterProfile
        ? await fetchPlayerForGame(client, playerProfile, activeMasterProfile)
        : null;
    }
    if (activeMasterProfile) {
      await loadMasterGame(activeMasterProfile);
    } else {
      gameSettings = hasUserProfile ? await fetchUserGameSettings(client, profile) : null;
      gameForm = createGameForm(gameSettings);
      skills = await fetchSkillsByIds(client, JAYCEE_GAME_SKILL_COLUMNS.map((column) => gameSettings?.[column]));
      skillForms = createSkillForms(skills);
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
    avatarImage = hasUserProfile
      ? await loadOptionalImage(await getAvatarImageUrl(client, profile))
      : null;
    if (playerProfile) {
      practice = new PracticeTimer({
        userId: playerProfile.id,
        save: (session) => recordSkillPractice(supabaseClient, playerProfile, session),
        onSaved: applySkillProgress,
        onChange: updateLiveUI
      });
      await practice.flush();
      if (currentPlayer) applySkillProgress(await syncSkillProgress(client, currentPlayer.id));
    }
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
    let uiClock = 0;
    let questClock = 0;
    const startClocks = () => {
      if (uiClock) return;
      uiClock = window.setInterval(() => {
        updateLiveUI();
      }, 100);
      questClock = window.setInterval(() => {
        shell.querySelectorAll("[data-quest-deadline]").forEach((element) => updateQuestCountdown(element));
      }, 1000);
    };
    startClocks();
    window.addEventListener("online", () => { void practice?.flush(); });
    window.addEventListener("pagehide", () => {
      window.clearInterval(uiClock);
      window.clearInterval(questClock);
      uiClock = 0;
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) { startClocks(); void practice?.flush(); void syncNotifications(); }
    });
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

