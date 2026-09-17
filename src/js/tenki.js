import { tenkiLayout, tenkiLoShuTable } from "./data/tenkiData.js";

const normalizeDirection = (direction) => direction.toLowerCase().replace(/[^a-z]/g, "");

const createLookup = (columns) => {
  const lookup = new Map();

  columns.numbers.forEach((number, index) => {
    lookup.set(number, {
      sefirot: columns.sefirot[index],
      jayceeNumber: columns.jayceeNumbers[index],
      number,
      direction: columns.directions[index],
      baguaElement: columns.baguaElements[index]
    });
  });

  return lookup;
};

const renderCircle = (root, layout, lookup) => {
  const ring = root.querySelector("[data-time-ring]");
  if (!ring) return;

  ring.replaceChildren();

  layout.circleOrder.forEach((number, index) => {
    const item = lookup.get(number);
    if (!item) return;

    const segment = document.createElement("div");
    segment.className = "time-segment";
    segment.style.setProperty("--label-angle", `${index * 40}deg`);
    segment.style.setProperty("--divider-angle", `${index * 40 - 20}deg`);

    const label = document.createElement("span");
    label.textContent = item.baguaElement;
    label.title = `${item.sefirot} - ${item.direction}`;

    segment.append(label);
    ring.append(segment);
  });
};

const renderSquare = (root, layout, lookup) => {
  const grid = root.querySelector("[data-space-grid]");
  if (!grid) return;

  const byDirection = new Map(
    [...lookup.values()].map((item) => [normalizeDirection(item.direction), item])
  );

  grid.replaceChildren();

  layout.squareDirections.forEach((direction) => {
    const item = byDirection.get(normalizeDirection(direction));
    const cell = document.createElement("div");
    cell.className = "space-cell";

    if (item) {
      cell.textContent = item.baguaElement;
      cell.title = `${item.sefirot} - ${item.direction}`;
    }

    grid.append(cell);
  });
};

const initTenki = () => {
  const root = document.querySelector("[data-tenki]");
  if (!root) return;

  const lookup = createLookup(tenkiLoShuTable.columns);

  renderCircle(root, tenkiLayout, lookup);
  renderSquare(root, tenkiLayout, lookup);
};

initTenki();
