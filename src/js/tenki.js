const RING_SEGMENT_COUNT = 9;
const SQUARE_GRID_SIZE = 3;
const TENKI_ORDER = [1, 2, 4, 3, 5, 7, 6, 8, 9];
const SQUARE_DIRECTIONS = [
  Math.PI / 4,
  Math.PI / 2,
  (Math.PI * 3) / 4,
  0,
  null,
  Math.PI,
  -Math.PI / 4,
  -Math.PI / 2,
  (-Math.PI * 3) / 4
];
const EMPTY_LABELS = Array.from({ length: RING_SEGMENT_COUNT }, () => "");
const getBinaryLabel = (number) => {
  const binary = (number - 1).toString(2).padStart(3, "0");

  if (binary.length > 3) {
    return "";
  }

  return binary
    .replaceAll("1", ".")
    .replaceAll("0", " ");
};
const DEFAULT_TENKI_ROWS = TENKI_ORDER.map((number) => ({
  number,
  binary: getBinaryLabel(number)
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
  const value = getComputedStyle(document.body).getPropertyValue(name).trim()
    || getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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

const drawDirectionalMark = (context, x, y, size, angle, color) => {
  const tip = size * 0.095;
  const tail = size * -0.07;
  const wing = size * 0.145;

  context.save();
  context.translate(x, y);
  context.rotate(angle + Math.PI);
  context.lineWidth = Math.max(1, size * 0.02);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 6;
  context.beginPath();
  context.moveTo(tail, -wing);
  context.lineTo(tip, 0);
  context.lineTo(tail, wing);
  context.stroke();
  context.restore();
};

const drawSquare = (context, metrics, colors) => {
  const start = metrics.center - (metrics.squareSize / 2);
  const cellSize = metrics.squareSize / SQUARE_GRID_SIZE;
  const markSize = cellSize * 0.78;

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

  SQUARE_DIRECTIONS.forEach((angle, index) => {
    const column = index % SQUARE_GRID_SIZE;
    const row = Math.floor(index / SQUARE_GRID_SIZE);
    const x = start + (column * cellSize) + (cellSize / 2);
    const y = start + (row * cellSize) + (cellSize / 2);

    if (angle !== null) {
      drawDirectionalMark(context, x, y, markSize, angle, colors.text);
    }
  });

  context.restore();
};

const createTenkiState = (orderedRows) => ({
  rings: RING_TEMPLATES.map((ring) => ({
    ...ring,
    labels: ring.getLabels(orderedRows)
  }))
});

const DEFAULT_TENKI_STATE = createTenkiState(DEFAULT_TENKI_ROWS);

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
    glow: "rgba(116, 247, 209, 0.14)",
    squareFill: "rgba(7, 21, 24, 0.18)",
    text: accent
  });
};

const initTenki = () => {
  const canvas = document.querySelector("[data-tenki-canvas]");
  if (!canvas) return;

  const render = () => drawTenki(canvas);
  const resizeObserver = new ResizeObserver(render);

  resizeObserver.observe(canvas);
  window.addEventListener("resize", render);
  render();
};

initTenki();
