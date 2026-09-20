const RING_SEGMENT_COUNT = 9;
const SQUARE_GRID_SIZE = 3;
const TENKI_TABLE = "tenki_fractals";
const TENKI_ENTRY_COUNT = RING_SEGMENT_COUNT;
const TENKI_NUMBER_COLUMNS = Array.from({ length: TENKI_ENTRY_COUNT }, (_, index) => String(index + 1));
const TENKI_SELECT_COLUMNS = [
  "label",
  ...TENKI_NUMBER_COLUMNS.map((number) => `"${number}"`)
].join(",");
const TENKI_ROW_LABELS = {
  trigramHanzi: "trigram_hanzi"
};
const SQUARE_ORDER = [1, 2, 4, 3, 5, 7, 6, 8, 9];
const EMPTY_LABELS = Array.from({ length: RING_SEGMENT_COUNT }, () => "");
const getBinaryLabel = (number) => (number - 1)
  .toString(2)
  .padStart(4, "0")
  .replaceAll("1", ".")
  .replaceAll("0", " ");
const DEFAULT_TENKI_ROWS = SQUARE_ORDER.map((number) => ({
  number,
  binary: getBinaryLabel(number),
  trigram_hanzi: ""
}));
const RING_TEMPLATES = [
  {
    getLabels: (rows) => rows.map((row) => row.binary || ""),
    tone: "accent"
  },
  {
    tone: "soft"
  },
  {
    tone: "soft"
  }
].map((ring) => ({
  count: RING_SEGMENT_COUNT,
  centerLastSegmentAtTop: true,
  getLabels: () => EMPTY_LABELS,
  ...ring
}));

const getThemeColor = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const getCanvasMetrics = (canvas, ringCount) => {
  const rect = canvas.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  const center = size / 2;
  const padding = Math.max(14, size * 0.035);
  const outerRadius = center - padding;
  const squareSize = size * 0.36;
  const squareOuterRadius = (squareSize * Math.SQRT2) / 2;
  const ringWidth = (outerRadius - squareOuterRadius) / ringCount;

  return {
    center,
    outerRadius,
    ringWidth,
    squareSize,
    squareOuterRadius
  };
};

const resizeCanvas = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  return context;
};

const drawCenteredText = (context, text, x, y, size, color) => {
  context.save();
  context.fillStyle = color;
  context.font = `600 ${size}px "Share Tech Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = color;
  context.shadowBlur = 10;
  context.fillText(text, x, y);
  context.restore();
};

const getTopCenteredLastSegmentRotation = (count) => {
  const segmentAngle = (Math.PI * 2) / count;
  return -Math.PI / 2 - ((count - 0.5) * segmentAngle);
};

const drawRing = (context, metrics, options) => {
  const {
    count,
    labels,
    innerRadius,
    outerRadius,
    stroke,
    textColor,
    rotation = -Math.PI / 2
  } = options;
  const segmentAngle = (Math.PI * 2) / count;
  const labelRadius = innerRadius + ((outerRadius - innerRadius) / 2);

  context.save();
  context.lineWidth = 1;
  context.strokeStyle = stroke;

  context.beginPath();
  context.arc(metrics.center, metrics.center, innerRadius, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.arc(metrics.center, metrics.center, outerRadius, 0, Math.PI * 2);
  context.stroke();

  labels.forEach((label, index) => {
    const startAngle = rotation + (index * segmentAngle);
    const middleAngle = startAngle + (segmentAngle / 2);
    const dividerX = metrics.center + Math.cos(startAngle) * outerRadius;
    const dividerY = metrics.center + Math.sin(startAngle) * outerRadius;
    const dividerInnerX = metrics.center + Math.cos(startAngle) * innerRadius;
    const dividerInnerY = metrics.center + Math.sin(startAngle) * innerRadius;
    const labelX = metrics.center + Math.cos(middleAngle) * labelRadius;
    const labelY = metrics.center + Math.sin(middleAngle) * labelRadius;

    context.beginPath();
    context.moveTo(dividerInnerX, dividerInnerY);
    context.lineTo(dividerX, dividerY);
    context.stroke();

    if (label) {
      drawCenteredText(
        context,
        String(label),
        labelX,
        labelY,
        Math.max(11, (outerRadius - innerRadius) * 0.36),
        textColor
      );
    }
  });

  context.restore();
};

const drawSquare = (context, metrics, colors, labels) => {
  const start = metrics.center - (metrics.squareSize / 2);
  const cellSize = metrics.squareSize / SQUARE_GRID_SIZE;

  context.save();
  context.lineWidth = 1;
  context.strokeStyle = colors.border;
  context.fillStyle = colors.squareFill;
  context.shadowColor = colors.glow;
  context.shadowBlur = 18;
  context.fillRect(start, start, metrics.squareSize, metrics.squareSize);
  context.shadowBlur = 0;
  context.strokeRect(start, start, metrics.squareSize, metrics.squareSize);

  for (let index = 1; index < SQUARE_GRID_SIZE; index += 1) {
    const offset = start + (cellSize * index);

    context.beginPath();
    context.moveTo(offset, start);
    context.lineTo(offset, start + metrics.squareSize);
    context.moveTo(start, offset);
    context.lineTo(start + metrics.squareSize, offset);
    context.stroke();
  }

  labels.forEach((label, index) => {
    const column = index % SQUARE_GRID_SIZE;
    const row = Math.floor(index / SQUARE_GRID_SIZE);
    const x = start + (column * cellSize) + (cellSize / 2);
    const y = start + (row * cellSize) + (cellSize / 2);

    if (label) {
      drawCenteredText(context, label, x, y, Math.max(14, cellSize * 0.28), colors.text);
    }
  });

  context.restore();
};

const getLineValues = (rowsByLabel, label) => {
  const row = rowsByLabel.get(label);

  if (!row) {
    throw new Error(`Tenki database is missing "${label}".`);
  }

  return TENKI_NUMBER_COLUMNS.map((number) => row[number] ?? "");
};

const normalizeTenkiRows = (rows) => {
  const rowsByLabel = new Map(rows.map((row) => [row.label, row]));
  const trigramHanzi = getLineValues(rowsByLabel, TENKI_ROW_LABELS.trigramHanzi);

  const rowsByNumber = new Map(
    TENKI_NUMBER_COLUMNS.map((number, index) => [
      Number(number),
      {
        number: Number(number),
        binary: getBinaryLabel(Number(number)),
        trigram_hanzi: trigramHanzi[index]
      }
    ])
  );

  return SQUARE_ORDER.map((number, index) => rowsByNumber.get(number) || DEFAULT_TENKI_ROWS[index]);
};

const createTenkiState = (orderedRows) => ({
  squareLabels: orderedRows.map((row) => row.trigram_hanzi || ""),
  rings: RING_TEMPLATES.map((ring) => ({
    ...ring,
    labels: ring.getLabels(orderedRows)
  }))
});

const DEFAULT_TENKI_STATE = createTenkiState(DEFAULT_TENKI_ROWS);

const getTenkiState = (rows) => {
  const orderedRows = normalizeTenkiRows(rows);

  return createTenkiState(orderedRows);
};

const fetchTenkiRows = async () => {
  if (!window.JayceeAuth) {
    throw new Error("Supabase is not available.");
  }

  const client = await window.JayceeAuth.getSupabaseClient();
  const { data, error } = await client
    .from(TENKI_TABLE)
    .select(TENKI_SELECT_COLUMNS)
    .in("label", Object.values(TENKI_ROW_LABELS));

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
};

const drawTenki = (canvas, state = DEFAULT_TENKI_STATE) => {
  const context = resizeCanvas(canvas);
  const rect = canvas.getBoundingClientRect();
  const metrics = getCanvasMetrics(canvas, state.rings.length);
  const accent = getThemeColor("--accent", "#74f7d1");
  const accentSoft = getThemeColor("--accent-soft", "#a7ffe7");
  const border = "rgba(255, 255, 255, 0.38)";
  const softBorder = "rgba(255, 255, 255, 0.24)";

  context.clearRect(0, 0, rect.width, rect.height);

  [...state.rings].reverse().forEach((ring, reversedIndex) => {
    const index = state.rings.length - reversedIndex - 1;
    const innerRadius = metrics.squareOuterRadius + (metrics.ringWidth * index);
    const outerRadius = innerRadius + metrics.ringWidth;
    const isSoft = ring.tone === "soft";

    drawRing(context, metrics, {
      count: ring.count,
      labels: ring.labels,
      innerRadius,
      outerRadius,
      stroke: isSoft ? softBorder : border,
      textColor: isSoft ? accentSoft : accent,
      rotation: ring.centerLastSegmentAtTop ? getTopCenteredLastSegmentRotation(ring.count) : undefined
    });
  });

  drawSquare(context, metrics, {
    border,
    glow: "rgba(116, 247, 209, 0.18)",
    squareFill: "rgba(7, 21, 24, 0.18)",
    text: accent
  }, state.squareLabels);
};

const initTenki = async () => {
  const canvas = document.querySelector("[data-tenki-canvas]");
  if (!canvas) return;

  let state = DEFAULT_TENKI_STATE;
  const render = () => drawTenki(canvas, state);
  const resizeObserver = new ResizeObserver(render);

  resizeObserver.observe(canvas);
  window.addEventListener("resize", render);
  render();

  try {
    const rows = await fetchTenkiRows();
    state = getTenkiState(rows);
    render();
  } catch (error) {
    console.error("Unable to load Tenki data.", error);
  }
};

initTenki();
