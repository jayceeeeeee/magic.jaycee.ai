import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee,
  getJayceeHit,
  getTopCenteredLastSegmentRotation
} from "./jaycee-core.js";
import {
  CORE_TIME_RING_ID,
  DEFAULT_CORE_TIME_NUMBER,
  DEFAULT_SELECTED_NUMBER,
  GOD_TYPE_VALUE,
  LORE_TYPE_VALUE,
  fetchJayceeResonances,
  fetchProfileByUserId,
  fetchProfileByUsername,
  fetchPublicProfiles,
  fetchUserResonances,
  fetchUserDynamicFractals,
  fetchUserGameSettings,
  getAvatarImageUrl,
  getBackgroundImageUrl,
  getDisplayValue,
  getThemeSettingsFromProfile,
  isHexColor,
  loadOptionalImage,
  parseBrowserGregorianDate,
  upsertUserGameSettings
} from "./jaycee-data.js";
import {
  createResonanceColumn,
  getResonanceGroupsForNumber,
  getRowsForType
} from "./jaycee-dashboard.js";

const PROFILE_CORE_METRICS = {
  ringMaxRadialShare: 0.34,
  ringWidthMax: 32,
  ringWidthMin: 14,
  ringWidthRatio: 0.072
};
const PROFILE_RING_ACTIVE_FILL_ALPHA = 0.09;
const PROFILE_RING_FILL_ALPHA = 0.26;
const PROFILE_CLOCK_REFRESH_MS = 1000;
const PROFILE_VIEW_CACHE_PREFIX = "jayceeProfileView";
const CORE_MAP_FALLBACK_LABEL = "God";
const CORE_TIME_FALLBACK_LABEL = "Lore";
const DEFAULT_PRESENT_POSITION = "0,0";
const PRESENT_START_VALUE = "PRESENT";

const isPresentReference = (value) => getDisplayValue(value).toUpperCase() === PRESENT_START_VALUE;

const getProfileViewCacheKey = ({ pageMode, profile, publicUsername }) => {
  const profileKey = profile?.id || publicUsername || "core";

  return `${PROFILE_VIEW_CACHE_PREFIX}:${pageMode}:${profileKey}`;
};

const loadProfileViewCache = (cacheKey) => {
  try {
    const value = window.localStorage.getItem(cacheKey);

    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.warn("Jaycee profile view cache could not be loaded", error);
    return null;
  }
};

const saveProfileViewCache = (cacheKey, state) => {
  if (!cacheKey) return;

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(state));
  } catch (error) {
    console.warn("Jaycee profile view cache could not be saved", error);
  }
};

const hexToRgbParts = (color) => {
  const value = Number.parseInt(color.slice(1), 16);

  return {
    blue: value & 255,
    green: (value >> 8) & 255,
    red: (value >> 16) & 255
  };
};

const clampColorChannel = (value) => Math.min(255, Math.max(0, Math.round(value)));

const rgbPartsToHex = ({ red, green, blue }) => (
  `#${[red, green, blue].map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0")).join("")}`
);

const mixHexColors = (start, end, amount) => {
  const startRgb = hexToRgbParts(start);
  const endRgb = hexToRgbParts(end);

  return rgbPartsToHex({
    blue: startRgb.blue + ((endRgb.blue - startRgb.blue) * amount),
    green: startRgb.green + ((endRgb.green - startRgb.green) * amount),
    red: startRgb.red + ((endRgb.red - startRgb.red) * amount)
  });
};

const getCssColorValue = (name, fallback) => {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();

  return isHexColor(value) ? value : fallback;
};

const getCoreTimeRingSegmentColors = () => {
  const primary = getCssColorValue("--accent", "#53dcc6");
  const secondary = getCssColorValue("--accent-soft", "#ffd56b");

  return Array.from({ length: JAYCEE_ORDER.length }, (_, index) => {
    const alternation = index % 2 === 0 ? 0 : 0.08;

    return {
      centerStop: 0.18,
      end: mixHexColors(primary, secondary, 0.64 + alternation),
      gradientMode: "radial",
      middle: mixHexColors(primary, secondary, 0.32 + alternation),
      middleStop: 0.48,
      start: mixHexColors(primary, "#ffffff", 0.28)
    };
  });
};

const applyProfileTheme = (profile) => {
  const theme = getThemeSettingsFromProfile(profile).theme;

  document.body.dataset.theme = theme;
};

const getLoginUrl = () => (
  new URL(
    window.JayceeAuth?.getLoginUrl
      ? window.JayceeAuth.getLoginUrl()
      : "/src/html/auth/login.html",
    window.location.origin
  )
);

const redirectToLogin = () => {
  const loginUrl = getLoginUrl();

  loginUrl.searchParams.set("redirect", window.location.pathname);
  window.location.href = loginUrl.href;
};

const getEmptyLabels = (count) => Array.from({ length: count }, () => "");

const getActiveSegmentIndex = (segmentKeys, selectedSegment) => (
  Math.max(0, segmentKeys.findIndex((key) => String(key) === String(selectedSegment)))
);

const formatDuration = (secondsValue) => {
  let seconds = Math.floor(Number(secondsValue));

  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  const year = 365 * 24 * 60 * 60;
  const month = 30 * 24 * 60 * 60;
  const day = 24 * 60 * 60;
  const years = Math.floor(seconds / year);
  seconds %= year;
  const months = Math.floor(seconds / month);
  seconds %= month;
  const days = Math.floor(seconds / day);
  seconds %= day;
  const hours = Math.floor(seconds / (60 * 60));
  seconds %= 60 * 60;
  const minutes = Math.floor(seconds / 60);
  const finalSeconds = seconds % 60;
  const dateParts = [
    ...(years ? [`${years}y`] : []),
    ...(months ? [`${months}mo`] : []),
    ...(days ? [`${days}d`] : [])
  ];
  const clock = [hours, minutes, finalSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  return [...dateParts, clock].join(" ");
};

const getLengthSeconds = (fractal) => Number(fractal?.length);

const formatDurationOffset = (secondsValue) => {
  const seconds = Number(secondsValue);

  if (!Number.isFinite(seconds) || seconds < 0) return "";

  return seconds === 0 ? "00:00:00" : formatDuration(seconds);
};

const formatBrowserPosition = (position) => {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return DEFAULT_PRESENT_POSITION;

  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
};

const getSegmentCycleMeasureRows = ({
  cycleSeconds,
  rotation,
  segmentCount,
  selectedSegmentIndex
}) => {
  if (
    !Number.isFinite(cycleSeconds)
    || cycleSeconds <= 0
    || !Number.isFinite(segmentCount)
    || segmentCount <= 0
    || selectedSegmentIndex <= 0
  ) {
    return [];
  }

  const fullCircle = Math.PI * 2;
  const segmentAngle = fullCircle / segmentCount;
  const selectedIndex = selectedSegmentIndex - 1;
  const segmentStartAngle = Number.isFinite(rotation)
    ? rotation + (selectedIndex * segmentAngle)
    : (-Math.PI / 2) + (selectedIndex * segmentAngle);
  const angleToCycleSeconds = (angle) => {
    const progress = (((angle + (Math.PI / 2)) % fullCircle) + fullCircle) % fullCircle / fullCircle;

    return progress * cycleSeconds;
  };
  const start = angleToCycleSeconds(segmentStartAngle);
  const end = angleToCycleSeconds(segmentStartAngle + segmentAngle);
  const summit = angleToCycleSeconds(segmentStartAngle + (segmentAngle / 2));

  return [{
    label: "Start",
    value: formatDurationOffset(start)
  }, {
    label: "End",
    value: formatDurationOffset(end)
  }, {
    label: "Peak",
    value: formatDurationOffset(summit)
  }].filter((row) => row.value);
};

const getRingParameterRows = (fractal, options = {}) => {
  const now = options.now || Date.now();
  const lengthSeconds = getLengthSeconds(fractal);
  const length = formatDuration(lengthSeconds);
  const present = formatDuration(getTimeCycleElapsedSeconds(fractal, now));
  const segmentKeys = options.segmentKeys || [];
  const selectedSegment = options.selectedSegment || segmentKeys[0] || "";
  const selectedSegmentIndex = getSegmentControlValue(segmentKeys, selectedSegment);
  const canControlSegment = Boolean(options.ringId && segmentKeys.length > 1);
  const segmentMeasureRows = getSegmentCycleMeasureRows({
    cycleSeconds: lengthSeconds,
    rotation: options.rotation,
    segmentCount: segmentKeys.length,
    selectedSegmentIndex
  });

  return [
    ...(length ? [{ label: "Cycle", value: length }] : []),
    ...(present ? [{
      label: "Present",
      value: present
    }] : []),
    ...(canControlSegment ? [{
      control: {
        getValueLabel: (value) => segmentKeys[Math.max(0, Number(value) - 1)] || "",
        max: segmentKeys.length,
        min: 1,
        onChange: (value) => {
          const segmentKey = segmentKeys[Math.max(0, Number(value) - 1)];

          if (segmentKey) {
            options.onSegmentChange?.(options.ringId, segmentKey);
          }
        },
        type: "range",
        value: selectedSegmentIndex
      },
      label: "Segment",
      value: selectedSegment
    }] : []),
    ...segmentMeasureRows
  ];
};

const getGroupsWithSelectedResonanceValue = (groups, selectedNumber) => (
  groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({
      ...row,
      resonanceValue: getDisplayValue(row[String(selectedNumber)])
    }))
  }))
);

const getCoreTimeSegmentKeys = () => JAYCEE_ORDER.map(String);

const getTimeCycleStartMilliseconds = (fractal, now = Date.now()) => (
  isPresentReference(fractal?.start_at)
    ? now
    : parseBrowserGregorianDate(fractal?.start_at)
);

const getTimeCycleElapsedMilliseconds = (fractal, now = Date.now()) => {
  const startAt = getTimeCycleStartMilliseconds(fractal, now);
  const cycleMs = getLengthSeconds(fractal) * 1000;

  if (!Number.isFinite(startAt) || !Number.isFinite(cycleMs) || cycleMs <= 0) return null;

  const elapsedMs = ((now - startAt) % cycleMs + cycleMs) % cycleMs;

  return elapsedMs;
};

const getTimeCycleElapsedSeconds = (fractal, now = Date.now()) => {
  const elapsedMs = getTimeCycleElapsedMilliseconds(fractal, now);

  return Number.isFinite(elapsedMs) ? elapsedMs / 1000 : null;
};

const getPresentSegmentKey = (fractal, segmentKeys, rotation, now = Date.now()) => {
  const presentAngle = getTimeCyclePresentAngle(fractal, now);
  const segmentIndex = getSegmentIndexFromAngle(presentAngle, segmentKeys.length, rotation);

  return segmentKeys[segmentIndex] || "";
};

const getTimeCyclePresentAngle = (fractal, now = Date.now()) => {
  const elapsedMilliseconds = getTimeCycleElapsedMilliseconds(fractal, now);
  const cycleMilliseconds = getLengthSeconds(fractal) * 1000;

  if (!Number.isFinite(elapsedMilliseconds) || !Number.isFinite(cycleMilliseconds) || cycleMilliseconds <= 0) return null;

  const progress = elapsedMilliseconds / cycleMilliseconds;
  return (-Math.PI / 2) + (progress * Math.PI * 2);
};

const getSegmentIndexFromAngle = (angle, count, rotation) => {
  if (!Number.isFinite(angle) || !Number.isFinite(count) || count <= 0) return -1;

  const fullCircle = Math.PI * 2;
  const segmentAngle = fullCircle / count;
  const normalizedAngle = ((angle - rotation) % fullCircle + fullCircle) % fullCircle;

  return Math.floor(normalizedAngle / segmentAngle);
};

const getSegmentControlValue = (segmentKeys, selectedSegment) => {
  const segmentIndex = segmentKeys.findIndex((key) => String(key) === String(selectedSegment));

  return Math.max(1, segmentIndex + 1);
};

const createParameterSection = ({ hideTitle = false, parameters, title }) => {
  const section = document.createElement("article");
  const heading = document.createElement("h3");
  const list = document.createElement("dl");

  section.className = "profile-parameter-section";
  heading.textContent = title;
  list.className = "profile-parameter-list";
  parameters.forEach((parameter) => {
    const name = document.createElement("dt");
    const value = document.createElement("dd");
    const valueText = document.createElement("span");

    name.textContent = parameter.label;
    value.className = parameter.control || parameter.actions?.length
      ? "profile-parameter-value has-controls"
      : "profile-parameter-value";
    if (parameter.fullWidth) {
      name.className = "is-hidden";
      value.classList.add("is-full-width");
    }
    valueText.textContent = parameter.value;
    value.append(valueText);

    if (parameter.control?.type === "range") {
      const control = document.createElement("input");

      control.className = "profile-parameter-slider";
      control.type = "range";
      control.min = parameter.control.min;
      control.max = parameter.control.max;
      control.step = 1;
      control.value = parameter.control.value;
      control.addEventListener("input", () => {
        valueText.textContent = parameter.control.getValueLabel?.(control.value) || parameter.value;
      });
      control.addEventListener("change", () => parameter.control.onChange(control.value));
      value.append(control);
    }

    (parameter.actions || []).forEach((action) => {
      const button = document.createElement("button");

      button.className = "profile-parameter-button";
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      value.append(button);
    });
    list.append(name, value);
  });
  section.append(...(hideTitle ? [] : [heading]), list);

  return section;
};

const getCurrentParameterSections = ({
  onReturnAllToPresent,
  onSegmentChange,
  rows,
  selectedTimeSegments
}) => {
  const sections = [];
  const coreTimeFractal = getCoreTimeFractal(rows);
  const coreTimeCycleFractal = getCoreTimeCycleFractal(rows);
  const coreTimeSegmentKeys = getCoreTimeSegmentKeys();
  const coreTimeRotation = getTopCenteredLastSegmentRotation(coreTimeSegmentKeys.length);
  const now = Date.now();
  const coreTimeParameters = getRingParameterRows(coreTimeCycleFractal, {
    now,
    onSegmentChange,
    ringId: CORE_TIME_RING_ID,
    rotation: coreTimeRotation,
    segmentKeys: coreTimeSegmentKeys,
    selectedSegment: selectedTimeSegments.get(CORE_TIME_RING_ID) || DEFAULT_CORE_TIME_NUMBER
  });

  sections.push({
    parameters: [{
      actions: typeof onReturnAllToPresent === "function" ? [{
        label: "Present",
        onClick: () => {
          onReturnAllToPresent();
        }
      }] : [],
      fullWidth: true,
      label: "",
      value: ""
    }],
    hideTitle: true,
    title: "Present"
  });

  if (coreTimeParameters.length) {
    sections.push({ parameters: coreTimeParameters, title: getCoreFractalLabel(coreTimeFractal, CORE_TIME_FALLBACK_LABEL) });
  }

  return sections;
};

const getCoreTimeCycleFractal = (rows) => {
  return getCoreTimeFractal(rows);
};

const getCoreTimeFractal = (rows) => (
  rows.find((row) => (
    row.sourceType === "jaycee"
    && getDisplayValue(row.type).toLowerCase() === LORE_TYPE_VALUE
  )) || null
);

const getCoreMapFractal = (rows) => (
  getRowsForType(rows, GOD_TYPE_VALUE)
    .find((row) => row.sourceType === "jaycee") || null
);

const getCoreFractalLabel = (fractal, fallback) => getDisplayValue(fractal?.label) || fallback;

const hasPresentSpaceStart = (fractal) => (
  getDisplayValue(fractal?.type).toLowerCase() === GOD_TYPE_VALUE
  && isPresentReference(fractal?.start_at)
);

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
    window.location.href = `/src/html/jaycee-${encodeURIComponent(username)}.html`;
  });
  label.append(text, select);

  return label;
};

const createEmptyGameSettings = () => ({
  primary_distance: "",
  primary_fractal: "",
  primary_time: ""
});

const createGameForm = (settings) => ({
  primary_distance: getDisplayValue(settings?.primary_distance),
  primary_fractal: getDisplayValue(settings?.primary_fractal),
  primary_time: getDisplayValue(settings?.primary_time)
});

const getGamePayload = (form) => ({
  primary_distance: Number.isFinite(Number(form?.primary_distance)) && getDisplayValue(form?.primary_distance)
    ? Number(form.primary_distance)
    : null,
  primary_fractal: getDisplayValue(form?.primary_fractal) || null,
  primary_time: Number.isFinite(Number(form?.primary_time)) && getDisplayValue(form?.primary_time)
    ? Number(form.primary_time)
    : null
});

const createPrimaryFractalPanel = ({
  dynamicFractals,
  gameForm,
  onFieldChange,
  onSave,
  onSelect,
  saveDisabled,
  saveStatus
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const selectedFractalId = getDisplayValue(gameForm?.primary_fractal);
  const selectedFractal = dynamicFractals.find((fractal) => String(fractal.id) === String(selectedFractalId)) || null;
  const fields = [
    { key: "label", label: "Label", type: "text", value: getDisplayValue(selectedFractal?.label), disabled: true },
    { key: "primary_time", label: "Time", type: "number", value: getDisplayValue(gameForm?.primary_time) },
    { key: "primary_distance", label: "Distance", type: "number", value: getDisplayValue(gameForm?.primary_distance) }
  ];
  const select = document.createElement("select");
  const emptyOption = document.createElement("option");
  const saveButton = document.createElement("button");
  const statusText = document.createElement("p");

  section.className = "profile-resonance-column profile-primary-fractal-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Primary Fractal";
  content.className = "profile-primary-fractal-content";
  select.className = "profile-primary-fractal-select";
  select.value = "";
  emptyOption.value = "";
  emptyOption.textContent = "Choose a primary fractal";
  select.replaceChildren(emptyOption, ...dynamicFractals.map((fractal) => {
    const option = document.createElement("option");

    option.value = fractal.id;
    option.textContent = getDisplayValue(fractal.label) || "Untitled fractal";

    return option;
  }));
  select.value = selectedFractal ? selectedFractal.id : "";
  select.addEventListener("change", () => onSelect(select.value));
  content.append(select);

  fields.forEach((field) => {
    const label = document.createElement("label");
    const labelText = document.createElement("span");
    const input = document.createElement("input");

    label.className = "profile-primary-fractal-field";
    labelText.textContent = field.label;
    input.type = field.type;
    input.value = field.value;
    input.disabled = Boolean(field.disabled);
    if (field.type === "number") {
      input.step = "any";
      input.inputMode = "decimal";
    }
    input.addEventListener("input", () => {
      if (field.disabled) return;
      onFieldChange(field.key, input.value);
    });
    label.append(labelText, input);
    content.append(label);
  });
  saveButton.className = "profile-primary-fractal-save";
  saveButton.type = "button";
  saveButton.textContent = "Save";
  saveButton.disabled = saveDisabled;
  saveButton.addEventListener("click", onSave);
  content.append(saveButton);
  if (saveStatus) {
    statusText.className = "profile-primary-fractal-status";
    statusText.textContent = saveStatus;
    content.append(statusText);
  }

  section.append(heading, content);

  return section;
};

const createProfileCoreState = ({
  avatarImage,
  hasUserProfile,
  ringBackgroundImage,
  rows,
  selectedSpaceNumber,
  selectedTimeSegments,
  showPresent
}) => {
  const coreTimeSegmentKeys = getCoreTimeSegmentKeys();
  const coreTimeSegmentColors = getCoreTimeRingSegmentColors();
  const hasRingBackground = Boolean(ringBackgroundImage);
  const now = Date.now();
  const coreTimeFractal = getCoreTimeFractal(rows);
  const coreTimeCycleFractal = getCoreTimeCycleFractal(rows);
  const coreTimePresentMarkerAngle = showPresent ? getTimeCyclePresentAngle(coreTimeCycleFractal, now) : null;
  const coreTimeRotation = getTopCenteredLastSegmentRotation(coreTimeSegmentKeys.length);
  const coreTimeActiveSegmentIndex = getActiveSegmentIndex(
    coreTimeSegmentKeys,
    selectedTimeSegments.get(CORE_TIME_RING_ID) || DEFAULT_CORE_TIME_NUMBER
  );
  const rings = [
    {
      id: CORE_TIME_RING_ID,
      activeSegmentIndex: coreTimeActiveSegmentIndex,
      count: coreTimeSegmentKeys.length,
      backgroundImage: ringBackgroundImage,
      backgroundImageAlpha: 0.9,
      fillAlpha: !hasRingBackground && coreTimeSegmentColors ? PROFILE_RING_FILL_ALPHA : 0,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      label: getCoreFractalLabel(coreTimeFractal, CORE_TIME_FALLBACK_LABEL),
      labels: getEmptyLabels(coreTimeSegmentKeys.length),
      presentMarkerAngle: coreTimePresentMarkerAngle,
      rotation: coreTimeRotation,
      segmentColors: hasRingBackground ? null : coreTimeSegmentColors,
      segmentKeys: coreTimeSegmentKeys,
      showBorders: true,
      showDividers: true,
      styledSegmentIndices: !hasRingBackground && coreTimeSegmentColors
        ? coreTimeSegmentKeys.map((_, index) => index)
        : [coreTimeActiveSegmentIndex],
      tone: "accent"
    }
  ];

  return {
    ...createJayceeState({
      coreSquareLabels: getEmptyLabels(JAYCEE_ORDER.length),
      rings
    }),
    activeSquareNumber: selectedSpaceNumber,
    metrics: PROFILE_CORE_METRICS,
    squareBorderAlpha: 0.46,
    squareFillAlpha: hasUserProfile ? undefined : PROFILE_RING_FILL_ALPHA,
    squareCellBorderAlpha: 0.34,
    squareBackgroundImage: avatarImage
  };
};

export const initJayceePage = async () => {
  const shell = document.querySelector("[data-profile-shell]");
  const canvas = document.querySelector("[data-profile-canvas]");
  const status = document.querySelector("[data-profile-status]");
  const list = document.querySelector("[data-profile-resonances]");
  const publicUsername = getDisplayValue(shell?.dataset.profileUsername);
  const pageMode = getDisplayValue(shell?.dataset.profileMode) || (publicUsername ? "public" : "profile");
  const isCorePage = pageMode === "core";
  const isPresentPage = pageMode === "present";
  const isEditableProfilePage = pageMode === "profile" && !publicUsername;
  const hasUserProfile = Boolean(publicUsername) || isEditableProfilePage;
  const showPresent = !isCorePage;

  if (!shell || !canvas || !status || !list) return;

  let rows = [];
  let dynamicFractals = [];
  let publicProfiles = [];
  let avatarImage = null;
  let ringBackgroundImage = null;
  let coreState = null;
  let currentProfile = null;
  let gameForm = createEmptyGameSettings();
  let gameSaveStatus = "";
  let gameSaveStatusTimer = null;
  let gameSettings = null;
  let isGameSaving = false;
  let supabaseClient = null;
  let themeSettings = getThemeSettingsFromProfile(null);
  let selectedSpaceNumber = DEFAULT_SELECTED_NUMBER;
  let currentTimeTimer = null;
  let profileViewCacheKey = "";
  let presentPosition = DEFAULT_PRESENT_POSITION;
  const selectedTimeSegments = new Map([[CORE_TIME_RING_ID, String(DEFAULT_CORE_TIME_NUMBER)]]);

  const applyPresentSpacePosition = () => {
    const resolveSpaceStart = (fractal) => (
      hasPresentSpaceStart(fractal)
        ? { ...fractal, start_at: presentPosition }
        : fractal
    );

    rows = rows.map(resolveSpaceStart);
  };

  const requestPresentPosition = () => {
    if (!isEditableProfilePage || !navigator.geolocation) {
      presentPosition = DEFAULT_PRESENT_POSITION;
      applyPresentSpacePosition();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        presentPosition = formatBrowserPosition(position);
        applyPresentSpacePosition();
        syncProfileView();
      },
      () => {
        presentPosition = DEFAULT_PRESENT_POSITION;
        applyPresentSpacePosition();
        syncProfileView();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30 * 1000,
        timeout: 8 * 1000
      }
    );
  };

  const stopCurrentTimeClock = () => {
    if (!currentTimeTimer) return;

    window.clearInterval(currentTimeTimer);
    currentTimeTimer = null;
  };

  const updateCurrentTimeClock = () => {
    scheduleRenderCore();
    renderResonances();
    renderCoreParameters();
  };

  const startCurrentTimeClock = () => {
    updateCurrentTimeClock();

    if (currentTimeTimer) return;
    currentTimeTimer = window.setInterval(updateCurrentTimeClock, PROFILE_CLOCK_REFRESH_MS);
  };

  const restoreProfileViewCache = (cacheKey) => {
    const cache = loadProfileViewCache(cacheKey);

    if (!cache) return;

    if (Number.isFinite(Number(cache.selectedSpaceNumber))) {
      selectedSpaceNumber = Number(cache.selectedSpaceNumber);
    }

    if (cache.selectedTimeSegments && typeof cache.selectedTimeSegments === "object") {
      Object.entries(cache.selectedTimeSegments).forEach(([key, value]) => {
        const segment = getDisplayValue(value);

        if (key === CORE_TIME_RING_ID && segment) {
          selectedTimeSegments.set(key, segment);
        }
      });
    }

    syncCoreSquareWithCoreTimeSegment();
  };

  const saveProfileViewState = () => {
    saveProfileViewCache(profileViewCacheKey, {
      selectedSpaceNumber,
      selectedTimeSegments: Object.fromEntries(selectedTimeSegments)
    });
  };

  const syncCoreSquareWithCoreTimeSegment = () => {
    const coreTimeSegment = Number(selectedTimeSegments.get(CORE_TIME_RING_ID));

    if (JAYCEE_ORDER.includes(coreTimeSegment)) {
      selectedSpaceNumber = coreTimeSegment;
    }
  };

  const setTimeSegmentSelection = (ringId, segmentKey) => {
    selectedTimeSegments.set(ringId, String(segmentKey));

    if (ringId === CORE_TIME_RING_ID) {
      syncCoreSquareWithCoreTimeSegment();
    }
  };

  const setDefaultTimeSelectionsToPresent = () => {
    const coreTimeSegmentKeys = getCoreTimeSegmentKeys();
    const coreTimePresentSegment = getPresentSegmentKey(
      getCoreTimeCycleFractal(rows),
      coreTimeSegmentKeys,
      getTopCenteredLastSegmentRotation(coreTimeSegmentKeys.length)
    );

    if (coreTimePresentSegment) {
      selectedTimeSegments.set(CORE_TIME_RING_ID, coreTimePresentSegment);
      syncCoreSquareWithCoreTimeSegment();
    }

  };

  const setPrimaryFractalSelection = (fractalId) => {
    gameForm = {
      ...gameForm,
      primary_fractal: getDisplayValue(fractalId)
    };
    gameSaveStatus = "Unsaved changes";
    renderResonances();
  };

  const saveGameSettings = async () => {
    if (!supabaseClient || !currentProfile || isGameSaving) return;

    if (gameSaveStatusTimer) {
      window.clearTimeout(gameSaveStatusTimer);
      gameSaveStatusTimer = null;
    }
    isGameSaving = true;
    gameSaveStatus = "Saving...";
    renderResonances();

    try {
      const updatedSettings = await upsertUserGameSettings(
        supabaseClient,
        currentProfile,
        getGamePayload(gameForm)
      );

      gameSettings = updatedSettings || { ...gameSettings, ...getGamePayload(gameForm), user_id: currentProfile.id };
      gameForm = createGameForm(gameSettings);
      gameSaveStatus = "Saved";
      isGameSaving = false;
      renderResonances();
      gameSaveStatusTimer = window.setTimeout(() => {
        gameSaveStatus = "";
        gameSaveStatusTimer = null;
        renderResonances();
      }, 1600);
    } catch (error) {
      console.error("Game settings could not be updated", error);
      gameSaveStatus = "Could not save";
      isGameSaving = false;
      renderResonances();
      status.textContent = error?.message || "Game settings could not be updated.";
    }
  };

  const updatePrimaryFractalField = (field, value) => {
    gameForm = {
      ...gameForm,
      [field]: getDisplayValue(value)
    };
    gameSaveStatus = "Unsaved changes";
  };

  const renderPresentControls = () => {
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
    startCurrentTimeClock();

    if (!existingControls) {
      corePanel.insertBefore(controls, canvas);
    }
  };

  const renderResonances = () => {
    const coreGodGroups = getGroupsWithSelectedResonanceValue(
      getResonanceGroupsForNumber(
        getRowsForType(rows, GOD_TYPE_VALUE),
        selectedSpaceNumber
      ).filter((group) => group.sourceType === "jaycee"),
      selectedSpaceNumber
    );
    const selectedCoreTimeNumber = selectedTimeSegments.get(CORE_TIME_RING_ID) || DEFAULT_CORE_TIME_NUMBER;
    const coreLoreGroups = getGroupsWithSelectedResonanceValue(
      getResonanceGroupsForNumber(
        getRowsForType(rows, LORE_TYPE_VALUE),
        selectedCoreTimeNumber
      ).filter((group) => group.sourceType === "jaycee"),
      selectedCoreTimeNumber
    );
    const columns = [
      {
        groups: coreGodGroups,
        meta: "",
        selectedNumber: selectedSpaceNumber,
        title: "God"
      },
      {
        groups: coreLoreGroups,
        meta: "",
        selectedNumber: selectedCoreTimeNumber,
        title: "Lore"
      }
    ].filter((column) => column.groups.length);

    status.textContent = "";
    list.replaceChildren(
      ...columns.map((column) => createResonanceColumn(
        column.title,
        column.groups,
        column.selectedNumber,
        column.meta
      )),
      ...(isEditableProfilePage ? [
        createPrimaryFractalPanel({
          dynamicFractals,
          gameForm,
          onFieldChange: updatePrimaryFractalField,
          onSave: saveGameSettings,
          onSelect: setPrimaryFractalSelection,
          saveDisabled: !currentProfile || isGameSaving,
          saveStatus: gameSaveStatus
        })
      ] : [])
    );
  };

  const renderCoreParameters = () => {
    const corePanel = canvas.closest(".jaycee-profile-core");
    const existingPanel = corePanel?.querySelector("[data-profile-parameters]");

    if (!corePanel) {
      existingPanel?.remove();
      return;
    }

    const sections = getCurrentParameterSections({
      onReturnAllToPresent: () => {
        setDefaultTimeSelectionsToPresent();
        syncProfileView();
      },
      onSegmentChange: (ringId, segmentKey) => {
        setTimeSegmentSelection(ringId, segmentKey);
        syncProfileView();
      },
      rows,
      selectedTimeSegments
    });

    if (!sections.length) {
      existingPanel?.remove();
      return;
    }

    const panel = existingPanel || document.createElement("section");
    const heading = document.createElement("h2");
    const content = document.createElement("div");

    panel.className = "profile-parameter-panel";
    panel.dataset.profileParameters = "";
    heading.textContent = "Parameters";
    content.className = "profile-parameter-panel-content";
    content.replaceChildren(
      ...sections.map((section) => createParameterSection(section))
    );
    panel.replaceChildren(heading, content);

    if (!existingPanel) {
      canvas.insertAdjacentElement("afterend", panel);
    }
  };

  const renderCore = () => {
    coreState = createProfileCoreState({
      avatarImage,
      hasUserProfile,
      ringBackgroundImage,
      rows,
      selectedSpaceNumber,
      selectedTimeSegments,
      showPresent
    });
    drawJaycee(canvas, coreState);
  };

  const scheduleRenderCore = () => {
    window.requestAnimationFrame(renderCore);
  };

  const syncProfileView = () => {
    saveProfileViewState();
    renderCore();
    renderCoreParameters();
    renderResonances();
  };

  const handleCanvasClick = (event) => {
    const hit = getJayceeHit(canvas, coreState, event.clientX, event.clientY);

    if (!hit) return;

    if (hit.type === "square") {
      selectedSpaceNumber = hit.number;
      setTimeSegmentSelection(CORE_TIME_RING_ID, hit.number);
    } else if (hit.type === "ring" && hit.ringId) {
      setTimeSegmentSelection(hit.ringId, hit.segmentKey);
    }

    syncProfileView();
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
      status.textContent = "Profile not found.";
      return;
    }

    shell.hidden = false;
    themeSettings = getThemeSettingsFromProfile(profile);
    if (isEditableProfilePage) {
      applyProfileTheme(themeSettings);
    }

    const jayceeRows = await fetchJayceeResonances(client);
    const profileRows = !hasUserProfile
      ? []
      : await fetchUserResonances(client, profile, { publicOnly: Boolean(publicUsername) });
    dynamicFractals = isEditableProfilePage ? await fetchUserDynamicFractals(client, profile) : [];
    gameSettings = isEditableProfilePage ? await fetchUserGameSettings(client, profile) : null;
    gameForm = createGameForm(gameSettings);

    profileViewCacheKey = getProfileViewCacheKey({ pageMode, profile, publicUsername });
    rows = [...jayceeRows, ...profileRows];
    if (rows.some(hasPresentSpaceStart)) {
      requestPresentPosition();
    }
    restoreProfileViewCache(profileViewCacheKey);
    if (
      gameForm.primary_fractal
      && !dynamicFractals.some((fractal) => String(fractal.id) === String(gameForm.primary_fractal))
    ) {
      gameSettings = { ...gameSettings, primary_fractal: null };
      gameForm = { ...gameForm, primary_fractal: "" };
    }
    setDefaultTimeSelectionsToPresent();
    publicProfiles = isPresentPage ? await fetchPublicProfiles(client) : [];
    avatarImage = !hasUserProfile ? null : await loadOptionalImage(await getAvatarImageUrl(client, profile));
    ringBackgroundImage = !hasUserProfile ? null : await loadOptionalImage(await getBackgroundImageUrl(client, profile));
    renderCore();
    canvas.addEventListener("click", handleCanvasClick);
    const resizeObserver = new ResizeObserver(scheduleRenderCore);

    resizeObserver.observe(canvas);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener("resize", scheduleRenderCore);
    window.addEventListener("load", scheduleRenderCore);
    renderPresentControls();
    renderCoreParameters();
    renderResonances();
    scheduleRenderCore();
  } catch (error) {
    console.error("Jaycee profile load failed", error);
    shell.hidden = false;
    status.textContent = error?.message || "Profile could not be loaded.";
  }
};

export const startJayceePage = () => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initJayceePage, { once: true });
  } else {
    initJayceePage();
  }
};
