import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee
} from "./jaycee-core.js";
import {
  JAYCEE_GAME_CONFIG
} from "./jaycee-game-config.js";
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
} from "./jaycee-data.js";

const PROFILE_CORE_METRICS = {
  ringMaxRadialShare: 0.34,
  ringWidthMax: 32,
  ringWidthMin: 14,
  ringWidthRatio: 0.072
};
const PROFILE_RING_FILL_ALPHA = 0.26;
const ACTIVE_RING_LIMIT = 3;
const YEAR_SECONDS = 365 * 24 * 60 * 60;

const applyProfileTheme = (profile) => {
  const theme = getThemeSettingsFromProfile(profile).theme;

  document.body.dataset.theme = theme;
};

const getLoginUrl = () => (
  new URL(
    window.JayceeAuth?.getLoginUrl
      ? window.JayceeAuth.getLoginUrl()
      : "/src/html/auth/auth.html",
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

  const years = seconds / YEAR_SECONDS;

  return `${Number.isInteger(years) ? years : Number(years.toFixed(2))}y`;
};

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

const getManaModel = ({ player, playerProfile }) => {
  const level = Math.min(3, Math.max(1, Number(player?.level) || 1));
  const manaTarget = Number(playerProfile?.mana_target);
  const abilityConfig = JAYCEE_GAME_CONFIG.activeAbilities[level - 1] || JAYCEE_GAME_CONFIG.activeAbilities[0];
  const { end, start } = getCurrentPeriodBounds(level);
  const periodSeconds = Math.max(1, (end.getTime() - start.getTime()) / 1000);
  const elapsedSeconds = Math.min(periodSeconds, Math.max(0, (Date.now() - start.getTime()) / 1000));
  const periodTarget = Number.isFinite(manaTarget)
    ? manaTarget * (periodSeconds / YEAR_SECONDS)
    : 0;
  const activeCycleSeconds = periodSeconds / Math.max(1, Number(abilityConfig?.ratio) || 1);
  const practiceSeconds = Number(player?.[`skill_${level}_practice`]) || 0;
  const negativeMana = -periodTarget * (elapsedSeconds / periodSeconds);
  const positiveMana = activeCycleSeconds > 0
    ? periodTarget * (practiceSeconds / activeCycleSeconds)
    : 0;
  const value = negativeMana + positiveMana;

  return {
    maxAbs: Math.max(1, Math.abs(periodTarget)),
    target: periodTarget,
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

  return getActiveFractals(dynamicFractals, gameForm)
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
        skillLabel: getDisplayValue(skill.label) || "Active"
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

  return username ? `/src/html/jaycee-profile.html?username=${encodeURIComponent(username)}` : "";
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
    window.location.href = `/src/html/jaycee-profile.html?username=${encodeURIComponent(username)}`;
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

const createVitalsPanel = ({ onPlay, player, playerProfile }) => {
  const panel = document.createElement("section");
  const level = Number(player?.level) || 0;
  const levelText = document.createElement("p");
  const playButton = document.createElement("button");
  const lifeMaxSeconds = JAYCEE_GAME_CONFIG.lifeMaxYears * YEAR_SECONDS;
  const hasPlayer = Boolean(player);
  const lifeSeconds = Number(player?.life_bar) || 0;
  const manaModel = hasPlayer ? getManaModel({ player, playerProfile }) : null;

  panel.className = "profile-vitals-panel";
  panel.dataset.profileVitals = "";
  panel.replaceChildren(
    createVitalBar({
      current: hasPlayer ? lifeSeconds : 0,
      label: "Health",
      max: lifeMaxSeconds,
      tone: "health",
      valueText: hasPlayer
        ? `${formatYearsFromSeconds(lifeSeconds)} / ${JAYCEE_GAME_CONFIG.lifeMaxYears.toLocaleString()}y`
        : ""
    }),
    createVitalBar({
      centered: true,
      current: manaModel?.value || 0,
      label: "Mana",
      max: manaModel?.maxAbs || 1,
      tone: "mana",
      valueText: hasPlayer && manaModel
        ? `${Number(manaModel.value.toFixed(2))} / ${Number(manaModel.target.toFixed(2))}`
        : ""
    })
  );

  if (hasPlayer) {
    levelText.className = "profile-player-level";
    levelText.textContent = `Level ${level}`;
    panel.append(levelText);
  }

  if (!hasPlayer) {
    playButton.className = "profile-play-button";
    playButton.type = "button";
    playButton.textContent = "Play";
    playButton.addEventListener("click", onPlay);
    panel.append(playButton);
  }

  return panel;
};

const getPublicProfileUsernameFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const queryUsername = getDisplayValue(params.get("username"));

  if (queryUsername) return queryUsername;
  if (!window.location.pathname.endsWith("/jaycee-profile.html")) return "";

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

const createFractalParameterPanel = ({
  activeModels,
  currentLevel = 0,
  onSelect,
  passiveModel,
  selectedIndex = 0,
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
  heading.textContent = "Skills";
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
        label: "Teammate",
        value: getDisplayValue(ultimateModel.linkedProfile?.username) || "No teammate"
      }, {
        label: "Skill",
        value: ultimateModel.skillLabel || "No skill"
      }],
      type: "ultimate",
      unlockLevel: 4
    });
  }

  const activeIndex = Math.min(Math.max(0, selectedIndex), Math.max(0, abilities.length - 1));
  const activeAbility = abilities[activeIndex];

  abilities.forEach((ability, index) => {
    const button = document.createElement("button");
    const isLocked = currentLevel < ability.unlockLevel;

    button.className = "profile-ability-button";
    button.classList.toggle("is-active", index === activeIndex);
    button.classList.toggle("is-locked", isLocked);
    button.classList.add(ability.type === "active" ? "is-active-skill" : `is-${ability.type}`);
    button.type = "button";
    button.textContent = ability.label;
    button.dataset.state = ability.type === "passive" ? "Passive" : isLocked ? "Locked" : ability.type === "ultimate" ? "Ultimate" : "Ready";
    button.setAttribute("aria-pressed", String(index === activeIndex));
    button.addEventListener("click", () => onSelect?.(index));
    buttons.append(button);
  });

  if (activeAbility && currentLevel >= activeAbility.unlockLevel) {
    descriptionTitle.textContent = "Description";
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
  const isPresentPage = pageMode === "present";
  const isEditableProfilePage = pageMode === "profile" && !publicUsername;
  const hasUserProfile = Boolean(publicUsername) || isEditableProfilePage;

  if (!shell || !canvas) return;

  let dynamicFractals = [];
  let publicProfiles = [];
  let avatarImage = null;
  let currentProfile = null;
  let currentPlayer = null;
  let gameForm = createEmptyGameSettings();
  let gameSettings = null;
  let isPlayerSaving = false;
  let playerProfile = null;
  let selectedAbilityIndex = 0;
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

    if (!corePanel || !hasUserProfile) {
      existingPanel?.remove();
      return;
    }

    const panel = createVitalsPanel({
      onPlay: handlePlayClick,
      player: currentPlayer,
      playerProfile
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
      currentLevel: Number(currentPlayer?.level) || 0,
      onSelect: (index) => {
        selectedAbilityIndex = index;
        renderCoreParameters();
      },
      passiveModel,
      selectedIndex: selectedAbilityIndex,
      ultimateModel
    });

    if (!corePanel || !panel) {
      existingPanel?.remove();
      return;
    }

    if (existingPanel) {
      existingPanel.replaceWith(panel);
    } else {
      canvas.insertAdjacentElement("afterend", panel);
    }
  };

  const renderCore = () => {
    if (!canvas) return;

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
