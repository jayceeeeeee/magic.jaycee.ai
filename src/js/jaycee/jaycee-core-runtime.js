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
  getTimeResonanceGroups,
  getTimeSelectionMeta
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

const getSegmentKeys = (count) => (
  Array.from({ length: count }, (_, index) => String(index + 1))
);

const getStaticMapSquareLabels = (row) => (
  JAYCEE_ORDER.map((number) => getDisplayValue(row[String(number)]) || String(number))
);

const getDynamicMapSquareLabels = (square) => (
  square.elements.map((element) => getDisplayValue(element.value) || String(element.position))
);

const getSelectedMapSquare = ({ dynamicSquares, rows, selectedMapFractalKey }) => {
  if (!selectedMapFractalKey) return { error: "", mapSquare: null };

  const dynamicSquare = getSelectedDynamicMapSquare(dynamicSquares, selectedMapFractalKey);

  if (dynamicSquare) {
    if (dynamicSquare.invalidReason) {
      return { error: dynamicSquare.invalidReason, mapSquare: null };
    }

    return {
      error: "",
      mapSquare: {
        gridSize: dynamicSquare.gridSize,
        labels: getDynamicMapSquareLabels(dynamicSquare)
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
      gridSize: 3,
      labels: getStaticMapSquareLabels(staticSquare)
    }
  };
};

const getTimeCycleElapsedSeconds = (fractal, now = Date.now()) => {
  if (!hasTimeCycle(fractal)) return null;

  const startAt = parseBrowserGregorianDate(fractal.start_at);
  const cycleMs = Number(fractal.length) * 1000;
  const elapsedMs = ((now - startAt) % cycleMs + cycleMs) % cycleMs;

  return elapsedMs / 1000;
};

const getTimeCyclePresentAngle = (fractal, now = Date.now()) => {
  const elapsedSeconds = getTimeCycleElapsedSeconds(fractal, now);

  if (!Number.isFinite(elapsedSeconds)) return null;

  const progress = elapsedSeconds / Number(fractal.length);
  return (-Math.PI / 2) + (progress * Math.PI * 2);
};

const getGeometricSegmentNumberFromIndex = (segmentIndex, count, topSegmentIndex = 0) => {
  if (!Number.isFinite(segmentIndex) || !Number.isFinite(count) || count <= 0) return 1;

  return ((segmentIndex - topSegmentIndex + count) % count) + 1;
};

const getGeometricSegmentNumberFromAngle = (angle, count) => {
  if (!Number.isFinite(angle) || !Number.isFinite(count) || count <= 0) return null;

  const fullCircle = Math.PI * 2;
  const rotation = getTopCenteredSegmentRotation(count, 0);
  const segmentAngle = fullCircle / count;
  const normalizedAngle = ((angle - rotation) % fullCircle + fullCircle) % fullCircle;

  return Math.floor(normalizedAngle / segmentAngle) + 1;
};

const getCenteredSegmentAngle = (segmentIndex, count, rotation) => {
  if (!Number.isFinite(segmentIndex) || segmentIndex < 0) return null;

  return rotation + ((segmentIndex + 0.5) * ((Math.PI * 2) / count));
};

const getFasterCycleFirst = (first, second) => (
  Number(first.length) <= Number(second.length) ? [first, second] : [second, first]
);

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

const createCurrentTimeElement = () => {
  const clock = document.createElement("p");

  clock.className = "profile-current-time";
  clock.dataset.profileCurrentTime = "";
  clock.textContent = formatCurrentDateTime();

  return clock;
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
  ringBackgroundImage,
  rows,
  selectedMapFractalKey,
  selectedPortalFractalKey,
  selectedSpaceNumber,
  selectedTimeSegments,
  showPresent
}) => {
  const sunSegmentKeys = JAYCEE_ORDER.map(String);
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
  const selectedDynamicPortalRing = getSelectedDynamicPortalRing(dynamicRings, selectedPortalFractalKey);
  const { mapSquare } = getSelectedMapSquare({ dynamicSquares, rows, selectedMapFractalKey });
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

  if (selectedDynamicPortalRing?.segmentKeys?.length) {
    const segmentKeys = selectedDynamicPortalRing.segmentKeys.map(String);
    const selectedSegment = selectedTimeSegments.get(selectedDynamicPortalRing.id)
      || selectedDynamicPortalRing.defaultSegment
      || segmentKeys[0];
    const activeSegmentIndex = getActiveSegmentIndex(segmentKeys, selectedSegment);
    const portalPresentMarkerAngle = showPresent ? getTimeCyclePresentAngle(selectedDynamicPortalRing, now) : null;
    const portalRotation = getTopCenteredSegmentRotation(segmentKeys.length, 0);

    rings.push({
      id: selectedDynamicPortalRing.id,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      activeSegmentIndex,
      count: segmentKeys.length,
      fillAlpha: 0,
      label: selectedDynamicPortalRing.label || "Portal",
      labels: getEmptyLabels(segmentKeys.length),
      presentMarkerAngle: portalPresentMarkerAngle,
      rotation: portalRotation,
      segmentKeys,
      showBorders: true,
      showDividers: true,
      styledSegmentIndices: [activeSegmentIndex],
      tone: "accent"
    });

    const sunSelectedSegmentNumber = getGeometricSegmentNumberFromIndex(
      sunActiveSegmentIndex,
      sunSegmentKeys.length,
      sunSegmentKeys.length - 1
    );
    const portalSelectedSegmentNumber = getGeometricSegmentNumberFromIndex(
      activeSegmentIndex,
      segmentKeys.length,
      0
    );
    const [fasterSelection, slowerSelection] = getFasterCycleFirst(
      {
        length: Number(sunCycleFractal?.length),
        segmentCount: sunSegmentKeys.length,
        selectedSegmentNumber: sunSelectedSegmentNumber
      },
      {
        length: Number(selectedDynamicPortalRing?.length),
        segmentCount: segmentKeys.length,
        selectedSegmentNumber: portalSelectedSegmentNumber
      }
    );
    const ppcmSegmentCount = fasterSelection.segmentCount * slowerSelection.segmentCount;
    const ppcmSegmentKeys = getSegmentKeys(ppcmSegmentCount);
    const ppcmRotation = getTopCenteredSegmentRotation(ppcmSegmentCount, 0);
    const ppcmActiveSegmentIndex = ((slowerSelection.selectedSegmentNumber - 1) * fasterSelection.segmentCount)
      + fasterSelection.selectedSegmentNumber
      - 1;
    const sunPresentSegmentNumber = getGeometricSegmentNumberFromAngle(
      sunPresentMarkerAngle,
      sunSegmentKeys.length
    );
    const portalPresentSegmentNumber = getGeometricSegmentNumberFromAngle(
      portalPresentMarkerAngle,
      segmentKeys.length
    );
    const [fasterPresent, slowerPresent] = getFasterCycleFirst(
      {
        length: Number(sunCycleFractal?.length),
        segmentCount: sunSegmentKeys.length,
        segmentNumber: sunPresentSegmentNumber
      },
      {
        length: Number(selectedDynamicPortalRing?.length),
        segmentCount: segmentKeys.length,
        segmentNumber: portalPresentSegmentNumber
      }
    );
    const ppcmPresentSegmentIndex = fasterPresent.segmentNumber && slowerPresent.segmentNumber
      ? ((slowerPresent.segmentNumber - 1) * fasterPresent.segmentCount) + fasterPresent.segmentNumber - 1
      : -1;
    const ppcmPresentMarkerAngle = showPresent
      ? getCenteredSegmentAngle(
        ppcmPresentSegmentIndex,
        ppcmSegmentCount,
        ppcmRotation
      )
      : null;

    rings.push({
      id: `${selectedDynamicPortalRing.id}-ppcm`,
      activeSegmentIndex: ppcmActiveSegmentIndex,
      count: ppcmSegmentCount,
      fillAlpha: 0,
      interactive: false,
      label: "PPCM",
      labels: getEmptyLabels(ppcmSegmentCount),
      presentMarkerAngle: ppcmPresentMarkerAngle,
      rotation: ppcmRotation,
      segmentKeys: ppcmSegmentKeys,
      showBorders: true,
      showDividers: true,
      styledSegmentIndices: ppcmActiveSegmentIndex >= 0 ? [ppcmActiveSegmentIndex] : [],
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
  let coreState = null;
  let themeSettings = getThemeSettingsFromProfile(null);
  let selectedSpaceNumber = DEFAULT_SELECTED_NUMBER;
  let selectedMapFractalKey = "";
  let selectedPortalFractalKey = "";
  let selectedDraftKey = null;
  let draftPreviewMode = "closed";
  let draftPreviewTimer = null;
  let currentTimeTimer = null;
  const selectedTimeSegments = new Map([["sun", String(DEFAULT_SUN_TIME_NUMBER)]]);

  const stopCurrentTimeClock = () => {
    if (!currentTimeTimer) return;

    window.clearInterval(currentTimeTimer);
    currentTimeTimer = null;
  };

  const updateCurrentTimeClock = () => {
    const clock = document.querySelector("[data-profile-current-time]");

    if (clock) {
      clock.textContent = formatCurrentDateTime();
    }
    scheduleRenderCore();
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
    controls.replaceChildren(
      createGameSelect(publicProfiles),
      createCurrentTimeElement()
    );
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
      createFractalSelect("Choose a map", "Body", mapSelectorChoices, selectedMapFractalKey, (value) => {
        selectedMapFractalKey = value;
        syncProfileView();
      }),
      createFractalSelect("Enter a portal", "Sun", portalChoices, selectedPortalFractalKey, (value) => {
        selectedPortalFractalKey = value;
        syncProfileView();
      }),
      createCurrentTimeElement()
    );
    startCurrentTimeClock();

    if (!existingSelectors) {
      corePanel.insertBefore(selectors, canvas);
    }
  };

  const renderResonances = () => {
    const selectedMapResult = getSelectedMapSquare({ dynamicSquares, rows, selectedMapFractalKey });
    const showDrafts = isEditableProfilePage;
    const spaceGroups = filterUserGroupsByFractal(
      getResonanceGroupsForNumber(
        getRowsForDimensionColumn(rows, SPACE_DIMENSION_VALUE),
        selectedSpaceNumber
      ),
      selectedMapFractalKey
    );
    const selectedSunNumber = selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER;
    const timeGroups = filterUserGroupsByFractal(
      getTimeResonanceGroups(rows, selectedTimeSegments, dynamicRings),
      selectedPortalFractalKey
    );
    const draftRows = showDrafts ? getDraftRows(rows) : [];
    const columns = [
      { groups: spaceGroups, meta: `Sector ${selectedSpaceNumber}`, selectedNumber: selectedSpaceNumber, title: "Map" },
      { groups: timeGroups, meta: getTimeSelectionMeta(dynamicRings, selectedTimeSegments), selectedNumber: selectedSunNumber, title: "Portal" }
    ].filter((column) => column.groups.length);

    status.textContent = selectedMapResult.error;
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

  const renderCore = () => {
    coreState = createProfileCoreState({
      avatarImage,
      dynamicRings,
      dynamicSquares,
      hasUserProfile,
      isCorePage,
      ringBackgroundImage,
      rows,
      selectedMapFractalKey,
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
    renderCore();
    renderResonances();
  };

  const handleCanvasClick = (event) => {
    const hit = getJayceeHit(canvas, coreState, event.clientX, event.clientY);

    if (!hit) return;

    if (hit.type === "square") {
      selectedSpaceNumber = hit.number;
    } else if (hit.type === "ring" && hit.ringId) {
      selectedTimeSegments.set(hit.ringId, String(hit.segmentKey));
    }

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

    rows = [...jayceeRows, ...profileRows];
    dynamicRings = await fetchDynamicTimeRings(client, profile);
    dynamicSquares = await fetchDynamicSpaceSquares(client, profile);
    dynamicRings.forEach((ring) => {
      if (!selectedTimeSegments.has(ring.id)) {
        selectedTimeSegments.set(ring.id, ring.defaultSegment);
      }
    });
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
    renderFractalSelectors();
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
