// Rotate the rendered circle by one segment so 9 sits at the top while the stored order remains unchanged.
const CIRCLE_ROTATION_DEGREES = 40;
const TENKI_TABLE = "tenki_fractals";
const TENKI_ENTRY_COUNT = 9;
const TENKI_NUMBER_COLUMNS = Array.from({ length: TENKI_ENTRY_COUNT }, (_, index) => String(index + 1));
const TENKI_DISPLAY_ORDER_LABEL = "display_order";

const tenkiLineLabels = {
  sefirot: "sefirot",
  directions: "direction",
  baguaElements: "bagua_element",
  baguaColorNames: "bagua_color_name",
  baguaColors: "bagua_color",
  planets: "planet",
  trigrams: "trigram",
  trigramBinary: "trigram_binary",
  trigramBinaryValue: "trigram_binary_value",
  trigramBinaryIncrementedValue: "trigram_binary_incremented_value",
  trigramPinyin: "trigram_pinyin",
  trigramHanzi: "trigram_hanzi"
};

const createTenkiDataFromRows = (rows) => {
  const rowsByLabel = new Map(rows.map((row) => [row.label, row]));
  const getLineValues = (label) => {
    const row = rowsByLabel.get(label);

    if (!row) {
      throw new Error(`Tenki database is missing "${label}".`);
    }

    return TENKI_NUMBER_COLUMNS.map((number) => row[number] ?? "");
  };

  const columns = Object.fromEntries(
    Object.entries(tenkiLineLabels).map(([columnName, label]) => [
      columnName,
      getLineValues(label)
    ])
  );
  const displayOrder = getLineValues(TENKI_DISPLAY_ORDER_LABEL).map(Number);

  if (displayOrder.some((number) => !Number.isInteger(number))) {
    throw new Error("Tenki display order contains invalid numbers.");
  }

  return {
    layout: { displayOrder },
    table: {
      lineCount: TENKI_ENTRY_COUNT,
      columns: {
        numbers: TENKI_NUMBER_COLUMNS.map(Number),
        ...columns
      }
    }
  };
};

const loadTenkiData = async () => {
  if (!window.JayceeAuth) {
    throw new Error("Tenki database client is not available.");
  }

  const client = await window.JayceeAuth.getSupabaseClient();
  const { data, error } = await client
    .from(TENKI_TABLE)
    .select("*")
    .in("label", [TENKI_DISPLAY_ORDER_LABEL, ...Object.values(tenkiLineLabels)]);

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || data.length < Object.keys(tenkiLineLabels).length) {
    throw new Error("Tenki database returned incomplete data.");
  }

  return createTenkiDataFromRows(data);
};

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
    label.className = "planet-token";
    label.title = `${item.sefirot} - ${item.direction} - ${item.baguaElement} - ${item.trigramPinyin}`;
    label.textContent = item.planet || "";

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

const initTenki = async () => {
  const root = document.querySelector("[data-tenki]");
  if (!root) return;

  try {
    const { layout, table } = await loadTenkiData();
    const lookup = createLookup(table.columns);

    renderCircle(root, layout, lookup);
    renderSquare(root, layout, lookup);
  } catch (error) {
    const status = root.querySelector(".tenki-status-line");

    if (status) {
      status.textContent = `> ${error.message || "Unable to load Tenki database."}`;
    }

    console.error("Unable to load Tenki data from Supabase.", error);
  }
};

initTenki();
