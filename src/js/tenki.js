import { tenkiLayout, tenkiLoShuTable } from "./data/tenkiData.js";

// Rotate the rendered circle by one segment so 9 sits at the top while the stored order remains unchanged.
const CIRCLE_ROTATION_DEGREES = 40;

const createLookup = (columns) => {
  const lookup = new Map();

  columns.numbers.forEach((number, index) => {
    lookup.set(number, {
      sefirot: columns.sefirot[index],
      number,
      direction: columns.directions[index],
      baguaElement: columns.baguaElements[index],
      baguaColorName: columns.baguaColorNames[index],
      baguaColor: columns.baguaColors[index],
      planet: columns.planets[index],
      trigram: columns.trigrams[index],
      trigramBinary: columns.trigramBinary[index],
      trigramBinaryValue: columns.trigramBinaryValue[index],
      trigramBinaryIncrementedValue: columns.trigramBinaryIncrementedValue[index],
      trigramPinyin: columns.trigramPinyin[index],
      trigramHanzi: columns.trigramHanzi[index]
    });
  });

  return lookup;
};

const renderCircle = (root, layout, lookup) => {
  const ring = root.querySelector("[data-time-ring]");
  if (!ring) return;

  ring.replaceChildren();

  layout.displayOrder.forEach((number, index) => {
    const item = lookup.get(number);
    if (!item) return;

    const labelAngle = index * 40 + CIRCLE_ROTATION_DEGREES;
    const segment = document.createElement("div");
    segment.className = "time-segment";
    segment.style.setProperty("--label-angle", `${labelAngle}deg`);
    segment.style.setProperty("--divider-angle", `${labelAngle - 20}deg`);
    segment.style.setProperty("--segment-color", item.baguaColor);

    const label = document.createElement("span");
    label.textContent = item.planet.split(" ").at(-1);
    label.title = `${item.sefirot} - ${item.direction} - ${item.baguaElement} - ${item.trigramPinyin}`;

    segment.append(label);
    ring.append(segment);
  });
};

const renderSquare = (root, layout, lookup) => {
  const grid = root.querySelector("[data-space-grid]");
  if (!grid) return;

  grid.replaceChildren();

  layout.displayOrder.forEach((number) => {
    const item = lookup.get(number);
    const cell = document.createElement("div");
    cell.className = "space-cell";

    if (item) {
      cell.style.setProperty("--cell-color", item.baguaColor);
      cell.textContent = item.trigramHanzi;
      cell.title = `${item.sefirot} - ${item.direction} - ${item.baguaElement} - ${item.trigram || "Center"} ${item.trigramPinyin}`.trim();
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
