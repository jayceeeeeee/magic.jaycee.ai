import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee,
  getJayceeHit,
  getTopCenteredLastSegmentRotation,
  getTopCenteredSegmentRotation
} from "./jaycee-core.js";
import {
  DEFAULT_SELECTED_NUMBER,
  DEFAULT_SUN_TIME_NUMBER,
  PROFILE_TABLE,
  SPACE_DIMENSION_VALUE,
  TIME_DIMENSION_VALUE,
  fetchDynamicSpaceSquares,
  fetchDynamicTimeRings,
  fetchJayceeResonances,
  fetchProfileByUserId,
  fetchProfileByUsername,
  fetchPublicProfiles,
  fetchUserResonances,
  getAvatarImageUrl,
  getBackgroundImageUrl,
  getDisplayValue,
  getDynamicRingKey,
  getDynamicSquareKey,
  getFractalImageUrl,
  getFractalKey,
  getProfileColorValue,
  getThemeSettingsFromProfile,
  hasTimeCycle,
  isHexColor,
  loadOptionalImage,
  parseBrowserGregorianDate
} from "./jaycee-data.js";
import {
  DRAFT_PREVIEW_ANIMATION_MS,
  createDraftsSection,
  createResonanceColumn,
  filterUserGroupsByFractal,
  getDraftRows,
  getDynamicSpaceChoiceRows,
  getDynamicTimeChoiceRows,
  getResonanceGroupsForNumber,
  getRowsForDimensionColumn,
  getSelectedDynamicMapSquare,
  getSelectedDynamicPortalRing,
  getTimeResonanceGroups
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

const getSunRingSegmentColors = () => {
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

const getColorInputValue = (color, fallback) => (
  getProfileColorValue(color) || fallback
);

const setThemeStatus = (statusEl, message, isError = false) => {
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.dataset.state = isError ? "error" : "ready";
};

const initProfileThemeControls = ({ client, onThemeChange, profile, themeSettings }) => {
  const controls = document.querySelector("[data-profile-theme-controls]");
  const themeSelect = document.querySelector("[data-profile-theme-select]");
  const primaryInput = document.querySelector("[data-profile-primary-color]");
  const secondaryInput = document.querySelector("[data-profile-secondary-color]");
  const status = document.querySelector("[data-profile-theme-status]");
  let saveTimer = null;

  if (!controls || !themeSelect || !primaryInput || !secondaryInput || !profile?.id) return;

  controls.hidden = false;
  controls.closest(".jaycee-profile-core")?.classList.add("has-theme-controls");
  themeSelect.replaceChildren(...(window.JayceeThemes?.options || [{ label: "Aurora", value: "aurora" }]).map((theme) => {
    const option = document.createElement("option");

    option.value = theme.value;
    option.textContent = theme.label;

    return option;
  }));
  themeSelect.value = themeSettings.theme;
  primaryInput.value = getColorInputValue(themeSettings.primary_color, "#53dcc6");
  secondaryInput.value = getColorInputValue(themeSettings.secondary_color, "#ffd56b");

  const saveTheme = async () => {
    setThemeStatus(status, "Saving...");

    const { error } = await client
      .from(PROFILE_TABLE)
      .update({
        primary_color: themeSettings.primary_color || null,
        secondary_color: themeSettings.secondary_color || null,
        theme: themeSettings.theme
      })
      .eq("id", profile.id);

    if (error) throw error;

    setThemeStatus(status, "Saved.");
    window.JayceeAuth?.refreshHeader?.();
  };

  const scheduleSave = () => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
    }

    saveTimer = window.setTimeout(async () => {
      saveTimer = null;

      try {
        await saveTheme();
      } catch (error) {
        console.error("Jaycee profile theme save failed", error);
        setThemeStatus(status, error?.message || "Theme could not be saved.", true);
      }
    }, 320);
  };

  const syncTheme = ({ includeColors = false } = {}) => {
    themeSettings.theme = window.JayceeThemes?.normalizeTheme?.(themeSelect.value) || "aurora";
    if (includeColors) {
      themeSettings.primary_color = getProfileColorValue(primaryInput.value);
      themeSettings.secondary_color = getProfileColorValue(secondaryInput.value);
    }
    applyProfileTheme(themeSettings);
    onThemeChange();
    scheduleSave();
  };

  themeSelect.addEventListener("change", syncTheme);
  primaryInput.addEventListener("input", () => syncTheme({ includeColors: true }));
  secondaryInput.addEventListener("input", () => syncTheme({ includeColors: true }));
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

const getGeometricSegmentNumberFromIndex = (segmentIndex, count, topSegmentIndex = 0) => {
  if (!Number.isFinite(segmentIndex) || !Number.isFinite(count) || count <= 0) return 1;

  return ((segmentIndex - topSegmentIndex + count) % count) + 1;
};

const getPpcmSubSegmentIndex = (sunActiveSegmentIndex, sunSegmentCount) => (
  getGeometricSegmentNumberFromIndex(
    sunActiveSegmentIndex,
    sunSegmentCount,
    0
  ) - 1
);

const getDefaultMapPosition = (gridSize) => {
  const safeGridSize = Math.max(1, Number(gridSize) || 1);
  const coreSpan = safeGridSize % 2 === 0 ? 2 : 1;
  const centerStart = (safeGridSize - coreSpan) / 2;

  return (centerStart * safeGridSize) + centerStart + 1;
};

const getStaticMapSquareLabels = (row) => (
  JAYCEE_ORDER.map((number) => getDisplayValue(row[String(number)]) || String(number))
);

const getDynamicMapSquareLabels = (square) => (
  square.elements.map((element, index) => getDisplayValue(element.value) || String(index + 1))
);

const getSelectedMapSquare = ({
  dynamicSquares,
  mapSquareImages,
  rows,
  selectedMapFractalKey,
  selectedMapPosition
}) => {
  if (!selectedMapFractalKey) return { error: "", mapSquare: null };

  const dynamicSquare = getSelectedDynamicMapSquare(dynamicSquares, selectedMapFractalKey);

  if (dynamicSquare) {
    if (dynamicSquare.invalidReason) {
      return { error: dynamicSquare.invalidReason, mapSquare: null };
    }

    return {
      error: "",
      mapSquare: {
        backgroundImage: mapSquareImages.get(selectedMapFractalKey) || null,
        gridSize: dynamicSquare.gridSize,
        labels: getDynamicMapSquareLabels(dynamicSquare),
        selectedPosition: selectedMapPosition || getDefaultMapPosition(dynamicSquare.gridSize)
      }
    };
  }

  const staticSquare = rows.find((row) => (
    row.sourceType === "user" && getFractalKey(row) === selectedMapFractalKey
  ));

  if (!staticSquare) return { error: "", mapSquare: null };

  return {
    error: "",
    mapSquare: {
      backgroundImage: mapSquareImages.get(selectedMapFractalKey) || null,
      gridSize: 3,
      labels: getStaticMapSquareLabels(staticSquare),
      selectedPosition: selectedMapPosition || DEFAULT_SELECTED_NUMBER
    }
  };
};

const getSelectedMapDetails = ({ dynamicSquares, rows, selectedMapFractalKey }) => {
  if (!selectedMapFractalKey) return null;

  const dynamicSquare = getSelectedDynamicMapSquare(dynamicSquares, selectedMapFractalKey);

  if (dynamicSquare) {
    return {
      gridSize: dynamicSquare.gridSize,
      kind: "dynamic",
      square: dynamicSquare
    };
  }

  const staticSquare = rows.find((row) => (
    row.sourceType === "user" && getFractalKey(row) === selectedMapFractalKey
  ));

  return staticSquare
    ? { gridSize: 3, kind: "static", square: staticSquare }
    : null;
};

const getMapPositionForSegmentKey = (segmentKey, mapDetails) => {
  if (!mapDetails) return null;

  const number = Number(segmentKey);
  const gridSize = Number(mapDetails.gridSize) || 3;
  const maxPosition = gridSize * gridSize;

  if (!Number.isFinite(number)) return null;

  if (mapDetails.kind === "static") {
    const orderIndex = JAYCEE_ORDER.indexOf(number);

    return orderIndex >= 0 ? orderIndex + 1 : null;
  }

  return number >= 1 && number <= maxPosition ? number : null;
};

const getSegmentKeyForMapPosition = (position, mapDetails) => {
  if (!mapDetails) return "";

  const mapPosition = Number(position);
  const gridSize = Number(mapDetails.gridSize) || 3;
  const maxPosition = gridSize * gridSize;

  if (!Number.isFinite(mapPosition) || mapPosition < 1 || mapPosition > maxPosition) return "";

  return String(mapDetails.kind === "static"
    ? JAYCEE_ORDER[mapPosition - 1] || ""
    : mapPosition);
};

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

const formatDurationOffset = (secondsValue) => {
  const seconds = Number(secondsValue);

  if (!Number.isFinite(seconds) || seconds < 0) return "";

  return seconds === 0 ? "00:00:00" : formatDuration(seconds);
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

const formatArea = (metersValue) => {
  const meters = Number(metersValue);

  if (!Number.isFinite(meters) || meters <= 0) return "";

  const squareMeters = meters * meters;
  const formattedArea = squareMeters.toLocaleString(undefined, {
    maximumFractionDigits: squareMeters < 10 ? 2 : 0
  });

  return `${formattedArea} sqm`;
};

const formatGpsCoordinate = (value, positiveLabel, negativeLabel) => {
  const number = Number(value);

  if (!Number.isFinite(number)) return "";

  const direction = number >= 0 ? positiveLabel : negativeLabel;

  return `${Math.abs(number).toFixed(4)}°${direction}`;
};

const formatGpsPosition = (value) => {
  const text = getDisplayValue(value);
  const [latitude, longitude, ...rest] = text.split(",").map((part) => part.trim());

  if (!latitude || !longitude || rest.length) return text;

  const formattedLatitude = formatGpsCoordinate(latitude, "N", "S");
  const formattedLongitude = formatGpsCoordinate(longitude, "E", "W");

  return formattedLatitude && formattedLongitude
    ? `${formattedLatitude}, ${formattedLongitude}`
    : text;
};

const getRingParameterRows = (fractal, options = {}) => {
  const now = options.now || Date.now();
  const length = formatDuration(fractal?.length);
  const present = formatDuration(getTimeCycleElapsedSeconds(fractal, now));
  const segmentKeys = options.segmentKeys || [];
  const selectedSegment = options.selectedSegment || segmentKeys[0] || "";
  const selectedSegmentIndex = getSegmentControlValue(segmentKeys, selectedSegment);
  const canControlSegment = Boolean(options.ringId && segmentKeys.length > 1);
  const cycleSeconds = Number(fractal?.length);
  const segmentMeasureRows = getSegmentCycleMeasureRows({
    cycleSeconds,
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

const getSquareParameterRows = (fractal) => {
  const area = formatArea(fractal?.length);
  const gps = formatGpsPosition(fractal?.start_at);

  return [
    ...(area ? [{ label: "Surface", value: area }] : []),
    ...(gps ? [{ label: "Position", value: gps }] : [])
  ];
};

const getDynamicMapResonanceGroups = (dynamicSquares, selectedMapFractalKey, selectedMapPosition) => {
  const dynamicSquare = getSelectedDynamicMapSquare(dynamicSquares, selectedMapFractalKey);

  if (!dynamicSquare || dynamicSquare.invalidReason) return [];

  const selectedIndex = Math.max(0, Number(selectedMapPosition || getDefaultMapPosition(dynamicSquare.gridSize)) - 1);
  const selectedElement = dynamicSquare.elements[selectedIndex];
  const resonanceValue = getDisplayValue(selectedElement?.value);
  const description = getDisplayValue(selectedElement?.description);

  if (!resonanceValue && !description) return [];

  return [{
    rows: [{
      description,
      id: dynamicSquare.sourceId || dynamicSquare.id,
      label: dynamicSquare.label || "Map",
      resonanceValue,
      sourceName: dynamicSquare.sourceName || "User",
      sourceType: dynamicSquare.sourceType || "user"
    }],
    sourceName: dynamicSquare.sourceName || "User",
    sourceType: dynamicSquare.sourceType || "user"
  }];
};

const getStaticMapResonanceGroups = (rows, selectedMapFractalKey, selectedMapPosition) => {
  const staticSquare = rows.find((row) => (
    row.sourceType === "user" && getFractalKey(row) === selectedMapFractalKey
  ));

  if (!staticSquare) return [];

  const selectedNumber = JAYCEE_ORDER[selectedMapPosition - 1] || DEFAULT_SELECTED_NUMBER;
  const resonanceValue = getDisplayValue(staticSquare[String(selectedNumber)]);

  if (!resonanceValue) return [];

  return [{
    rows: [{
      ...staticSquare,
      resonanceValue
    }],
    sourceName: staticSquare.sourceName || "User",
    sourceType: staticSquare.sourceType || "user"
  }];
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

const getSunSegmentKeys = () => JAYCEE_ORDER.map(String);

const getSelectedStaticPortalRing = (rows, selectedPortalFractalKey) => {
  if (!selectedPortalFractalKey) return null;

  return getRowsForDimensionColumn(rows, TIME_DIMENSION_VALUE).find((row) => (
    row.sourceType === "user" && getFractalKey(row) === selectedPortalFractalKey
  )) || null;
};

const getTimeCycleElapsedSeconds = (fractal, now = Date.now()) => {
  if (!hasTimeCycle(fractal)) return null;

  const startAt = parseBrowserGregorianDate(fractal.start_at);
  const cycleMs = Number(fractal.length) * 1000;
  const elapsedMs = ((now - startAt) % cycleMs + cycleMs) % cycleMs;

  return elapsedMs / 1000;
};

const getPresentSegmentKey = (fractal, segmentKeys, rotation, now = Date.now()) => {
  const presentAngle = getTimeCyclePresentAngle(fractal, now);
  const segmentIndex = getSegmentIndexFromAngle(presentAngle, segmentKeys.length, rotation);

  return segmentKeys[segmentIndex] || "";
};

const getTimeCyclePresentAngle = (fractal, now = Date.now()) => {
  const elapsedSeconds = getTimeCycleElapsedSeconds(fractal, now);

  if (!Number.isFinite(elapsedSeconds)) return null;

  const progress = elapsedSeconds / Number(fractal.length);
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

const getNestedPresentMarkerAngle = ({
  parentCount,
  parentPresentAngle,
  parentRotation,
  subCount,
  subPresentAngle,
  subRotation
}) => {
  const parentIndex = getSegmentIndexFromAngle(parentPresentAngle, parentCount, parentRotation);
  const subIndex = getSegmentIndexFromAngle(subPresentAngle, subCount, subRotation);

  if (parentIndex < 0 || subIndex < 0) return null;

  const parentSegmentAngle = (Math.PI * 2) / parentCount;
  const subSegmentAngle = parentSegmentAngle / subCount;

  return parentRotation + (parentIndex * parentSegmentAngle) + ((subIndex + 0.5) * subSegmentAngle);
};

const createParameterSection = (title, parameters) => {
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
  section.append(heading, list);

  return section;
};

const getCurrentParameterSections = ({
  dynamicRings,
  dynamicSquares,
  onReturnAllToPresent,
  onSegmentChange,
  rows,
  selectedMapFractalKey,
  selectedPortalFractalKey,
  selectedTimeSegments
}) => {
  const sections = [];
  const sunCycleFractal = getSunCycleFractal(rows);
  const sunSegmentKeys = getSunSegmentKeys();
  const sunRotation = getTopCenteredLastSegmentRotation(sunSegmentKeys.length);
  const now = Date.now();
  const presentTime = formatCurrentDateTime(new Date(now)).replace(/^Present:\s*/, "");
  const sunParameters = getRingParameterRows(sunCycleFractal, {
    now,
    onSegmentChange,
    ringId: "sun",
    rotation: sunRotation,
    segmentKeys: sunSegmentKeys,
    selectedSegment: selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER
  });
  const selectedDynamicPortalRing = getSelectedDynamicPortalRing(dynamicRings, selectedPortalFractalKey);
  const selectedStaticPortalRing = getSelectedStaticPortalRing(rows, selectedPortalFractalKey);
  const selectedMapDetails = getSelectedMapDetails({ dynamicSquares, rows, selectedMapFractalKey });
  const coreSquareRows = getRowsForDimensionColumn(rows, SPACE_DIMENSION_VALUE)
    .filter((row) => row.sourceType === "jaycee");

  sections.push({
    parameters: [{
      actions: typeof onReturnAllToPresent === "function" ? [{
        label: "Now",
        onClick: onReturnAllToPresent
      }] : [],
      label: "Time",
      value: presentTime
    }],
    title: "Present"
  });

  if (sunParameters.length) {
    sections.push({ parameters: sunParameters, title: sunCycleFractal?.label || "Sun" });
  }

  if (selectedDynamicPortalRing?.segmentKeys?.length && !selectedDynamicPortalRing.invalidReason) {
    const segmentKeys = selectedDynamicPortalRing.segmentKeys.map(String);
    const parameters = getRingParameterRows(selectedDynamicPortalRing, {
      now,
      onSegmentChange,
      ringId: selectedDynamicPortalRing.id,
      rotation: getTopCenteredSegmentRotation(segmentKeys.length, 0),
      segmentKeys,
      selectedSegment: selectedTimeSegments.get(selectedDynamicPortalRing.id)
        || selectedDynamicPortalRing.defaultSegment
        || segmentKeys[0]
    });

    if (parameters.length) {
      sections.push({ parameters, title: selectedDynamicPortalRing.label || "Portal" });
    }
  }

  if (selectedStaticPortalRing) {
    const staticPortalKey = getFractalKey(selectedStaticPortalRing);
    const parameters = getRingParameterRows(selectedStaticPortalRing, {
      now,
      onSegmentChange,
      ringId: staticPortalKey,
      rotation: sunRotation,
      segmentKeys: sunSegmentKeys,
      selectedSegment: selectedTimeSegments.get(staticPortalKey)
        || getPresentSegmentKey(selectedStaticPortalRing, sunSegmentKeys, sunRotation, now)
        || sunSegmentKeys[0]
    });

    if (parameters.length) {
      sections.push({ parameters, title: selectedStaticPortalRing.label || "Portal" });
    }
  }

  coreSquareRows.forEach((square) => {
    const parameters = getSquareParameterRows(square);

    if (parameters.length) {
      sections.push({ parameters, title: square.label || "Core" });
    }
  });

  if (selectedMapDetails?.square) {
    const parameters = getSquareParameterRows(selectedMapDetails.square);

    if (parameters.length) {
      sections.push({ parameters, title: selectedMapDetails.square.label || "Map" });
    }
  }

  return sections;
};

const getSunCycleFractal = (rows) => {
  const jayceeTimeRows = rows.filter((row) => (
    row.sourceType === "jaycee"
    && getDisplayValue(row.dimension).toLowerCase() === TIME_DIMENSION_VALUE
    && hasTimeCycle(row)
  ));

  return jayceeTimeRows.find((row) => getDisplayValue(row.label).toLowerCase() === "sun")
    || jayceeTimeRows[0]
    || null;
};

const createFractalSelect = (labelText, defaultText, choices, selectedValue, onChange) => {
  const label = document.createElement("label");
  const text = document.createElement("span");
  const select = document.createElement("select");
  const defaultOption = document.createElement("option");

  label.className = "profile-fractal-select";
  text.textContent = labelText;
  defaultOption.value = "";
  defaultOption.textContent = defaultText;
  select.replaceChildren(defaultOption, ...choices.map((choice) => {
    const option = document.createElement("option");

    option.value = getFractalKey(choice);
    option.textContent = choice.label || "Untitled fractal";

    return option;
  }));
  select.value = choices.some((choice) => getFractalKey(choice) === selectedValue) ? selectedValue : "";
  select.addEventListener("change", () => onChange(select.value));
  label.append(text, select);

  return label;
};

const formatCurrentDateTime = (date = new Date()) => {
  const pad = (value, length = 2) => String(value).padStart(length, "0");

  return `Present: ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
    window.location.href = `/src/html/jaycee-${encodeURIComponent(username)}.html`;
  });
  label.append(text, select);

  return label;
};

const createProfileCoreState = ({
  avatarImage,
  dynamicRings,
  dynamicSquares,
  isCorePage,
  hasUserProfile,
  mapSquareImages,
  portalRingImages,
  ringBackgroundImage,
  rows,
  selectedMapFractalKey,
  selectedMapPosition,
  selectedPortalFractalKey,
  selectedSpaceNumber,
  selectedTimeSegments,
  showPresent
}) => {
  const sunSegmentKeys = getSunSegmentKeys();
  const sunSegmentColors = getSunRingSegmentColors();
  const hasRingBackground = Boolean(ringBackgroundImage);
  const now = Date.now();
  const sunCycleFractal = getSunCycleFractal(rows);
  const sunPresentMarkerAngle = showPresent ? getTimeCyclePresentAngle(sunCycleFractal, now) : null;
  const sunRotation = getTopCenteredLastSegmentRotation(sunSegmentKeys.length);
  const sunActiveSegmentIndex = getActiveSegmentIndex(
    sunSegmentKeys,
    selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER
  );
  const ppcmActiveSubSegmentIndex = getPpcmSubSegmentIndex(sunActiveSegmentIndex, sunSegmentKeys.length);
  const selectedDynamicPortalRing = getSelectedDynamicPortalRing(dynamicRings, selectedPortalFractalKey);
  const selectedStaticPortalRing = getSelectedStaticPortalRing(rows, selectedPortalFractalKey);
  const selectedPortalHasPpcm = Boolean(
    selectedPortalFractalKey
    && (
      (selectedDynamicPortalRing?.segmentKeys?.length && !selectedDynamicPortalRing.invalidReason)
      || selectedStaticPortalRing
    )
  );
  const selectedMapResult = getSelectedMapSquare({
    dynamicSquares,
    mapSquareImages,
    rows,
    selectedMapFractalKey,
    selectedMapPosition
  });
  const mapSquare = selectedMapResult.mapSquare && selectedPortalHasPpcm
    ? {
      ...selectedMapResult.mapSquare,
      selectedSubCellNumber: ppcmActiveSubSegmentIndex + 1
    }
    : selectedMapResult.mapSquare;
  const rings = [
    {
      id: "sun",
      activeSegmentIndex: sunActiveSegmentIndex,
      count: sunSegmentKeys.length,
      backgroundImage: ringBackgroundImage,
      backgroundImageAlpha: 0.9,
      fillAlpha: !hasRingBackground && sunSegmentColors ? PROFILE_RING_FILL_ALPHA : 0,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      label: "Sun",
      labels: getEmptyLabels(sunSegmentKeys.length),
      presentMarkerAngle: sunPresentMarkerAngle,
      rotation: sunRotation,
      segmentColors: hasRingBackground ? null : sunSegmentColors,
      segmentKeys: sunSegmentKeys,
      showBorders: true,
      showDividers: true,
      styledSegmentIndices: !hasRingBackground && sunSegmentColors
        ? sunSegmentKeys.map((_, index) => index)
        : [sunActiveSegmentIndex],
      tone: "accent"
    }
  ];

  if (selectedDynamicPortalRing?.segmentKeys?.length && !selectedDynamicPortalRing.invalidReason) {
    const segmentKeys = selectedDynamicPortalRing.segmentKeys.map(String);
    const selectedSegment = selectedTimeSegments.get(selectedDynamicPortalRing.id)
      || selectedDynamicPortalRing.defaultSegment
      || segmentKeys[0];
    const activeSegmentIndex = getActiveSegmentIndex(segmentKeys, selectedSegment);
    const portalPresentMarkerAngle = showPresent ? getTimeCyclePresentAngle(selectedDynamicPortalRing, now) : null;
    const portalRotation = getTopCenteredSegmentRotation(segmentKeys.length, 0);
    const ppcmPresentMarkerAngle = showPresent
      ? getNestedPresentMarkerAngle({
        parentCount: segmentKeys.length,
        parentPresentAngle: portalPresentMarkerAngle,
        parentRotation: portalRotation,
        subCount: sunSegmentKeys.length,
        subPresentAngle: sunPresentMarkerAngle,
        subRotation: sunRotation
      })
      : null;

    rings.push({
      id: selectedDynamicPortalRing.id,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      activeSegmentIndex,
      backgroundImage: portalRingImages.get(selectedPortalFractalKey) || null,
      backgroundImageAlpha: 0.9,
      count: segmentKeys.length,
      fillAlpha: 0,
      label: selectedDynamicPortalRing.label || "Portal",
      labels: getEmptyLabels(segmentKeys.length),
      presentMarkerAngle: portalPresentMarkerAngle,
      rotation: portalRotation,
      secondaryPresentMarkerAngle: ppcmPresentMarkerAngle,
      secondaryPresentMarkerColor: "rgba(255, 215, 77, 0.98)",
      segmentKeys,
      showBorders: true,
      showDividers: true,
      subActiveParentSegmentIndex: activeSegmentIndex,
      subActiveSegmentIndex: ppcmActiveSubSegmentIndex,
      styledSegmentIndices: [activeSegmentIndex],
      subSegmentCount: sunSegmentKeys.length,
      tone: "accent"
    });
  }

  if (selectedStaticPortalRing) {
    const segmentKeys = sunSegmentKeys;
    const staticPortalKey = getFractalKey(selectedStaticPortalRing);
    const selectedSegment = selectedTimeSegments.get(staticPortalKey)
      || getPresentSegmentKey(selectedStaticPortalRing, segmentKeys, sunRotation, now)
      || segmentKeys[0];
    const activeSegmentIndex = getActiveSegmentIndex(segmentKeys, selectedSegment);
    const portalPresentMarkerAngle = showPresent ? getTimeCyclePresentAngle(selectedStaticPortalRing, now) : null;
    const ppcmPresentMarkerAngle = showPresent
      ? getNestedPresentMarkerAngle({
        parentCount: segmentKeys.length,
        parentPresentAngle: portalPresentMarkerAngle,
        parentRotation: sunRotation,
        subCount: sunSegmentKeys.length,
        subPresentAngle: sunPresentMarkerAngle,
        subRotation: sunRotation
      })
      : null;

    rings.push({
      id: staticPortalKey,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      activeSegmentIndex,
      backgroundImage: portalRingImages.get(selectedPortalFractalKey) || null,
      backgroundImageAlpha: 0.9,
      count: segmentKeys.length,
      fillAlpha: 0,
      label: selectedStaticPortalRing.label || "Portal",
      labels: getEmptyLabels(segmentKeys.length),
      presentMarkerAngle: portalPresentMarkerAngle,
      rotation: sunRotation,
      secondaryPresentMarkerAngle: ppcmPresentMarkerAngle,
      secondaryPresentMarkerColor: "rgba(255, 215, 77, 0.98)",
      segmentKeys,
      showBorders: true,
      showDividers: true,
      subActiveParentSegmentIndex: activeSegmentIndex,
      subActiveSegmentIndex: ppcmActiveSubSegmentIndex,
      styledSegmentIndices: [activeSegmentIndex],
      subSegmentCount: sunSegmentKeys.length,
      tone: "accent"
    });
  }

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
    mapSquare,
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
  let dynamicRings = [];
  let dynamicSquares = [];
  let publicProfiles = [];
  let avatarImage = null;
  let ringBackgroundImage = null;
  let mapSquareImages = new Map();
  let portalRingImages = new Map();
  let coreState = null;
  let themeSettings = getThemeSettingsFromProfile(null);
  let selectedSpaceNumber = DEFAULT_SELECTED_NUMBER;
  let selectedMapPosition = DEFAULT_SELECTED_NUMBER;
  let selectedMapFractalKey = "";
  let selectedPortalFractalKey = "";
  let selectedDraftKey = null;
  let draftPreviewMode = "closed";
  let draftPreviewTimer = null;
  let currentTimeTimer = null;
  let profileViewCacheKey = "";
  const selectedTimeSegments = new Map([["sun", String(DEFAULT_SUN_TIME_NUMBER)]]);

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

  const scheduleDraftPreviewMode = (mode, callback) => {
    if (draftPreviewTimer) {
      window.clearTimeout(draftPreviewTimer);
    }

    draftPreviewTimer = window.setTimeout(() => {
      draftPreviewMode = mode;
      draftPreviewTimer = null;
      if (callback) callback();
      renderResonances();
    }, DRAFT_PREVIEW_ANIMATION_MS);
  };

  const toggleDraft = (draftKey) => {
    const sameDraft = selectedDraftKey === draftKey;
    const hadOpenDraft = Boolean(selectedDraftKey) && draftPreviewMode !== "closing";

    if (sameDraft) {
      draftPreviewMode = "closing";
      renderResonances();
      scheduleDraftPreviewMode("closed", () => {
        selectedDraftKey = null;
      });
      return;
    }

    if (draftPreviewTimer) {
      window.clearTimeout(draftPreviewTimer);
      draftPreviewTimer = null;
    }

    selectedDraftKey = draftKey;
    draftPreviewMode = hadOpenDraft ? "static" : "opening";
    renderResonances();

    if (!hadOpenDraft) {
      scheduleDraftPreviewMode("static");
    }
  };

  const resetSelectedMapPosition = () => {
    const selectedMapDetails = getSelectedMapDetails({ dynamicSquares, rows, selectedMapFractalKey });

    selectedMapPosition = getDefaultMapPosition(selectedMapDetails?.gridSize || 3);
  };

  const restoreProfileViewCache = (cacheKey) => {
    const cache = loadProfileViewCache(cacheKey);

    if (!cache) return;

    if (Number.isFinite(Number(cache.selectedSpaceNumber))) {
      selectedSpaceNumber = Number(cache.selectedSpaceNumber);
    }
    if (Number.isFinite(Number(cache.selectedMapPosition))) {
      selectedMapPosition = Number(cache.selectedMapPosition);
    }
    selectedMapFractalKey = getDisplayValue(cache.selectedMapFractalKey);
    selectedPortalFractalKey = getDisplayValue(cache.selectedPortalFractalKey);

    if (cache.selectedTimeSegments && typeof cache.selectedTimeSegments === "object") {
      Object.entries(cache.selectedTimeSegments).forEach(([key, value]) => {
        const segment = getDisplayValue(value);

        if (key && segment) {
          selectedTimeSegments.set(key, segment);
        }
      });
    }

    syncCoreSquareWithSunSegment();
    syncMapPositionWithSelectedPortal();
  };

  const saveProfileViewState = () => {
    saveProfileViewCache(profileViewCacheKey, {
      selectedMapFractalKey,
      selectedMapPosition,
      selectedPortalFractalKey,
      selectedSpaceNumber,
      selectedTimeSegments: Object.fromEntries(selectedTimeSegments)
    });
  };

  const syncCoreSquareWithSunSegment = () => {
    const sunSegment = Number(selectedTimeSegments.get("sun"));

    if (JAYCEE_ORDER.includes(sunSegment)) {
      selectedSpaceNumber = sunSegment;
    }
  };

  const getSelectedPortalSelection = () => {
    const selectedDynamicPortalRing = getSelectedDynamicPortalRing(dynamicRings, selectedPortalFractalKey);

    if (selectedDynamicPortalRing?.segmentKeys?.length && !selectedDynamicPortalRing.invalidReason) {
      const segmentKeys = selectedDynamicPortalRing.segmentKeys.map(String);

      return {
        ringId: selectedDynamicPortalRing.id,
        segmentKey: selectedTimeSegments.get(selectedDynamicPortalRing.id)
          || selectedDynamicPortalRing.defaultSegment
          || segmentKeys[0],
        segmentKeys
      };
    }

    const selectedStaticPortalRing = getSelectedStaticPortalRing(rows, selectedPortalFractalKey);

    if (selectedStaticPortalRing) {
      const segmentKeys = getSunSegmentKeys();
      const ringId = getFractalKey(selectedStaticPortalRing);

      return {
        ringId,
        segmentKey: selectedTimeSegments.get(ringId)
          || getPresentSegmentKey(
            selectedStaticPortalRing,
            segmentKeys,
            getTopCenteredLastSegmentRotation(segmentKeys.length)
          )
          || segmentKeys[0],
        segmentKeys
      };
    }

    return null;
  };

  const syncMapPositionWithPortalSegment = (ringId, segmentKey) => {
    const selectedPortal = getSelectedPortalSelection();

    if (!selectedPortal || selectedPortal.ringId !== ringId) return;

    const selectedMapDetails = getSelectedMapDetails({ dynamicSquares, rows, selectedMapFractalKey });
    const mapPosition = getMapPositionForSegmentKey(segmentKey, selectedMapDetails);

    if (mapPosition) {
      selectedMapPosition = mapPosition;
    }
  };

  const syncMapPositionWithSelectedPortal = () => {
    const selectedPortal = getSelectedPortalSelection();

    if (selectedPortal) {
      syncMapPositionWithPortalSegment(selectedPortal.ringId, selectedPortal.segmentKey);
    }
  };

  const syncSelectedPortalWithMapPosition = (mapPosition) => {
    const selectedPortal = getSelectedPortalSelection();
    const selectedMapDetails = getSelectedMapDetails({ dynamicSquares, rows, selectedMapFractalKey });
    const segmentKey = getSegmentKeyForMapPosition(mapPosition, selectedMapDetails);

    if (selectedPortal?.ringId && selectedPortal.segmentKeys.includes(segmentKey)) {
      selectedTimeSegments.set(selectedPortal.ringId, segmentKey);
    }
  };

  const setTimeSegmentSelection = (ringId, segmentKey) => {
    selectedTimeSegments.set(ringId, String(segmentKey));

    if (ringId === "sun") {
      syncCoreSquareWithSunSegment();
    } else {
      syncMapPositionWithPortalSegment(ringId, segmentKey);
    }
  };

  const setDefaultTimeSelectionsToPresent = () => {
    const sunSegmentKeys = getSunSegmentKeys();
    const sunPresentSegment = getPresentSegmentKey(
      getSunCycleFractal(rows),
      sunSegmentKeys,
      getTopCenteredLastSegmentRotation(sunSegmentKeys.length)
    );

    if (sunPresentSegment) {
      selectedTimeSegments.set("sun", sunPresentSegment);
      syncCoreSquareWithSunSegment();
    }

    dynamicRings.forEach((ring) => {
      const segmentKeys = ring.segmentKeys?.map(String) || [];
      const presentSegment = getPresentSegmentKey(
        ring,
        segmentKeys,
        getTopCenteredSegmentRotation(segmentKeys.length, 0)
      );

      selectedTimeSegments.set(ring.id, presentSegment || ring.defaultSegment || segmentKeys[0] || "1");
    });

    const selectedStaticPortalRing = getSelectedStaticPortalRing(rows, selectedPortalFractalKey);

    if (selectedStaticPortalRing) {
      const segmentKeys = getSunSegmentKeys();
      const ringId = getFractalKey(selectedStaticPortalRing);
      const presentSegment = getPresentSegmentKey(
        selectedStaticPortalRing,
        segmentKeys,
        getTopCenteredLastSegmentRotation(segmentKeys.length)
      );

      selectedTimeSegments.set(ringId, presentSegment || segmentKeys[0]);
    }

    syncMapPositionWithSelectedPortal();
  };

  const loadMapSquareImages = async (client) => {
    const imageEntries = await Promise.all([
      ...getRowsForDimensionColumn(rows, SPACE_DIMENSION_VALUE)
        .filter((row) => row.sourceType === "user" && getDisplayValue(row.image))
        .map(async (row) => [
          getFractalKey(row),
          await loadOptionalImage(await getFractalImageUrl(client, row))
        ]),
      ...dynamicSquares
        .filter((square) => square.sourceType === "user" && getDisplayValue(square.image))
        .map(async (square) => [
          getDynamicSquareKey(square),
          await loadOptionalImage(await getFractalImageUrl(client, square))
        ])
    ]);

    mapSquareImages = new Map(imageEntries.filter(([, image]) => image));
  };

  const loadPortalRingImages = async (client) => {
    const imageEntries = await Promise.all([
      ...getRowsForDimensionColumn(rows, TIME_DIMENSION_VALUE)
        .filter((row) => row.sourceType === "user" && getDisplayValue(row.image))
        .map(async (row) => [
          getFractalKey(row),
          await loadOptionalImage(await getFractalImageUrl(client, row))
        ]),
      ...dynamicRings
        .filter((ring) => ring.sourceType === "user" && getDisplayValue(ring.image))
        .map(async (ring) => [
          getDynamicRingKey(ring),
          await loadOptionalImage(await getFractalImageUrl(client, ring))
        ])
    ]);

    portalRingImages = new Map(imageEntries.filter(([, image]) => image));
  };

  const renderPresentControls = () => {
    const corePanel = canvas.closest(".jaycee-profile-core");
    const existingControls = corePanel?.querySelector("[data-profile-present-controls]");

    if (!corePanel || !isPresentPage) {
      existingControls?.remove();
      corePanel?.classList.remove("has-fractal-selectors");
      return;
    }

    const controls = existingControls || document.createElement("div");

    corePanel.classList.add("has-fractal-selectors");
    controls.className = "profile-fractal-selectors";
    controls.dataset.profilePresentControls = "";
    controls.replaceChildren(createGameSelect(publicProfiles));
    startCurrentTimeClock();

    if (!existingControls) {
      corePanel.insertBefore(controls, canvas);
    }
  };

  const renderFractalSelectors = () => {
    const corePanel = canvas.closest(".jaycee-profile-core");
    const existingSelectors = corePanel?.querySelector("[data-profile-fractal-selectors]");
    const mapChoices = getRowsForDimensionColumn(rows, SPACE_DIMENSION_VALUE)
      .filter((row) => row.sourceType === "user");
    const mapSelectorChoices = [
      ...mapChoices,
      ...getDynamicSpaceChoiceRows(dynamicSquares)
    ];
    const portalChoices = [
      ...getRowsForDimensionColumn(rows, TIME_DIMENSION_VALUE).filter((row) => row.sourceType === "user"),
      ...getDynamicTimeChoiceRows(dynamicRings)
    ];

    if (!corePanel || isCorePage || isPresentPage) {
      existingSelectors?.remove();
      return;
    }

    corePanel.classList.add("has-fractal-selectors");

    const selectors = existingSelectors || document.createElement("div");

    selectors.className = "profile-fractal-selectors";
    selectors.dataset.profileFractalSelectors = "";
    selectors.replaceChildren(
      createFractalSelect("Choose a map", "God", mapSelectorChoices, selectedMapFractalKey, (value) => {
        selectedMapFractalKey = value;
        resetSelectedMapPosition();
        syncMapPositionWithSelectedPortal();
        syncProfileView();
      }),
      createFractalSelect("Enter a portal", "Sun", portalChoices, selectedPortalFractalKey, (value) => {
        selectedPortalFractalKey = value;
        syncMapPositionWithSelectedPortal();
        syncProfileView();
      })
    );
    startCurrentTimeClock();

    if (!existingSelectors) {
      corePanel.insertBefore(selectors, canvas);
    }
  };

  const renderResonances = () => {
    const selectedMapResult = getSelectedMapSquare({
      dynamicSquares,
      mapSquareImages,
      rows,
      selectedMapFractalKey,
      selectedMapPosition
    });
    const showDrafts = isEditableProfilePage;
    const selectedMapDetails = getSelectedMapDetails({ dynamicSquares, rows, selectedMapFractalKey });
    const selectedStaticPortalRing = getSelectedStaticPortalRing(rows, selectedPortalFractalKey);
    const selectedDynamicPortalRing = getSelectedDynamicPortalRing(dynamicRings, selectedPortalFractalKey);
    const selectedPortalError = selectedDynamicPortalRing?.invalidReason || "";
    const coreSpaceGroups = getGroupsWithSelectedResonanceValue(
      getResonanceGroupsForNumber(
        getRowsForDimensionColumn(rows, SPACE_DIMENSION_VALUE),
        selectedSpaceNumber
      ).filter((group) => group.sourceType === "jaycee"),
      selectedSpaceNumber
    );
    const selectedStaticMapNumber = selectedMapDetails?.kind === "static"
      ? JAYCEE_ORDER[selectedMapPosition - 1] || DEFAULT_SELECTED_NUMBER
      : selectedSpaceNumber;
    const rawSelectedMapGroups = selectedMapDetails?.kind === "dynamic"
      ? getDynamicMapResonanceGroups(dynamicSquares, selectedMapFractalKey, selectedMapPosition)
      : selectedMapDetails?.kind === "static"
        ? getStaticMapResonanceGroups(rows, selectedMapFractalKey, selectedMapPosition)
        : filterUserGroupsByFractal(
          getResonanceGroupsForNumber(
            getRowsForDimensionColumn(rows, SPACE_DIMENSION_VALUE),
            selectedStaticMapNumber
          ),
          selectedMapFractalKey
        );
    const selectedMapGroups = selectedMapDetails
      ? rawSelectedMapGroups
      : getGroupsWithSelectedResonanceValue(rawSelectedMapGroups, selectedStaticMapNumber);
    const spaceGroups = selectedMapDetails
      ? [...coreSpaceGroups, ...selectedMapGroups]
      : selectedMapGroups;
    const selectedSunNumber = selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER;
    const staticPortalSegmentKeys = getSunSegmentKeys();
    const staticPortalRotation = getTopCenteredLastSegmentRotation(staticPortalSegmentKeys.length);
    const selectedStaticPortalNumber = selectedStaticPortalRing
      ? selectedTimeSegments.get(getFractalKey(selectedStaticPortalRing))
        || getPresentSegmentKey(selectedStaticPortalRing, staticPortalSegmentKeys, staticPortalRotation)
        || selectedSunNumber
      : selectedSunNumber;
    const timeGroups = selectedStaticPortalRing
      ? [
        ...getGroupsWithSelectedResonanceValue(
          getResonanceGroupsForNumber(
            getRowsForDimensionColumn(rows, TIME_DIMENSION_VALUE),
            selectedSunNumber
          ).filter((group) => group.sourceType === "jaycee"),
          selectedSunNumber
        ),
        ...getGroupsWithSelectedResonanceValue(
          filterUserGroupsByFractal(
            getResonanceGroupsForNumber(
              getRowsForDimensionColumn(rows, TIME_DIMENSION_VALUE),
              selectedStaticPortalNumber
            ).filter((group) => group.sourceType === "user"),
            selectedPortalFractalKey
          ),
          selectedStaticPortalNumber
        )
      ]
      : filterUserGroupsByFractal(
        getTimeResonanceGroups(rows, selectedTimeSegments, dynamicRings),
        selectedPortalFractalKey
      );
    const draftRows = showDrafts ? getDraftRows(rows) : [];
    const columns = [
      {
        groups: spaceGroups,
        meta: "",
        selectedNumber: selectedSpaceNumber,
        title: "Map"
      },
      { groups: timeGroups, meta: "", selectedNumber: selectedStaticPortalNumber, title: "Portal" }
    ].filter((column) => column.groups.length);

    status.textContent = [selectedMapResult.error, selectedPortalError].filter(Boolean).join(" ");
    list.replaceChildren(
      ...columns.map((column) => createResonanceColumn(
        column.title,
        column.groups,
        column.selectedNumber,
        column.meta
      )),
      ...(draftRows.length ? [createDraftsSection(draftRows, selectedDraftKey, draftPreviewMode, toggleDraft)] : [])
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
      dynamicRings,
      dynamicSquares,
      onReturnAllToPresent: () => {
        setDefaultTimeSelectionsToPresent();
        syncProfileView();
      },
      onSegmentChange: (ringId, segmentKey) => {
        setTimeSegmentSelection(ringId, segmentKey);
        syncProfileView();
      },
      rows,
      selectedMapFractalKey,
      selectedPortalFractalKey,
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
      ...sections.map((section) => createParameterSection(section.title, section.parameters))
    );
    panel.replaceChildren(heading, content);

    if (!existingPanel) {
      canvas.insertAdjacentElement("afterend", panel);
    }
  };

  const renderCore = () => {
    coreState = createProfileCoreState({
      avatarImage,
      dynamicRings,
      dynamicSquares,
      hasUserProfile,
      isCorePage,
      mapSquareImages,
      portalRingImages,
      ringBackgroundImage,
      rows,
      selectedMapFractalKey,
      selectedMapPosition,
      selectedPortalFractalKey,
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
      setTimeSegmentSelection("sun", hit.number);
    } else if (hit.type === "ring" && hit.ringId) {
      setTimeSegmentSelection(hit.ringId, hit.segmentKey);
    } else if (hit.type === "map-square") {
      selectedMapPosition = hit.position;
      syncSelectedPortalWithMapPosition(hit.position);
    }

    syncProfileView();
  };

  const handleCanvasDoubleClick = (event) => {
    const hit = getJayceeHit(canvas, coreState, event.clientX, event.clientY);

    if (hit?.type !== "square") return;

    const selectedMapDetails = getSelectedMapDetails({ dynamicSquares, rows, selectedMapFractalKey });

    if (!selectedMapDetails) return;

    selectedMapPosition = getDefaultMapPosition(selectedMapDetails.gridSize);
    syncSelectedPortalWithMapPosition(selectedMapPosition);
    syncProfileView();
  };

  try {
    const client = await window.JayceeAuth.getSupabaseClient();
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

    if (hasUserProfile && !profile) {
      shell.hidden = false;
      status.textContent = "Profile not found.";
      return;
    }

    shell.hidden = false;
    themeSettings = getThemeSettingsFromProfile(profile);
    if (isEditableProfilePage) {
      applyProfileTheme(themeSettings);
      initProfileThemeControls({
        client,
        onThemeChange: renderCore,
        profile,
        themeSettings
      });
    }

    const jayceeRows = await fetchJayceeResonances(client);
    const profileRows = !hasUserProfile
      ? []
      : await fetchUserResonances(client, profile, { publicOnly: Boolean(publicUsername) });

    profileViewCacheKey = getProfileViewCacheKey({ pageMode, profile, publicUsername });
    rows = [...jayceeRows, ...profileRows];
    dynamicRings = await fetchDynamicTimeRings(client, profile);
    dynamicSquares = await fetchDynamicSpaceSquares(client, profile);
    await loadPortalRingImages(client);
    await loadMapSquareImages(client);
    restoreProfileViewCache(profileViewCacheKey);
    setDefaultTimeSelectionsToPresent();
    publicProfiles = isPresentPage ? await fetchPublicProfiles(client) : [];
    avatarImage = !hasUserProfile ? null : await loadOptionalImage(await getAvatarImageUrl(client, profile));
    ringBackgroundImage = !hasUserProfile ? null : await loadOptionalImage(await getBackgroundImageUrl(client, profile));
    renderCore();
    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener("dblclick", handleCanvasDoubleClick);
    const resizeObserver = new ResizeObserver(scheduleRenderCore);

    resizeObserver.observe(canvas);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener("resize", scheduleRenderCore);
    window.addEventListener("load", scheduleRenderCore);
    renderPresentControls();
    renderFractalSelectors();
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
