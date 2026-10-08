import {
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

const getResonancesForNumber = (rows, selectedNumber) => (
  rows.filter((row) => getDisplayValue(row[String(selectedNumber)]))
);

export const getRowsForType = (rows, typeName) => (
  rows.filter((row) => {
    const type = getDisplayValue(row.type).toLowerCase();

    return type === typeName;
  })
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
