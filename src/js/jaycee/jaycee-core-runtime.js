import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee
} from "./jaycee-core.js";
import {
  JAYCEE_GAME_CONFIG
} from "./jaycee-game-config.js";
import {
  fetchDynamicFractalElements,
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
const FRACTAL_SQUARE_GRID_SIZE = 3;
const FRACTAL_GRID_DISPLAY_LIMIT = 5;
const TRAILING_GLYPH_PATTERN = /((?:\p{Extended_Pictographic}|\p{S})(?:\uFE0F|\uFE0E)?(?:\u200D(?:\p{Extended_Pictographic}|\p{S})(?:\uFE0F|\uFE0E)?)*)\s*$/u;
const HEALTH_MAX_YEARS = 1000000;

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

  loginUrl.searchParams.set("redirect", window.location.pathname);
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

const getElementLabel = (element, fallback = "") => (
  getDisplayValue(element?.label)
  || getDisplayValue(element?.value)
  || getDisplayValue(element?.name)
  || fallback
);

const getTrailingGlyph = (value) => {
  const label = getDisplayValue(value).trim();
  const match = label.match(TRAILING_GLYPH_PATTERN);

  return match?.[1] || "";
};

const getFractalElements = (elementsByFractalId, fractalId) => (
  (elementsByFractalId.get(getDisplayValue(fractalId)) || [])
    .slice()
    .sort((first, second) => {
      const firstPosition = Number(first.position);
      const secondPosition = Number(second.position);

      if (Number.isFinite(firstPosition) && Number.isFinite(secondPosition)) {
        return firstPosition - secondPosition;
      }

      return getDisplayValue(first.id).localeCompare(getDisplayValue(second.id));
    })
);

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
  elements,
  fractal,
  passiveSeconds = null,
  skill = null,
  skillLabel = ""
}) => {
  if (!fractal) return null;

  return {
    cycleSeconds,
    distanceMeters,
    elements,
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
  elementsByFractalId,
  gameForm
}) => {
  const fractal = getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.passive.fractalLabel)
    || getFractalById(dynamicFractals, gameForm?.primary_fractal);
  const elements = getFractalElements(elementsByFractalId, fractal?.id);

  return createFractalMeasureModel({
    cycleSeconds: JAYCEE_GAME_CONFIG.passive.cycleSeconds,
    distanceMeters: JAYCEE_GAME_CONFIG.passive.zoneMeters,
    elements,
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

const getFractalsForCoreGrid = ({ dynamicFractals, gameForm }) => ([
  getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.passive.fractalLabel)
    || getFractalById(dynamicFractals, gameForm?.primary_fractal),
  ...getActiveFractals(dynamicFractals, gameForm).slice(0, ACTIVE_RING_LIMIT),
  getFractalByLabel(dynamicFractals, JAYCEE_GAME_CONFIG.ultimate.fractalLabel)
    || getFractalById(dynamicFractals, gameForm?.ultimate_fractal)
].filter(Boolean).slice(0, FRACTAL_GRID_DISPLAY_LIMIT));

const getActiveFractalModels = ({
  dynamicFractals,
  elementsByFractalId,
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
      const elements = getFractalElements(elementsByFractalId, fractal?.id);

      if (!fractal || !elements.length) return null;

      previousQuestSeconds = questSeconds;
      previousDistanceMeters = distanceMeters;

      return createFractalMeasureModel({
        cycleSeconds: questSeconds,
        distanceMeters,
        elements,
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

const getJayceeOrderedElementGlyphs = (elements) => (
  JAYCEE_ORDER.map((number) => getTrailingGlyph(getElementLabel(elements[number - 1])))
);

const getFractalGridSquareModel = ({ dynamicFractals, elementsByFractalId, gameForm }) => {
  const fractals = getFractalsForCoreGrid({ dynamicFractals, gameForm });
  const subCellLabelsByPosition = {};

  fractals.forEach((fractal, index) => {
    const position = JAYCEE_ORDER[index];
    const elements = getFractalElements(elementsByFractalId, fractal.id);
    const labels = getJayceeOrderedElementGlyphs(elements);

    if (position && labels.some(Boolean)) {
      subCellLabelsByPosition[position] = labels;
    }
  });

  if (!Object.keys(subCellLabelsByPosition).length) return null;

  return {
    coreStyle: true,
    fillAlpha: 0.08,
    gridSize: FRACTAL_SQUARE_GRID_SIZE,
    labels: getEmptyLabels(FRACTAL_SQUARE_GRID_SIZE * FRACTAL_SQUARE_GRID_SIZE),
    subCellLabelsByPosition
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
    window.location.href = `/src/html/jaycee-profile.html?username=${encodeURIComponent(username)}`;
  });
  label.append(text, select);

  return label;
};

const createVitalBar = ({ current, label, max, tone, valueText }) => {
  const bar = document.createElement("div");
  const header = document.createElement("div");
  const name = document.createElement("span");
  const value = document.createElement("span");
  const track = document.createElement("div");
  const fill = document.createElement("span");
  const progress = Number.isFinite(Number(current)) && Number.isFinite(Number(max)) && Number(max) > 0
    ? Math.min(1, Math.max(0, Number(current) / Number(max)))
    : 0;

  bar.className = `profile-vital-bar is-${tone}`;
  header.className = "profile-vital-header";
  name.textContent = label;
  value.textContent = valueText;
  track.className = "profile-vital-track";
  fill.className = "profile-vital-fill";
  fill.style.width = `${progress * 100}%`;
  header.append(name, value);
  track.append(fill);
  bar.append(header, track);

  return bar;
};

const createVitalsPanel = (profile) => {
  const panel = document.createElement("section");
  const age = getAgeInYears(profile?.birth_date);

  panel.className = "profile-vitals-panel";
  panel.dataset.profileVitals = "";
  panel.replaceChildren(
    createVitalBar({
      current: age || 0,
      label: "Health",
      max: HEALTH_MAX_YEARS,
      tone: "health",
      valueText: age === null ? `0 / ${HEALTH_MAX_YEARS.toLocaleString()}y` : `${age} / ${HEALTH_MAX_YEARS.toLocaleString()}y`
    }),
    createVitalBar({
      current: 0,
      label: "Mana",
      max: 1,
      tone: "mana",
      valueText: "0 / daily quests"
    })
  );

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

const createFractalParameterPanel = ({ activeModels, passiveModel, ultimateModel }) => {
  if (!passiveModel && !activeModels.length && !ultimateModel) return null;

  const section = document.createElement("section");
  const heading = document.createElement("h2");

  section.className = "profile-parameter-panel";
  section.dataset.profileParameters = "";
  heading.textContent = "Parameters";
  section.append(heading);
  if (passiveModel) {
    const group = document.createElement("article");
    const title = document.createElement("h3");
    const list = document.createElement("dl");
    const rows = [{
      label: "Passive",
      value: formatDuration(passiveModel.cycleSeconds, { compact: false }) || "00:00:00"
    }, {
      label: "Zone",
      value: formatDistance(passiveModel.distanceMeters) || "0m"
    }];

    group.className = "profile-parameter-section";
    title.textContent = passiveModel.label;
    list.className = "profile-parameter-list";
    rows.forEach((row) => {
      const label = document.createElement("dt");
      const value = document.createElement("dd");

      label.textContent = row.label;
      value.textContent = row.value;
      list.append(label, value);
    });
    group.append(title, list);
    section.append(group);
  }
  activeModels.forEach((fractalModel) => {
    const group = document.createElement("article");
    const title = document.createElement("h3");
    const list = document.createElement("dl");
    const rows = [{
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
    }];

    group.className = "profile-parameter-section";
    title.textContent = fractalModel.label;
    list.className = "profile-parameter-list";
    rows.forEach((row) => {
      const label = document.createElement("dt");
      const value = document.createElement("dd");

      label.textContent = row.label;
      value.textContent = row.value;
      list.append(label, value);
    });
    group.append(title, list);
    section.append(group);
  });

  if (ultimateModel) {
    const group = document.createElement("article");
    const title = document.createElement("h3");
    const list = document.createElement("dl");
    const profileUrl = getPublicProfileUrl(ultimateModel.linkedProfile);
    const rows = [{
      href: profileUrl,
      isProfileLink: true,
      label: "Teammate",
      value: getDisplayValue(ultimateModel.linkedProfile?.username) || "No teammate"
    }, {
      label: "Skill",
      value: ultimateModel.skillLabel || "No skill"
    }];

    group.className = "profile-parameter-section";
    title.textContent = ultimateModel.label;
    list.className = "profile-parameter-list";
    rows.forEach((row) => {
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
    group.append(title, list);
    section.append(group);
  }

  return section;
};

const createProfileCoreState = ({
  avatarImage,
  fractalSquare,
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
    squareFillAlpha: hasUserProfile ? undefined : PROFILE_RING_FILL_ALPHA,
    squareCellBorderAlpha: 0.34,
    mapSquare: fractalSquare,
    squareBackgroundImage: avatarImage
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

  let dynamicFractalElements = [];
  let dynamicFractals = [];
  let publicProfiles = [];
  let avatarImage = null;
  let currentProfile = null;
  let gameForm = createEmptyGameSettings();
  let gameSettings = null;
  let supabaseClient = null;
  let skillForms = [];
  let skills = [];
  let ultimateTeammateSkillLabel = "";
  const getElementsByFractalId = () => (
    dynamicFractalElements.reduce((elementsById, element) => {
      const fractalId = getDisplayValue(element.fractal_id) || getDisplayValue(element.fractal);

    if (!fractalId) return elementsById;
      if (!elementsById.has(fractalId)) {
        elementsById.set(fractalId, []);
      }
      elementsById.get(fractalId).push(element);

      return elementsById;
    }, new Map())
  );

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

    const panel = createVitalsPanel(currentProfile);

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
      elementsByFractalId: getElementsByFractalId(),
      gameForm,
      skillForms
    });
    const passiveModel = getPassiveFractalModel({
      dynamicFractals,
      elementsByFractalId: getElementsByFractalId(),
      gameForm
    }) || getPassiveModel({ dynamicFractals, gameForm });
    const ultimateModel = getUltimateModel({
      dynamicFractals,
      gameForm,
      publicProfiles,
      ultimateTeammateSkillLabel
    });
    const panel = createFractalParameterPanel({ activeModels, passiveModel, ultimateModel });

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

    const elementsByFractalId = getElementsByFractalId();
    const fractalSquare = getFractalGridSquareModel({
      dynamicFractals,
      elementsByFractalId,
      gameForm
    });

    const coreState = createProfileCoreState({
      avatarImage,
      fractalSquare,
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
    dynamicFractalElements = hasUserProfile
      ? await fetchDynamicFractalElements(client, dynamicFractals.map((fractal) => fractal.id))
      : [];
    skills = hasUserProfile
      ? await fetchSkillsByIds(client, dynamicFractals.map((fractal) => fractal.skill))
      : [];
    skillForms = createSkillForms(skills);
    gameSettings = hasUserProfile ? await fetchUserGameSettings(client, profile) : null;
    gameForm = createGameForm(gameSettings);

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
