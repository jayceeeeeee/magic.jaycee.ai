import {
  CODE_COLUMNS,
  DEFAULT_SUN_TIME_NUMBER,
  JAYCEE_RESONANCE_SOURCE,
  SPACE_DIMENSION_VALUE,
  TIME_DIMENSION_VALUE,
  getDisplayValue,
  getDynamicRingKey,
  getDynamicSquareKey,
  getFractalKey
} from "./jaycee-data.js";

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

export const createResonanceColumn = (title, groups, selectedNumber, meta = "") => {
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

export const DRAFT_PREVIEW_ANIMATION_MS = 220;

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

export const createDraftsSection = (draftRows, selectedDraftKey, draftPreviewMode, onToggleDraft) => {
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

const getResonancesForNumber = (rows, selectedNumber) => (
  rows.filter((row) => getDisplayValue(row[String(selectedNumber)]))
);

export const getRowsForDimensionColumn = (rows, columnName) => (
  rows.filter((row) => {
    const dimension = getDisplayValue(row.dimension);

    if (columnName === TIME_DIMENSION_VALUE) {
      return dimension === TIME_DIMENSION_VALUE;
    }

    return dimension === SPACE_DIMENSION_VALUE;
  })
);

export const getDraftRows = (rows) => (
  rows.filter((row) => !getDisplayValue(row.dimension))
);

export const getResonanceGroupsForNumber = (rows, selectedNumber) => (
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

export const getDynamicTimeChoiceRows = (dynamicRings) => (
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

export const getSelectedDynamicPortalRing = (dynamicRings, selectedPortalFractalKey) => {
  if (!selectedPortalFractalKey) return null;

  return dynamicRings.find((ring) => (
    ring.sourceType === "user" && getDynamicRingKey(ring) === selectedPortalFractalKey
  )) || null;
};

export const getDynamicSpaceChoiceRows = (dynamicSquares) => (
  dynamicSquares
    .filter((square) => square.sourceType === "user")
    .map((square) => ({
      id: square.sourceId || square.id,
      label: square.label || "Map",
      sourceId: square.sourceId,
      sourceName: square.sourceName,
      sourceType: square.sourceType
    }))
);

export const getSelectedDynamicMapSquare = (dynamicSquares, selectedMapFractalKey) => {
  if (!selectedMapFractalKey) return null;

  return dynamicSquares.find((square) => (
    square.sourceType === "user" && getDynamicSquareKey(square) === selectedMapFractalKey
  )) || null;
};

export const getTimeResonanceGroups = (rows, selectedTimeSegments, dynamicRings) => {
  const sunNumber = selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER;
  const staticTimeGroups = getResonanceGroupsForNumber(
    getRowsForDimensionColumn(rows, TIME_DIMENSION_VALUE),
    sunNumber
  );
  const dynamicRows = getDynamicTimeRows(dynamicRings, selectedTimeSegments);
  const dynamicGroups = dynamicRows.length ? getRowsAsSourceGroups(dynamicRows) : [];

  return mergeResonanceGroups([...staticTimeGroups, ...dynamicGroups]);
};

export const getTimeSelectionMeta = (dynamicRings, selectedTimeSegments) => {
  return `Arc ${selectedTimeSegments.get("sun") || DEFAULT_SUN_TIME_NUMBER}`;
};

export const filterUserGroupsByFractal = (groups, selectedFractalKey) => (
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
