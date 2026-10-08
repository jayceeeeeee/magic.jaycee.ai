import {
  CODE_COLUMNS,
  JAYCEE_RESONANCE_SOURCE,
  getDisplayValue
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
  const items = document.createElement("div");

  group.className = "profile-resonance-group";
  group.dataset.resonanceSource = sourceType;
  group.dataset.resonanceName = sourceName;
  items.className = "profile-resonance-group-items";
  items.replaceChildren(...resonances.map((row) => createResonanceItem(row, selectedNumber)));
  group.append(items);

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

export const getRowsForType = (rows, typeName) => (
  rows.filter((row) => {
    const type = getDisplayValue(row.type).toLowerCase();

    return type === typeName;
  })
);

export const getDraftRows = (rows) => (
  rows.filter((row) => !getDisplayValue(row.type))
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
