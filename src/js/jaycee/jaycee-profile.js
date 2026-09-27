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
const AVATAR_BUCKET = "avatars";
const CODE_COLUMNS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DEFAULT_SELECTED_NUMBER = 5;
const DEFAULT_SUN_TIME_NUMBER = 9;
const JAYCEE_RESONANCE_SOURCE = "Jaycee";
const SIGNED_IMAGE_URL_DURATION_SECONDS = 60 * 60;
const PROFILE_CORE_METRICS = {
  ringMaxRadialShare: 0.3,
  ringWidthMax: 24,
  ringWidthMin: 10,
  ringWidthRatio: 0.052
};
const PROFILE_RING_ACTIVE_FILL_ALPHA = 0.09;
const PROFILE_RING_FILL_ALPHA = 0.035;

const getDisplayValue = (value) => (
  value === null || value === undefined ? "" : String(value).trim()
);
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

const setText = (element, value) => {
  if (element) element.textContent = value;
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

const createResonanceColumn = (title, groups, selectedNumber) => {
  const column = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");

  column.className = "profile-resonance-column";
  heading.className = "profile-resonance-column-title";
  heading.textContent = title;
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
    .select(`id, label, user_id, dimension, ${CODE_COLUMNS.map((column) => `"${column}"`).join(", ")}`)
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
    .select(`id, label, user_id, dimension, ${CODE_COLUMNS.map((column) => `"${column}"`).join(", ")}`)
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

const fetchDynamicTimeRings = async (client) => {
  const { data: fractals, error: fractalsError } = await client
    .from(JAYCEE_DYNAMIC_FRACTALS_TABLE)
    .select("id, label, description, dimension, created_at")
    .eq("dimension", TIME_DIMENSION_VALUE)
    .order("created_at", { ascending: true });

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
    .select("id, username, avatar_path")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

const fetchProfileByUsername = async (client, username) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username, avatar_path")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

const getAvatarImageUrl = async (client, profile) => {
  const image = getDisplayValue(profile?.avatar_path);

  if (!profile?.id || !image) return "";

  const rawStoragePath = getStoragePathFromImage(image, AVATAR_BUCKET)
    .replace(/^\/+/, "")
    .replace(/\+/g, " ");
  const storagePath = rawStoragePath.includes("/")
    ? rawStoragePath
    : `${profile.id}/${rawStoragePath}`;

  if (!storagePath) return "";

  const { data, error } = await client.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(storagePath, SIGNED_IMAGE_URL_DURATION_SECONDS);

  if (error) throw error;

  return data?.signedUrl || "";
};

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
        rows: getResonancesForNumber(groupedRows, selectedNumber),
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
      description: element.description,
      label: ring.label || "Time",
      resonanceValue: getDisplayValue(element.value),
      sourceName: JAYCEE_RESONANCE_SOURCE,
      sourceType: "jaycee"
    }];
  }).filter((row) => row.resonanceValue || getDisplayValue(row.description))
);

const getTimeResonanceGroups = (rows, selectedTimeSegments, dynamicRings) => {
  const sunNumber = selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER;
  const staticTimeGroups = getResonanceGroupsForNumber(
    getRowsForDimensionColumn(rows, TIME_DIMENSION_VALUE),
    sunNumber
  );
  const dynamicRows = getDynamicTimeRows(dynamicRings, selectedTimeSegments);
  const dynamicGroups = dynamicRows.length
    ? [{
      rows: dynamicRows,
      sourceName: JAYCEE_RESONANCE_SOURCE,
      sourceType: "jaycee"
    }]
    : [];

  return mergeResonanceGroups([...staticTimeGroups, ...dynamicGroups]);
};

const getEmptyLabels = (count) => Array.from({ length: count }, () => "");

const getActiveSegmentIndex = (segmentKeys, selectedSegment) => (
  Math.max(0, segmentKeys.findIndex((key) => String(key) === String(selectedSegment)))
);

const createProfileCoreState = ({ avatarImage, dynamicRings, selectedSpaceNumber, selectedTimeSegments }) => {
  const sunSegmentKeys = JAYCEE_ORDER.map(String);
  const rings = [
    {
      id: "sun",
      activeSegmentIndex: getActiveSegmentIndex(sunSegmentKeys, selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER),
      count: sunSegmentKeys.length,
      fillAlpha: PROFILE_RING_FILL_ALPHA,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      label: "Sun",
      labels: getEmptyLabels(sunSegmentKeys.length),
      rotation: getTopCenteredLastSegmentRotation(sunSegmentKeys.length),
      segmentKeys: sunSegmentKeys,
      showBorders: true,
      showDividers: true,
      styledSegmentIndices: sunSegmentKeys.map((_, index) => index),
      tone: "accent"
    },
    ...dynamicRings.map((ring) => ({
      activeSegmentIndex: getActiveSegmentIndex(ring.segmentKeys, selectedTimeSegments.get(ring.id) || ring.defaultSegment),
      count: ring.segmentKeys.length,
      fillAlpha: PROFILE_RING_FILL_ALPHA,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      id: ring.id,
      label: ring.label,
      labels: getEmptyLabels(ring.segmentKeys.length),
      rotation: getTopCenteredSegmentRotation(ring.segmentKeys.length, 0),
      segmentKeys: ring.segmentKeys,
      showBorders: true,
      showDividers: true,
      styledSegmentIndices: ring.segmentKeys.map((_, index) => index),
      tone: "soft"
    }))
  ];

  return {
    ...createJayceeState({
      coreSquareLabels: getEmptyLabels(JAYCEE_ORDER.length),
      rings
    }),
    activeSquareNumber: selectedSpaceNumber,
    metrics: PROFILE_CORE_METRICS,
    squareBorderAlpha: 0.46,
    squareCellBorderAlpha: 0.34,
    squareBackgroundImage: avatarImage
  };
};

const initJayceeProfile = async () => {
  const shell = document.querySelector("[data-profile-shell]");
  const canvas = document.querySelector("[data-profile-canvas]");
  const status = document.querySelector("[data-profile-status]");
  const list = document.querySelector("[data-profile-resonances]");
  const selectedNumberEl = document.querySelector("[data-selected-number]");
  const selectedLabelEl = document.querySelector("[data-selected-label]");
  const publicUsername = getDisplayValue(shell?.dataset.profileUsername);

  if (!shell || !canvas || !status || !list) return;

  let rows = [];
  let dynamicRings = [];
  let avatarImage = null;
  let coreState = null;
  let selectedSpaceNumber = DEFAULT_SELECTED_NUMBER;
  let selectedDraftKey = null;
  let draftPreviewMode = "closed";
  let draftPreviewTimer = null;
  const selectedTimeSegments = new Map([["sun", String(DEFAULT_SUN_TIME_NUMBER)]]);

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

  const renderResonances = () => {
    const showDrafts = !publicUsername;
    const spaceGroups = getResonanceGroupsForNumber(
      getRowsForDimensionColumn(rows, SPACE_DIMENSION_VALUE),
      selectedSpaceNumber
    );
    const selectedSunNumber = selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER;
    const timeGroups = getTimeResonanceGroups(rows, selectedTimeSegments, dynamicRings);
    const draftRows = showDrafts ? getDraftRows(rows) : [];
    const columns = [
      { groups: spaceGroups, selectedNumber: selectedSpaceNumber, title: "Space" },
      { groups: timeGroups, selectedNumber: selectedSunNumber, title: "Time" }
    ].filter((column) => column.groups.length);
    const resonanceCount = columns.reduce(
      (total, column) => total + column.groups.reduce((groupTotal, group) => groupTotal + group.rows.length, 0),
      0
    ) + draftRows.length;

    setText(selectedNumberEl, selectedSpaceNumber);
    setText(selectedLabelEl, "");
    list.replaceChildren(
      ...columns.map((column) => createResonanceColumn(column.title, column.groups, column.selectedNumber)),
      ...(draftRows.length ? [createDraftsSection(draftRows, selectedDraftKey, draftPreviewMode, toggleDraft)] : [])
    );

    if (resonanceCount) {
      status.textContent = `${resonanceCount} resonance${resonanceCount === 1 ? "" : "s"} for the current selection.`;
    } else {
      status.textContent = "No resonances yet for the current selection.";
    }
  };

  const renderCore = () => {
    coreState = createProfileCoreState({
      avatarImage,
      dynamicRings,
      selectedSpaceNumber,
      selectedTimeSegments
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

    if (!publicUsername && !user) {
      redirectToLogin();
      return;
    }

    const profile = publicUsername
      ? await fetchProfileByUsername(client, publicUsername)
      : await fetchProfileByUserId(client, user.id);

    if (!profile) {
      shell.hidden = false;
      status.textContent = "Profile not found.";
      return;
    }

    shell.hidden = false;
    const jayceeRows = await fetchJayceeResonances(client);
    const profileRows = await fetchUserResonances(client, profile, { publicOnly: Boolean(publicUsername) });

    rows = [...jayceeRows, ...profileRows];
    dynamicRings = await fetchDynamicTimeRings(client);
    dynamicRings.forEach((ring) => {
      if (!selectedTimeSegments.has(ring.id)) {
        selectedTimeSegments.set(ring.id, ring.defaultSegment);
      }
    });
    avatarImage = await loadImage(await getAvatarImageUrl(client, profile));
    renderCore();
    canvas.addEventListener("click", handleCanvasClick);
    const resizeObserver = new ResizeObserver(scheduleRenderCore);

    resizeObserver.observe(canvas);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener("resize", scheduleRenderCore);
    window.addEventListener("load", scheduleRenderCore);
    renderResonances();
    scheduleRenderCore();
  } catch (error) {
    console.error("Jaycee profile load failed", error);
    shell.hidden = false;
    status.textContent = error?.message || "Profile could not be loaded.";
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initJayceeProfile, { once: true });
} else {
  initJayceeProfile();
}
