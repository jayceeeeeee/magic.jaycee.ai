import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee,
  getJayceeHit,
  getTopCenteredLastSegmentRotation,
  getTopCenteredSegmentRotation
} from "./jaycee-core.js";

const JAYCEE_FRACTALS_TABLE = "jaycee_fractals";
const JAYCEE_DYNAMIC_FRACTALS_TABLE = "jaycee_dynamic_fractals";
const JAYCEE_DYNAMIC_FRACTAL_ELEMENTS_TABLE = "jaycee_dynamic_fractal_elements";
const FRACTAL_VISIBILITY_COLUMN = "visibility";
const PUBLIC_VISIBILITY_VALUE = "public";
const SPACE_DIMENSION_VALUE = "space";
const TIME_DIMENSION_VALUE = "time";
const PROFILE_TABLE = "profiles";
const USER_IMAGES_BUCKET = "users";
const CODE_COLUMNS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DEFAULT_SELECTED_NUMBER = 5;
const DEFAULT_SUN_TIME_NUMBER = 9;
const JAYCEE_RESONANCE_SOURCE = "Jaycee Core";
const TIME_CYCLE_COLUMNS = "start_at, length";
const SIGNED_IMAGE_URL_DURATION_SECONDS = 60 * 60;
const PROFILE_CORE_METRICS = {
  ringMaxRadialShare: 0.34,
  ringWidthMax: 32,
  ringWidthMin: 14,
  ringWidthRatio: 0.072
};
const PROFILE_RING_ACTIVE_FILL_ALPHA = 0.09;
const PROFILE_RING_FILL_ALPHA = 0.26;
const PROFILE_CLOCK_REFRESH_MS = 1000;

const getFractalKey = (row) => `${row.sourceType || "source"}:${row.id || row.sourceId || row.label || "fractal"}`;

const getDynamicRingKey = (ring) => getFractalKey({
  id: ring.sourceId || ring.id,
  label: ring.label,
  sourceId: ring.sourceId,
  sourceType: ring.sourceType
});

const getDisplayValue = (value) => (
  value === null || value === undefined ? "" : String(value).trim()
);

const parseBrowserGregorianDate = (value) => {
  const text = getDisplayValue(value);
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?/
  );

  if (match) {
    const [, year, month, day, hours = "0", minutes = "0", seconds = "0", milliseconds = "0"] = match;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
      Number(milliseconds.padEnd(3, "0"))
    ).getTime();
  }

  return Date.parse(text);
};

const hasTimeCycle = (fractal) => {
  const startAt = parseBrowserGregorianDate(fractal?.start_at);
  const length = Number(fractal?.length);

  return Number.isFinite(startAt) && Number.isFinite(length) && length > 0;
};

const isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(getDisplayValue(value));

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

const getProfileThemeValue = (profile) => (
  window.JayceeThemes?.normalizeTheme?.(getDisplayValue(profile?.theme)) || "aurora"
);

const getProfileColorValue = (value) => (
  isHexColor(value) ? getDisplayValue(value) : ""
);

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
  const theme = getProfileThemeValue(profile);

  document.body.dataset.theme = theme;
};

const getThemeSettingsFromProfile = (profile) => ({
  primary_color: getProfileColorValue(profile?.primary_color),
  secondary_color: getProfileColorValue(profile?.secondary_color),
  theme: getProfileThemeValue(profile)
});

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

const getStoragePathFromImage = (image, bucketName) => {
  if (/^https?:\/\//i.test(image)) {
    const url = new URL(image);
    const bucketPrefix = `/storage/v1/object/public/${bucketName}/`;
    const prefixIndex = url.pathname.indexOf(bucketPrefix);

    if (prefixIndex === -1) return "";

    return url.pathname.slice(prefixIndex + bucketPrefix.length);
  }

  return image.replace(new RegExp(`^${bucketName}/`), "");
};

const createResonanceItem = (row, selectedNumber) => {
  const item = document.createElement("article");
  const label = document.createElement("div");
  const value = document.createElement("div");
  const description = getDisplayValue(row.description);
  const resonanceValue = row.resonanceValue === undefined
    ? getDisplayValue(row[String(selectedNumber)])
    : getDisplayValue(row.resonanceValue);

  item.className = "profile-resonance-item";
  label.className = "profile-resonance-label";
  value.className = "profile-resonance-value";
  label.textContent = row.label || "Resonance";
  value.textContent = resonanceValue;
  item.append(label, value);

  if (description) {
    const descriptionEl = document.createElement("p");

    descriptionEl.className = "profile-resonance-description";
    descriptionEl.textContent = description;
    item.append(descriptionEl);
  }

  return item;
};

const createResonanceGroup = (sourceName, sourceType, resonances, selectedNumber) => {
  const group = document.createElement("section");
  const heading = document.createElement("h2");
  const items = document.createElement("div");

  group.className = "profile-resonance-group";
  group.dataset.resonanceSource = sourceType;
  heading.className = "profile-resonance-source";
  heading.textContent = sourceName;
  items.className = "profile-resonance-group-items";
  items.replaceChildren(...resonances.map((row) => createResonanceItem(row, selectedNumber)));
  group.append(heading, items);

  return group;
};

const createResonanceColumn = (title, groups, selectedNumber, meta = "") => {
  const column = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");

  column.className = "profile-resonance-column";
  heading.className = "profile-resonance-column-title";
  heading.append(document.createTextNode(title));
  if (meta) {
    const metaEl = document.createElement("span");

    metaEl.className = "profile-resonance-column-meta";
    metaEl.textContent = meta;
    heading.append(metaEl);
  }
  content.className = "profile-resonance-column-content";
  content.replaceChildren(
    ...groups.map((group) => createResonanceGroup(
      group.sourceName,
      group.sourceType,
      group.rows,
      selectedNumber
    ))
  );
  column.append(heading, content);

  return column;
};

const getDraftKey = (row) => row.id || row.label || "";

const DRAFT_PREVIEW_ANIMATION_MS = 220;

const createDraftPreview = (draft, mode) => {
  const preview = document.createElement("div");
  const table = document.createElement("div");
  const headerRow = document.createElement("div");
  const valueRow = document.createElement("div");

  preview.className = `profile-draft-preview is-${mode}`;
  table.className = "profile-draft-table";
  headerRow.className = "profile-draft-table-row profile-draft-table-head";
  valueRow.className = "profile-draft-table-row profile-draft-table-values";
  headerRow.replaceChildren(...CODE_COLUMNS.map((number) => {
    const cell = document.createElement("div");

    cell.className = "profile-draft-table-cell";
    cell.textContent = number;

    return cell;
  }));
  valueRow.replaceChildren(...CODE_COLUMNS.map((number) => {
    const cell = document.createElement("div");
    const valueEl = document.createElement("strong");

    cell.className = "profile-draft-table-cell";
    valueEl.textContent = getDisplayValue(draft[String(number)]) || "-";
    cell.append(valueEl);

    return cell;
  }));
  table.append(headerRow, valueRow);
  preview.append(table);

  return preview;
};

const createDraftsSection = (draftRows, selectedDraftKey, draftPreviewMode, onToggleDraft) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const items = document.createElement("div");
  const selectedDraft = draftRows.find((row) => getDraftKey(row) === selectedDraftKey);

  section.className = "profile-resonance-column profile-resonance-drafts";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Drafts";
  items.className = "profile-draft-list";
  items.replaceChildren(...draftRows.map((row) => {
    const item = document.createElement("button");
    const draftKey = getDraftKey(row);

    item.className = "profile-draft-item";
    item.type = "button";
    item.textContent = row.label || "Untitled fractal";
    item.setAttribute("aria-pressed", String(draftKey === selectedDraftKey));
    item.addEventListener("click", () => onToggleDraft(draftKey));

    return item;
  }));
  section.append(
    heading,
    ...(selectedDraft ? [createDraftPreview(selectedDraft, draftPreviewMode)] : []),
    items
  );

  return section;
};

const fetchJayceeResonances = async (client) => {
  const { data, error } = await client
    .from(JAYCEE_FRACTALS_TABLE)
    .select(`id, label, user_id, dimension, ${TIME_CYCLE_COLUMNS}, ${CODE_COLUMNS.map((column) => `"${column}"`).join(", ")}`)
    .is("user_id", null)
    .eq(FRACTAL_VISIBILITY_COLUMN, PUBLIC_VISIBILITY_VALUE)
    .order("label", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    sourceName: JAYCEE_RESONANCE_SOURCE,
    sourceType: "jaycee"
  }));
};

const fetchUserResonances = async (client, profile, { publicOnly = false } = {}) => {
  let query = client
    .from(JAYCEE_FRACTALS_TABLE)
    .select(`id, label, user_id, dimension, ${TIME_CYCLE_COLUMNS}, ${CODE_COLUMNS.map((column) => `"${column}"`).join(", ")}`)
    .eq("user_id", profile.id);

  if (publicOnly) {
    query = query.eq(FRACTAL_VISIBILITY_COLUMN, PUBLIC_VISIBILITY_VALUE);
  }

  const { data, error } = await query.order("label", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    sourceName: profile.username || "User",
    sourceType: "user"
  }));
};

const fetchDynamicTimeRings = async (client, profile) => {
  let query = client
    .from(JAYCEE_DYNAMIC_FRACTALS_TABLE)
    .select(`id, label, description, dimension, user_id, created_at, ${TIME_CYCLE_COLUMNS}`)
    .eq("dimension", TIME_DIMENSION_VALUE)
    .order("created_at", { ascending: true });

  if (profile?.id) {
    query = query.or(`user_id.is.null,user_id.eq.${profile.id}`);
  } else {
    query = query.is("user_id", null);
  }

  const { data: fractals, error: fractalsError } = await query;

  if (fractalsError) throw fractalsError;
  if (!fractals?.length) return [];

  const { data: elements, error: elementsError } = await client
    .from(JAYCEE_DYNAMIC_FRACTAL_ELEMENTS_TABLE)
    .select("id, fractal_id, position, value, description, created_at")
    .in("fractal_id", fractals.map((fractal) => fractal.id))
    .order("position", { ascending: true });

  if (elementsError) throw elementsError;

  return fractals
    .map((fractal) => {
      const ringElements = (elements || [])
        .filter((element) => element.fractal_id === fractal.id)
        .sort((first, second) => Number(first.position) - Number(second.position));
      const positions = ringElements
        .map((element) => Number(element.position))
        .filter((position) => Number.isFinite(position) && position > 0);

      if (!positions.length) return null;

      return {
        ...fractal,
        elements: ringElements,
        id: `dynamic-${fractal.id}`,
        sourceName: fractal.user_id ? (profile?.username || "User") : JAYCEE_RESONANCE_SOURCE,
        sourceType: fractal.user_id ? "user" : "jaycee",
        sourceId: fractal.id,
        segmentKeys: positions.map(String),
        defaultSegment: String(positions[0])
      };
    })
    .filter(Boolean);
};

const fetchProfileByUserId = async (client, userId) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username, avatar_path, background_path, theme, primary_color, secondary_color")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

const fetchProfileByUsername = async (client, username) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username, avatar_path, background_path, theme, primary_color, secondary_color")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

const fetchPublicProfiles = async (client, limit = 10) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username")
    .not("username", "is", null)
    .order("username", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data || []).filter((profile) => getDisplayValue(profile.username));
};

const getUserImageUrl = async (client, profile, path) => {
  const image = getDisplayValue(path);

  if (!profile?.id || !image) return "";

  const rawStoragePath = getStoragePathFromImage(image, USER_IMAGES_BUCKET)
    .replace(/^\/+/, "")
    .replace(/\+/g, " ");
  const storagePath = rawStoragePath.includes("/")
    ? rawStoragePath
    : `${profile.id}/${rawStoragePath}`;

  if (!storagePath) return "";

  const { data, error } = await client.storage
    .from(USER_IMAGES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_IMAGE_URL_DURATION_SECONDS);

  if (error) throw error;

  return data?.signedUrl || "";
};

const getAvatarImageUrl = async (client, profile) => (
  getUserImageUrl(client, profile, profile?.avatar_path)
);

const getBackgroundImageUrl = async (client, profile) => (
  getUserImageUrl(client, profile, profile?.background_path)
);

const loadImage = (imageUrl) => (
  new Promise((resolve, reject) => {
    if (!imageUrl) {
      resolve(null);
      return;
    }

    const image = new Image();

    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Avatar image could not be loaded.")), { once: true });
    image.src = imageUrl;
  })
);

const loadOptionalImage = async (imageUrl) => {
  try {
    return await loadImage(imageUrl);
  } catch (error) {
    console.warn("Optional Jaycee image could not be loaded", error);
    return null;
  }
};

const getResonancesForNumber = (rows, selectedNumber) => (
  rows.filter((row) => getDisplayValue(row[String(selectedNumber)]))
);

const getRowsForDimensionColumn = (rows, columnName) => (
  rows.filter((row) => {
    const dimension = getDisplayValue(row.dimension);

    if (columnName === TIME_DIMENSION_VALUE) {
      return dimension === TIME_DIMENSION_VALUE;
    }

    return dimension === SPACE_DIMENSION_VALUE;
  })
);

const getDraftRows = (rows) => (
  rows.filter((row) => !getDisplayValue(row.dimension))
);

const getResonanceGroupsForNumber = (rows, selectedNumber) => (
  [
    {
      rows: getResonancesForNumber(rows.filter((row) => row.sourceType === "jaycee"), selectedNumber),
      sourceName: JAYCEE_RESONANCE_SOURCE,
      sourceType: "jaycee"
    },
    ...Array.from(
      rows
        .filter((row) => row.sourceType !== "jaycee")
        .reduce((groups, row) => {
          const sourceName = row.sourceName || "User";

          if (!groups.has(sourceName)) groups.set(sourceName, []);
          groups.get(sourceName).push(row);

          return groups;
        }, new Map()),
      ([sourceName, groupedRows]) => ({
        rows: groupedRows,
        sourceName,
        sourceType: "user"
      })
    )
  ].filter((group) => group.rows.length)
);

const getRowsAsSourceGroups = (rows) => (
  [
    {
      rows: rows.filter((row) => row.sourceType === "jaycee"),
      sourceName: JAYCEE_RESONANCE_SOURCE,
      sourceType: "jaycee"
    },
    ...Array.from(
      rows
        .filter((row) => row.sourceType !== "jaycee")
        .reduce((groups, row) => {
          const sourceName = row.sourceName || "User";

          if (!groups.has(sourceName)) groups.set(sourceName, []);
          groups.get(sourceName).push(row);

          return groups;
        }, new Map()),
      ([sourceName, groupedRows]) => ({
        rows: groupedRows,
        sourceName,
        sourceType: "user"
      })
    )
  ].filter((group) => group.rows.length)
);

const mergeResonanceGroups = (groups) => {
  const groupedBySource = new Map();

  groups.forEach((group) => {
    const sourceName = group.sourceName || "User";
    const sourceKey = group.sourceType === "jaycee" ? "jaycee" : sourceName;

    if (!groupedBySource.has(sourceKey)) {
      groupedBySource.set(sourceKey, {
        rows: [],
        sourceName,
        sourceType: group.sourceType
      });
    }

    groupedBySource.get(sourceKey).rows.push(...group.rows);
  });

  return Array.from(groupedBySource.values()).filter((group) => group.rows.length);
};

const getDynamicTimeRows = (dynamicRings, selectedTimeSegments) => (
  dynamicRings.flatMap((ring) => {
    const selectedPosition = selectedTimeSegments.get(ring.id) || ring.defaultSegment;
    const element = ring.elements.find((entry) => String(entry.position) === String(selectedPosition));

    if (!element) return [];

    return [{
      id: ring.sourceId || ring.id,
      label: ring.label || "Time",
      resonanceValue: getDisplayValue(element.value),
      sourceName: ring.sourceName || JAYCEE_RESONANCE_SOURCE,
      sourceType: ring.sourceType || "jaycee"
    }];
  }).filter((row) => row.resonanceValue || getDisplayValue(row.description))
);

const getDynamicTimeChoiceRows = (dynamicRings) => (
  dynamicRings
    .filter((ring) => ring.sourceType === "user")
    .map((ring) => ({
      id: ring.sourceId || ring.id,
      label: ring.label || "Time",
      sourceId: ring.sourceId,
      sourceName: ring.sourceName,
      sourceType: ring.sourceType
    }))
);

const getSelectedDynamicPortalRing = (dynamicRings, selectedPortalFractalKey) => {
  if (!selectedPortalFractalKey) return null;

  return dynamicRings.find((ring) => (
    ring.sourceType === "user" && getDynamicRingKey(ring) === selectedPortalFractalKey
  )) || null;
};

const getTimeResonanceGroups = (rows, selectedTimeSegments, dynamicRings) => {
  const sunNumber = selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER;
  const staticTimeGroups = getResonanceGroupsForNumber(
    getRowsForDimensionColumn(rows, TIME_DIMENSION_VALUE),
    sunNumber
  );
  const dynamicRows = getDynamicTimeRows(dynamicRings, selectedTimeSegments);
  const dynamicGroups = dynamicRows.length ? getRowsAsSourceGroups(dynamicRows) : [];

  return mergeResonanceGroups([...staticTimeGroups, ...dynamicGroups]);
};

const getTimeSelectionMeta = (dynamicRings, selectedTimeSegments) => {
  return `Arc ${selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER}`;
};

const getEmptyLabels = (count) => Array.from({ length: count }, () => "");

const getActiveSegmentIndex = (segmentKeys, selectedSegment) => (
  Math.max(0, segmentKeys.findIndex((key) => String(key) === String(selectedSegment)))
);

const getSegmentKeys = (count) => (
  Array.from({ length: count }, (_, index) => String(index + 1))
);

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

const filterUserGroupsByFractal = (groups, selectedFractalKey) => (
  groups
    .map((group) => {
      if (group.sourceType !== "user") return group;

      return {
        ...group,
        rows: selectedFractalKey
          ? group.rows.filter((row) => getFractalKey(row) === selectedFractalKey)
          : []
      };
    })
    .filter((group) => group.rows.length)
);

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
  isCorePage,
  hasUserProfile,
  ringBackgroundImage,
  rows,
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
      createFractalSelect("Choose a map", "Body", mapChoices, selectedMapFractalKey, (value) => {
        selectedMapFractalKey = value;
        renderResonances();
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

    status.textContent = "";
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
      hasUserProfile,
      isCorePage,
      ringBackgroundImage,
      rows,
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
