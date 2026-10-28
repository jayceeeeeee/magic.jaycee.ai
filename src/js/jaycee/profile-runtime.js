import { createNoticeMasterBadge, createMastersNoticeContent, isMasterLinkLocked } from "./master-picker.js";
import { formatDuration, getPassiveSkillModel, getActiveSkillModels, getUltimateModel, getActiveQuestInfo, updateQuestCountdown, createQuestCountdown, updatePracticeDetails, createLockedIcon, createSkillPanel } from "./skill-panel.js";
import { GAME_RULES } from "../config/game-rules.js";
import { PracticeTimer } from "./practice-timer.js";
import { SoundEffects } from "./sounds.js";
import { getMannaModel, normalizeMannaUnit } from "../config/manna.js";
import { NotificationStore, interpolateNotification, isNotificationVisible, notificationOccurrence, isQuestPending } from "./notifications.js";
import {
  acceptQuest,
  switchMaster,
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
  recordSkillPractice,
  syncSkillProgress,
} from "../config/data.js";

const readPlayerName = () => { try { return getDisplayValue(window.localStorage.getItem("player_full_name")); } catch { return ""; } };
const ACTIVE_RING_LIMIT = 3;
const YEAR_SECONDS = GAME_RULES.skills[0].cycleSeconds;

const getSignupUrl = () => {
  return new URL("/signup.html", window.location.origin);
};

const redirectToSignup = () => {
  const signupUrl = getSignupUrl();
  const storedFullName = readPlayerName();

  signupUrl.searchParams.set("redirect", `${window.location.pathname}${window.location.search}`);
  if (storedFullName) {
    signupUrl.searchParams.set("full_name", storedFullName);
  }
  window.location.href = window.JayceeReferral?.withReferral(signupUrl.href) || signupUrl.href;
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

const appendNotificationText = (element, text, textValues = {}, masterBadgeProfile = null) => {
  String(text).split(/(\{[a-zA-Z]+\})/g).forEach((part) => {
    const key = part.slice(1, -1);
    const value = interpolateNotification(part, textValues);
    if (part === '{masterName}' && masterBadgeProfile) {
      element.append(createNoticeMasterBadge(masterBadgeProfile));
    } else if (['{passiveSkillName}', '{skillOneName}', '{skillTwoName}', '{skillThreeName}', '{skillFourName}', '{skillName}', '{masterName}'].includes(part) && Object.hasOwn(textValues, key)) {
      const emphasis = document.createElement("em");
      emphasis.textContent = value;
      element.append(emphasis);
    } else {
      element.append(document.createTextNode(value));
    }
  });
};

const createProfileNotice = ({
  action = null,
  content = null,
  closable = false,
  onEvent = () => {},
  text = "",
  textValues = {},
  masterBadgeProfile = null,
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

    appendNotificationText(paragraph, line, textValues, masterBadgeProfile);
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

const getLinkedQuestText = (questInfo) => (
  `You have ${questInfo.passiveTime} to do ${questInfo.requiredTime} of {skillName}. During this time you cannot link yourself to another Master. If you fail, your account will be deleted automatically. Click on the new unlocked skill below to start.`
);

const createLinkedMasterNoticeContent = ({ masterProfile, questInfo, level = 1 }) => {
  const fragment = document.createDocumentFragment();
  const firstLine = document.createElement("p");
  const secondLine = document.createElement("p");

  firstLine.append(
    document.createTextNode("Your energy has been linked to "),
    createNoticeMasterBadge(masterProfile),
    document.createTextNode(".")
  );
  appendNotificationText(secondLine, getLinkedQuestText(questInfo), { skillName: questInfo.skillName });
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
  const firstActiveAbility = GAME_RULES.skills.slice(1, 4)?.[0];
  return firstActiveAbility.practiceGoalSeconds * 1000;
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
  ultimateModel = null,
  onAcceptQuest,
  capabilityLevel = null,
  isQuestAcceptSaving = false,
  questAcceptError = "",
  onPlay,
  onAcceptMaster,
  onLoadMasterDetails = null,
  player,
  playerAvatarUrl = "",
  playerProfile,
  profile,
  adminProfile = null,
  publicProfiles = [],
  selectedAbilityIndex,
  lastMannaAbilityIndex = null,
  practicePlayers = [],
  completedPassiveSeconds = 0,
  practicingSkillIndex = null,
  totalLevel = 1
}) => {
  const panel = document.createElement("section");
  const hud = document.createElement("div");
  const identity = document.createElement("div");
  const avatar = document.createElement("div");
  const levelBadge = document.createElement("p");
  const bars = document.createElement("div");
  const profileLabel = document.createElement("h2");
  const lifeMaxYears = GAME_RULES.lifeMaxYears;
  const lifeMaxSeconds = GAME_RULES.lifeMaxYears * YEAR_SECONDS;
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
  const storedUsername = readPlayerName();
  const profileName = getDisplayValue(playerProfile?.username)
    || getDisplayValue(playerProfile?.full_name)
    || (!hasPlayerProfile ? storedUsername : "")
    || "Unknown";
  const noticeMasterProfile = adminProfile || publicProfiles.find((publicProfile) => (
    getDisplayValue(publicProfile.role).toLowerCase() === "admin"
  )) || publicProfiles[0] || null;
  const noticeMasterUsername = getDisplayValue(noticeMasterProfile?.username) || getDisplayValue(noticeMasterProfile?.full_name) || "Unknown";
  const noticeMasterUsernameElement = document.createElement("i");
  const noticeMasterContent = document.createDocumentFragment();
  const mannaModel = effectivePlayer && playerProfile
    ? getMannaModel({ activeModels, player: effectivePlayer, playerProfile, accountCreatedAt, practicePlayers, completedPassiveSeconds, selectedAbilityIndex, lastSelectedAbilityIndex: lastMannaAbilityIndex, practicingSkillIndex })
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
      locked: !(Number(capabilityLevel ?? player?.level) >= 2),
      max: lifeMaxSeconds,
      tone: "health",
      valueText: `${lifeValueText} / ${GAME_RULES.lifeMaxYears.toLocaleString()}y`
    }),
    createMannaBar(mannaModel, !(Number(capabilityLevel ?? player?.level) >= 2))
  );
  panel.replaceChildren();

  const values = {
    lifeMaxYears: lifeMaxYears.toLocaleString(),
    prayerKarmaYears: formatKarmaYears(prayerKarmaYears),
    remainingKarmaYears: formatKarmaYears(remainingKarmaYears),
    firstActivePassiveTime,
    passiveSkillName,
    skillOneName: activeModels[0]?.skillLabel || "your first skill",
    skillTwoName: activeModels[1]?.skillLabel || "your second skill",
    skillThreeName: activeModels[2]?.skillLabel || "your third skill",
    skillFourName: ultimateModel?.skillLabel || "your ultimate skill",
    masterName: getDisplayValue(activeMasterProfile?.username) || "your Master"
  };
  // Public profiles already pass the server's visibility/playability filter.
  // Guests use the invite username; confirmed accounts use the saved UUID only.
  const pendingReferrer = getDisplayValue(window.JayceeReferral?.getUsername()).toLowerCase();
  const referrerId = playerProfile ? playerProfile.referrer_id : publicProfiles.find((candidate) => (
    pendingReferrer && getDisplayValue(candidate.username).toLowerCase() === pendingReferrer
  ))?.id;
  // Only named, code-owned components/actions can be selected by catalog JSON.
  // Text always goes through textContent: database content cannot inject HTML.
  for (const definition of notifications?.definitions || []) {
    const occurrence = notificationOccurrence(definition, player);
    if (!isNotificationVisible(definition, notifications.receipt(definition.id, occurrence), {
      hasAccount: hasPlayerProfile, hasMaster: Boolean(activeMasterProfile), player
    })) continue;
    const onEvent = (action, { waitForEnd = false } = {}) => {
      const playback = window.JayceeUI?.waitForSound?.()
        ?? sounds.play('notificationConfirm', { waitForEnd });
      notifications.record(definition.id, action, occurrence);
      return playback;
    };
    let content = null;
    let action = null;
    const component = definition.content?.component;
    const isQuestAcceptance = ['accept_level_two', 'accept_quest'].includes(definition.content?.action);
    if (component === 'masters') content = createMastersNoticeContent(publicProfiles, { referrerId, onLoadDetails: onLoadMasterDetails });
    else if (component === 'karma_master') content = noticeMasterContent;
    else if (component === 'linked_quest') content = createLinkedMasterNoticeContent({
      masterProfile: activeMasterProfile, questInfo: linkedQuestInfo, level: Number(player?.level) || 1
    });
    else if (component === 'master_choices') {
      const masterChoices = createMastersNoticeContent(publicProfiles.filter((master) => (
        master.id !== playerProfile?.id && (!isQuestAcceptance || master.id !== activeMasterProfile?.id)
      )), {
        referrerId,
        onLoadDetails: onLoadMasterDetails,
        onSelect: (master) => {
          if (!isQuestAcceptance) onEvent('clicked');
          onAcceptMaster(master);
        },
        isSaving: isMasterSaving || isQuestAcceptSaving
      });
      const linkStatus = document.createElement("p");
      const createdAt = Date.parse(playerProfile?.master_selection_started_at || accountCreatedAt);
      const selectionDurationSeconds = GAME_RULES.skills.slice(1, 4)[0].cycleSeconds;
      const countdown = createQuestCountdown(createdAt + selectionDurationSeconds * 1000);

      if (countdown && !isQuestAcceptance) masterChoices.prepend(countdown);
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
      action.addEventListener('click', async () => {
        action.disabled = true;
        await onEvent('clicked', { waitForEnd: true });
        onPlay();
      });
    }
    if (isQuestAcceptance) {
      const choices = content || document.createDocumentFragment();
      content = choices;
      action = document.createElement('button');
      action.className = 'profile-play-button';
      action.type = 'button';
      action.textContent = isQuestAcceptSaving ? 'Starting...' : 'Accept';
      action.disabled = isQuestAcceptSaving || isMasterSaving;
      action.addEventListener('click', () => { void onAcceptQuest(); });
      if (questAcceptError) {
        const status = document.createElement('p');
        status.setAttribute('role', 'alert');
        status.textContent = questAcceptError;
        choices.append(status);
      }
    }
    const notice = createProfileNotice({
      action, content, onEvent,
      closable: definition.dismissible,
      text: definition.content?.text,
      textValues: values,
      masterBadgeProfile: definition.id === 'level_four_permanent.v1' ? activeMasterProfile : null,
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

const createGameForm = (settings) => Object.fromEntries(
  GAME_RULES.skills.map((skill) => skill.skillColumn).map((column) => [column, getDisplayValue(settings?.[column])])
);

const createSkillForms = (skills) => (
  (skills || []).map((skill) => ({
    id: skill.id,
    label: getDisplayValue(skill.label),
    description: typeof skill.description === "string" ? skill.description : ""
  }))
);

const attachProfileAvatarUrlsWith = async (client, profiles, resolveAvatar = getAvatarImageUrl) => Promise.all(
  profiles.map(async (profile) => {
    try {
      return {
        ...profile,
        avatarUrl: await resolveAvatar(client, profile)
      };
    } catch {
      return {
        ...profile,
        avatarUrl: ""
      };
    }
  })
);

export const initJayceePage = async ({ data = null, auth = window.JayceeAuth, notificationFactory = options => new NotificationStore(options), onGameEvent = () => {}, onError = () => {}, practiceCheckpointMs = 0 } = {}) => {
  const api = data || { acceptQuest: (...args) => acceptQuest(...args), switchMaster: (...args) => switchMaster(...args), createPlayerForGame: (...args) => createPlayerForGame(...args), fetchAdminProfile: (...args) => fetchAdminProfile(...args), fetchPlayerForGame: (...args) => fetchPlayerForGame(...args), fetchPlayersForUser: (...args) => fetchPlayersForUser(...args), fetchProfileByUserId: (...args) => fetchProfileByUserId(...args), fetchProfileByUsername: (...args) => fetchProfileByUsername(...args), fetchPublicProfiles: (...args) => fetchPublicProfiles(...args), fetchSkillsByIds: (...args) => fetchSkillsByIds(...args), fetchUserGameSettings: (...args) => fetchUserGameSettings(...args), getAvatarImageUrl: (...args) => getAvatarImageUrl(...args), recordSkillPractice: (...args) => recordSkillPractice(...args), syncSkillProgress: (...args) => syncSkillProgress(...args) };
  const attachProfileAvatarUrls = (client, profiles) => attachProfileAvatarUrlsWith(client, profiles, api.getAvatarImageUrl);
  const shell = document.querySelector("[data-profile-shell]");
  const gamePanel = shell?.querySelector("[data-game-content]");
  if (!shell || !gamePanel) return;
  const publicUsername = getDisplayValue(new URLSearchParams(window.location.search).get("username"));
  const hasUserProfile = Boolean(publicUsername);

  let publicProfiles = [];
  let adminProfile = null;
  let activeMasterProfile = null;
  let masterLineage = null;
  let activeMasterGame = null;
  let currentProfile = null;
  let currentPlayer = null;
  let gameForm = createGameForm(null);
  let gameSettings = null;
  let isPlayerSaving = false;
  let playerAvatarUrl = "";
  let playerProfile = null;
  let accountCreatedAt = "";
  let playerRows = [];
  let completedPassiveSeconds = 0;
  let closingAbilityIndex = null;
  let descriptionCloseTimer = 0;
  let selectedAbilityIndex = null;
  let lastMannaAbilityIndex = null;
  let cycleRefreshInFlight = false;
  let cycleRefreshRetryAt = 0;
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
    renderSkillPanel();
    renderVitalsPanel();
    shell.querySelector(`[data-skill-index="${index}"]`)?.focus();
    descriptionCloseTimer = window.setTimeout(() => {
      closingAbilityIndex = null;
      descriptionCloseTimer = 0;
      renderSkillPanel();
    }, 180);
  };
  const applySkillProgress = ({ player, years_burned, completed_occurrence, completed_skills = [], completed_passive_seconds }) => {
    if (Number.isFinite(completed_passive_seconds)) completedPassiveSeconds = completed_passive_seconds;
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
      if (Number(previous?.level) >= 4 && Number(player.level) >= 4
        && !completed_skills.includes(practice.active.skillNumber)) {
        practice.active.questStart = player[`skill_${practice.active.skillNumber}_start`] || null;
      } else {
        practice.active = null;
      }
    }
    if (completed_occurrence) notifications?.record('master_linked.v1', 'completed', completed_occurrence);
    if (progressed) {
      onGameEvent({ type: 'level_changed', player });
      if (selectedAbilityIndex !== null) {
        closeSkillDescription(selectedAbilityIndex);
      } else {
        renderVitalsPanel();
        renderSkillPanel();
      }
    }
  };
  const loadMasterGame = async (masterProfile, masterGame = null) => {
    if (!supabaseClient || !masterProfile) return;

    activeMasterProfile = masterProfile;
    currentProfile = masterProfile;
    // The Ultimate belongs to this Master, so show their own Master here.
    masterLineage = null;
    if (masterProfile.master) {
      try {
        const profile = await api.fetchProfileByUserId(supabaseClient, masterProfile.master);
        if (profile) [masterLineage] = await attachProfileAvatarUrls(supabaseClient, [profile]);
      } catch (error) {
        console.warn("Could not load the Master's Master", error);
      }
    }
    activeMasterGame = masterGame || await api.fetchUserGameSettings(supabaseClient, masterProfile);

    skills = await api.fetchSkillsByIds(supabaseClient, GAME_RULES.skills.map((skill) => skill.skillColumn).map((column) => activeMasterGame?.[column]));
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
      currentPlayer = await api.createPlayerForGame(supabaseClient, playerProfile, currentProfile);
      playerRows = await api.fetchPlayersForUser(supabaseClient, playerProfile);
    } catch (error) {
      console.error("Jaycee player could not be created", error);
    } finally {
      isPlayerSaving = false;
      renderVitalsPanel();
      renderSkillPanel();
    }
  };

  const handleAcceptQuest = async () => {
    if (isQuestAcceptSaving || isMasterSaving || !supabaseClient || !isQuestPending(currentPlayer)) return;
    isQuestAcceptSaving = true;
    questAcceptError = "";
    renderVitalsPanel();
    try {
      if (practice) await practice.flush();
      const level = Number(currentPlayer.level);
      const result = await api.acceptQuest(supabaseClient, currentPlayer.id, level);
      onGameEvent({ type: 'quest_accepted', player: result.player });
      applySkillProgress(result);
      notifications?.record(level === 2 ? 'level_two_prepare.v1' : 'level_three_prepare.v1', 'completed', `${result.player.id}:${level}`);
    } catch (error) {
      console.error("Jaycee quest could not be started", error);
      questAcceptError = error?.message || "The quest could not be started. Please try again.";
    } finally {
      isQuestAcceptSaving = false;
      renderVitalsPanel();
      renderSkillPanel();
    }
  };

  const renderVitalsPanel = () => {
    const existingPanel = gamePanel?.querySelector("[data-profile-vitals]");

    if (!gamePanel) {
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
      ultimateModel: getUltimateModel({ gameForm, skillForms }),
      onAcceptQuest: handleAcceptQuest,
      capabilityLevel: Math.max(playerProfile?.permanent_account_at ? 4 : 0, ...playerRows.map((row) => Number(row.level) || 0)),
      isQuestAcceptSaving,
      questAcceptError,
      onPlay: handlePlayClick,
      onAcceptMaster: handleAcceptMasterClick,
      onLoadMasterDetails: async (master) => {
        if (data?.fetchMasterDetails) return data.fetchMasterDetails(supabaseClient, master);
        const [profile, game] = await Promise.all([
          api.fetchProfileByUserId(supabaseClient, master.id),
          api.fetchUserGameSettings(supabaseClient, master)
        ]);
        const skills = await api.fetchSkillsByIds(supabaseClient, GAME_RULES.skills.map((skill) => skill.skillColumn).map((column) => game?.[column]));
        return { lore: profile?.lore, game, skills };
      },
      player: practice?.project(currentPlayer) || currentPlayer,
      adminProfile,
      playerAvatarUrl,
      playerProfile,
      profile: currentProfile,
      publicProfiles,
      selectedAbilityIndex,
      lastMannaAbilityIndex,
      practicePlayers: playerRows,
      completedPassiveSeconds,
      practicingSkillIndex: practice?.active?.skillNumber ?? null,
      totalLevel: getPlayerLevelTotal(playerRows)
    });

    if (existingPanel) {
      existingPanel.replaceWith(panel);
    } else {
      gamePanel.insertBefore(panel, gamePanel.firstChild);
    }
    sounds.notify(Array.from(panel.querySelectorAll('[data-notification-key]'),
      (notice) => notice.dataset.notificationKey));
    updateLiveUI();
  };

  const renderSkillPanel = () => {
    const existingPanel = gamePanel?.querySelector("[data-profile-parameters]");
    const existingInventoryTitle = gamePanel?.querySelector("[data-profile-inventory-title]");

    if (!gamePanel || !playerProfile || !activeMasterProfile || !currentPlayer) {
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
      currentLevel: Math.max(0, Number(currentPlayer.level) || 0),
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
        lastMannaAbilityIndex = index;
        renderSkillPanel();
        renderVitalsPanel();
      },
      onTogglePractice: (index) => {
        if (!practice || !currentPlayer || closingAbilityIndex !== null
          || index < 1 || index > ACTIVE_RING_LIMIT || Number(currentPlayer.level) < index
          || (index === Number(currentPlayer.level) && isQuestPending(currentPlayer))
          || !activeModels[index - 1]?.skill) return;

        if (practice.active?.skillNumber === index) {
          practice.stop();
          onGameEvent({ type: 'practice_stopped', player_id: currentPlayer.id, skill_number: index });
          closeSkillDescription(index);
          return;
        }
        practice.start(currentPlayer.id, index, currentPlayer[`skill_${index}_start`] || null);
        onGameEvent({ type: 'practice_started', player_id: currentPlayer.id, skill_number: index });
        updateLiveUI();
      },
      isDescriptionClosing: closingAbilityIndex !== null,
      passiveModel,
      player: practice?.project(currentPlayer) || currentPlayer,
      practicingSkillIndex: practice?.active?.skillNumber ?? null,
      selectedIndex: closingAbilityIndex ?? selectedAbilityIndex,
      masterLineage,
      hasLineageMaster: Boolean(activeMasterProfile.master),
      ultimateModel
    });

    if (!gamePanel || !panel) {
      existingPanel?.remove();
      existingInventoryTitle?.remove();
      return;
    }

    if (existingPanel) {
      existingPanel.replaceWith(panel);
    } else {
      gamePanel.append(panel);
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
      activeModels: models, player, playerProfile, accountCreatedAt,
      practicePlayers: playerRows,
      completedPassiveSeconds,
      selectedAbilityIndex,
      lastSelectedAbilityIndex: lastMannaAbilityIndex,
      practicingSkillIndex: activeSkill ?? null
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
        current: health, max: GAME_RULES.lifeMaxYears * YEAR_SECONDS,
        valueText: `${formatYearsFromSeconds(health)} / ${GAME_RULES.lifeMaxYears.toLocaleString()}y`
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
      button.dataset.uiSound = isPracticing ? "buttonClick" : "skillStart";
      button.setAttribute("aria-pressed", String(isPracticing));
    });
    const status = shell.querySelector(".profile-practice-status");
    if (status) status.textContent = practice?.error || "";
    if (activeSkill && models[activeSkill - 1]?.skill
      && Number(player?.[`skill_${activeSkill}_practice`]) >= models[activeSkill - 1].questSeconds) {
      practice.stop();
    }
  };

  const refreshExpiredSkillCycles = async () => {
    if (!supabaseClient || !currentPlayer?.id || cycleRefreshInFlight || Date.now() < cycleRefreshRetryAt) return;
    const models = getActiveSkillModels({ gameForm, skillForms });
    if (Number(currentPlayer.level) < 4) {
      const quest = getActiveQuestInfo({
        activeModels: models, player: currentPlayer,
        selectedAbilityIndex: isQuestPending(currentPlayer) ? Number(currentPlayer.level) - 1 : 0
      });
      if (Number.isFinite(quest.deadline) && Date.now() >= quest.deadline) {
        cycleRefreshInFlight = true;
        try {
          await auth?.checkAccountAccess();
        } catch {
          cycleRefreshRetryAt = Date.now() + 5000;
        } finally {
          cycleRefreshInFlight = false;
        }
      }
      return;
    }
    const expired = models.some((model, index) => {
      if (!model.skill) return false;
      const startedAt = Date.parse(currentPlayer?.[`skill_${index + 1}_start`] || "");
      return !Number.isFinite(startedAt) || Date.now() >= startedAt + model.passiveSeconds * 1000;
    });
    if (!expired) return;
    cycleRefreshInFlight = true;
    const playerId = currentPlayer.id;
    try {
      // Save queued practice against its old clock before renewing any cycle.
      if (practice) await practice.flush();
      if (practice?.error) throw new Error(practice.error);
      const result = await api.syncSkillProgress(supabaseClient, playerId);
      if (currentPlayer?.id === playerId) {
        applySkillProgress(result);
        updateLiveUI();
      }
    } catch (error) {
      console.warn("Jaycee skill cycles could not be refreshed", error);
      cycleRefreshRetryAt = Date.now() + 5000;
    } finally {
      cycleRefreshInFlight = false;
    }
  };

  const handleAcceptMasterClick = async (masterProfile) => {
    if (isMasterSaving || isQuestAcceptSaving || !masterProfile?.id || !playerProfile || !supabaseClient
      || isMasterLinkLocked(masterProfile)
      || masterProfile.id === activeMasterProfile?.id || masterProfile.id === playerProfile.id
      || (activeMasterProfile && !isQuestPending(currentPlayer))) return;

    isMasterSaving = true;
    masterLinkError = "";
    questAcceptError = "";
    renderVitalsPanel();

    try {
      const masterGame = await api.fetchUserGameSettings(supabaseClient, masterProfile);

      if (!masterGame?.id || !masterGame.skill_1) {
        throw new Error("This Master has no game available yet.");
      }

      practice?.stop();
      if (practice) await practice.flush();
      const player = await api.switchMaster(supabaseClient, masterProfile.id);
      playerProfile = { ...playerProfile, master: masterProfile.id };
      onGameEvent({ type: 'master_selected', master: masterProfile.username, player });
      currentPlayer = player;
      selectedAbilityIndex = null;
      lastMannaAbilityIndex = null;
      closingAbilityIndex = null;
      if (descriptionCloseTimer) window.clearTimeout(descriptionCloseTimer);
      descriptionCloseTimer = 0;
      playerRows = await api.fetchPlayersForUser(supabaseClient, playerProfile);
      await loadMasterGame(masterProfile, masterGame);
      window.dispatchEvent(new CustomEvent("jaycee:player-updated", { detail: { player } }));
    } catch (error) {
      console.error("Jaycee Master could not be linked", error);
      masterLinkError = error?.message || "The Master link could not be saved. Please try again.";
    } finally {
      isMasterSaving = false;
      renderVitalsPanel();
      renderSkillPanel();
    }
  };

  const refreshPlayerProfile = async () => {
    if (!supabaseClient) return;

    const sessionResult = await auth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (!user) return;
    if (practice) await practice.flush();

    accountCreatedAt = getDisplayValue(user.created_at);

    const refreshedProfile = await api.fetchProfileByUserId(supabaseClient, user.id);

    if (!refreshedProfile) return;

    playerProfile = refreshedProfile;
    if (getDisplayValue(currentProfile?.id) === getDisplayValue(refreshedProfile.id)) {
      currentProfile = refreshedProfile;
    }
    playerRows = await api.fetchPlayersForUser(supabaseClient, refreshedProfile);
    activeMasterProfile = refreshedProfile.master
      ? await api.fetchProfileByUserId(supabaseClient, refreshedProfile.master)
      : null;
    currentPlayer = activeMasterProfile
      ? await api.fetchPlayerForGame(supabaseClient, refreshedProfile, activeMasterProfile)
      : null;
    if (currentPlayer) applySkillProgress(await api.syncSkillProgress(supabaseClient, currentPlayer.id));
    if (practice?.active && practice.active.playerId !== currentPlayer?.id) practice.stop();
    if (activeMasterProfile) await loadMasterGame(activeMasterProfile);

    try {
      playerAvatarUrl = await api.getAvatarImageUrl(supabaseClient, refreshedProfile);
    } catch (error) {
      console.warn("Jaycee player avatar could not be refreshed", error);
      playerAvatarUrl = "";
    }

    try {
      publicProfiles = await attachProfileAvatarUrls(supabaseClient, await api.fetchPublicProfiles(supabaseClient, 100, {
        referrerId: playerProfile?.referrer_id || null,
        referralUsername: playerProfile ? "" : window.JayceeReferral?.getUsername() || ""
      }));
      if (activeMasterProfile) {
        activeMasterProfile = publicProfiles.find((publicProfile) => (
          getDisplayValue(publicProfile.id) === getDisplayValue(activeMasterProfile.id)
        )) || activeMasterProfile;
      }
    } catch (error) {
      console.warn("Jaycee public profiles could not be refreshed", error);
    }

    renderVitalsPanel();
    renderSkillPanel();
  };

  window.addEventListener("jaycee:account-updated", refreshPlayerProfile);

  try {
    const client = await auth.getSupabaseClient();
    supabaseClient = client;
    const sessionResult = await auth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    accountCreatedAt = getDisplayValue(user?.created_at);

    notifications = notificationFactory({
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

    const profile = publicUsername ? await api.fetchProfileByUsername(client, publicUsername) : null;
    currentProfile = profile;
    playerProfile = user
      ? getDisplayValue(profile?.id) === getDisplayValue(user.id)
        ? profile
        : await api.fetchProfileByUserId(client, user.id)
      : null;

    if (hasUserProfile && !profile) {
      shell.hidden = false;
      console.warn("Jaycee profile not found.");
      return;
    }

    playerRows = playerProfile ? await api.fetchPlayersForUser(client, playerProfile) : [];
    if (playerProfile?.master) {
      activeMasterProfile = await api.fetchProfileByUserId(client, playerProfile.master);
      currentPlayer = activeMasterProfile
        ? await api.fetchPlayerForGame(client, playerProfile, activeMasterProfile)
        : null;
    }
    if (activeMasterProfile) {
      await loadMasterGame(activeMasterProfile);
    } else {
      gameSettings = hasUserProfile ? await api.fetchUserGameSettings(client, profile) : null;
      gameForm = createGameForm(gameSettings);
      skills = await api.fetchSkillsByIds(client, GAME_RULES.skills.map((skill) => skill.skillColumn).map((column) => gameSettings?.[column]));
      skillForms = createSkillForms(skills);
      currentPlayer = profile && playerProfile
        ? await api.fetchPlayerForGame(client, playerProfile, profile)
        : currentPlayer;
    }
    if (playerProfile) {
      try {
        playerAvatarUrl = await api.getAvatarImageUrl(client, playerProfile);
      } catch (error) {
        console.warn("Jaycee player avatar could not be loaded", error);
        playerAvatarUrl = "";
      }
    }

    try {
      publicProfiles = await attachProfileAvatarUrls(client, await api.fetchPublicProfiles(client, 100, {
        referrerId: playerProfile?.referrer_id || null,
        referralUsername: playerProfile ? "" : window.JayceeReferral?.getUsername() || ""
      }));
      if (activeMasterProfile) {
        activeMasterProfile = publicProfiles.find((publicProfile) => (
          getDisplayValue(publicProfile.id) === getDisplayValue(activeMasterProfile.id)
        )) || activeMasterProfile;
      }
    } catch (error) {
      console.warn("Jaycee public profiles could not be loaded", error);
      publicProfiles = [];
    }
    try {
      const fetchedAdminProfile = await api.fetchAdminProfile(client);
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
    if (playerProfile) {
      practice = new PracticeTimer({
        userId: playerProfile.id,
        save: (session) => api.recordSkillPractice(supabaseClient, playerProfile, session),
        onSaved: applySkillProgress,
        onChange: updateLiveUI
      });
      await practice.flush();
      if (currentPlayer) applySkillProgress(await api.syncSkillProgress(client, currentPlayer.id));
    }
    shell.hidden = false;
    renderVitalsPanel();
    renderSkillPanel();
    let uiClock = 0;
    let questClock = 0;
    const startClocks = () => {
      if (uiClock) return;
      uiClock = window.setInterval(() => {
        updateLiveUI();
      }, 100);
      questClock = window.setInterval(() => {
        shell.querySelectorAll("[data-quest-deadline]").forEach((element) => updateQuestCountdown(element));
        void refreshExpiredSkillCycles();
      }, 1000);
    };
    startClocks();
    const checkpointClock = practiceCheckpointMs > 0 ? window.setInterval(() => { void practice?.checkpoint(); }, practiceCheckpointMs) : 0;
    if (practiceCheckpointMs > 0) document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') practice?.stop();
    });
    window.addEventListener("online", () => { void practice?.flush(); });
    window.addEventListener("pagehide", () => {
      practice?.stop();
      if (checkpointClock) window.clearInterval(checkpointClock);
      window.clearInterval(uiClock);
      window.clearInterval(questClock);
      uiClock = 0;
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) { startClocks(); void practice?.flush(); void syncNotifications(); }
    });
  } catch (error) {
    console.error("Jaycee profile load failed", error);
    onError(error);
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
