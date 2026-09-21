const RING_SEGMENT_COUNT = 9;
const SQUARE_GRID_SIZE = 3;
const TENKI_ORDER = [1, 2, 4, 3, 5, 7, 6, 8, 9];
const COMMAND_RING_NUMBER = 9;
const COMMAND_RING_CURSOR_LABEL = "_";
const COMMAND_RING_INDEX = 0;
const COMMAND_SEGMENT_INDEX = TENKI_ORDER.indexOf(COMMAND_RING_NUMBER);
const CONSOLE_TYPING_SPEED = 18;
const CONSOLE_LINE_PAUSE = 90;
const TEXT_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='24' viewBox='0 0 16 24'%3E%3Cpath d='M5 3H11M8 3V21M5 21H11' stroke='black' stroke-width='3' stroke-linecap='square'/%3E%3Cpath d='M5 3H11M8 3V21M5 21H11' stroke='white' stroke-width='1.4' stroke-linecap='square'/%3E%3C/svg%3E\") 8 12, text";
const STYLED_RING_INDEX = 0;
const STYLED_SEGMENT_INDICES = TENKI_ORDER
  .map((number, index) => (number === COMMAND_RING_NUMBER ? null : index))
  .filter((index) => index !== null);
const SQUARE_PALETTE_CORNERS = {
  topLeft: "#35f3c8",
  topRight: "#45a8ff",
  bottomLeft: "#b86cff",
  bottomRight: "#ffb35c"
};
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
  binary: getBinaryLabel(number),
  isCommandPrompt: number === COMMAND_RING_NUMBER
}));
const RING_TEMPLATES = [
  {
    getLabels: (rows) => rows.map((row) => (row.isCommandPrompt ? COMMAND_RING_CURSOR_LABEL : row.binary || "")),
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

const getColorRgb = (color, fallback) => {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (!hex) return fallback;

  const value = Number.parseInt(hex[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `${red}, ${green}, ${blue}`;
};

const hexToRgb = (color) => {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (!hex) return { red: 255, green: 255, blue: 255 };

  const value = Number.parseInt(hex[1], 16);

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255
  };
};

const rgbToHex = ({ red, green, blue }) => {
  const toHex = (channel) => Math.round(channel).toString(16).padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
};

const mixRgb = (start, end, amount) => ({
  red: start.red + ((end.red - start.red) * amount),
  green: start.green + ((end.green - start.green) * amount),
  blue: start.blue + ((end.blue - start.blue) * amount)
});

const getSquarePaletteColor = (column, row) => {
  const x = column / SQUARE_GRID_SIZE;
  const y = row / SQUARE_GRID_SIZE;
  const top = mixRgb(
    hexToRgb(SQUARE_PALETTE_CORNERS.topLeft),
    hexToRgb(SQUARE_PALETTE_CORNERS.topRight),
    x
  );
  const bottom = mixRgb(
    hexToRgb(SQUARE_PALETTE_CORNERS.bottomLeft),
    hexToRgb(SQUARE_PALETTE_CORNERS.bottomRight),
    x
  );

  return rgbToHex(mixRgb(top, bottom, y));
};

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

const typeTenkiConsoleLine = async (line) => {
  if (!line) return;

  const message = line.dataset.tenkiConsoleLine || "";
  const prompt = line.querySelector("span[aria-hidden='true']") || document.createElement("span");
  const text = document.createElement("span");

  prompt.setAttribute("aria-hidden", "true");
  prompt.textContent = ">";
  line.replaceChildren(prompt, text);

  await wait(CONSOLE_LINE_PAUSE);

  for (const character of message) {
    text.textContent += character;
    await wait(CONSOLE_TYPING_SPEED);
  }
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

const normalizeAngle = (angle) => {
  const fullCircle = Math.PI * 2;

  return ((angle % fullCircle) + fullCircle) % fullCircle;
};

const isAngleInRange = (angle, startAngle, endAngle) => {
  const normalizedAngle = normalizeAngle(angle);
  const normalizedStart = normalizeAngle(startAngle);
  const normalizedEnd = normalizeAngle(endAngle);

  if (normalizedStart <= normalizedEnd) {
    return normalizedAngle >= normalizedStart && normalizedAngle <= normalizedEnd;
  }

  return normalizedAngle >= normalizedStart || normalizedAngle <= normalizedEnd;
};

const getRingSegmentHitArea = (metrics, ringIndex, segmentIndex, count) => {
  const segmentAngle = (Math.PI * 2) / count;
  const rotation = getTopCenteredLastSegmentRotation(count);
  const innerRadius = metrics.squareOuterRadius + (metrics.ringWidth * ringIndex);
  const outerRadius = innerRadius + metrics.ringWidth;
  const startAngle = rotation + (segmentIndex * segmentAngle);

  return {
    count,
    endAngle: startAngle + segmentAngle,
    innerRadius,
    outerRadius,
    startAngle
  };
};

const isPointInRingSegment = (point, metrics, segment) => {
  const distanceX = point.x - metrics.center;
  const distanceY = point.y - metrics.center;
  const distance = Math.hypot(distanceX, distanceY);
  const angle = Math.atan2(distanceY, distanceX);

  return distance >= segment.innerRadius
    && distance <= segment.outerRadius
    && isAngleInRange(angle, segment.startAngle, segment.endAngle);
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

const drawCommandPrompt = (context, x, y, size, colors, isCursorVisible) => {
  const parts = [
    { text: isCursorVisible ? "_" : " ", color: colors.text }
  ];

  context.save();
  context.font = `600 ${size}px "Share Tech Mono", monospace`;
  context.textAlign = "left";
  context.textBaseline = "middle";

  const totalWidth = parts.reduce((width, part) => width + context.measureText(part.text).width, 0);
  let currentX = x - (totalWidth / 2);

  parts.forEach((part) => {
    context.fillStyle = part.color;
    context.shadowColor = part.color;
    context.shadowBlur = 10;
    context.fillText(part.text, currentX, y);
    currentX += context.measureText(part.text).width;
  });

  context.restore();
};

const getTopCenteredLastSegmentRotation = (count) => {
  const segmentAngle = (Math.PI * 2) / count;
  return -Math.PI / 2 - ((count - 0.5) * segmentAngle);
};

const drawRingSegmentPanel = (context, metrics, segment, colors) => {
  context.save();
  context.fillStyle = colors.fill;
  context.strokeStyle = colors.stroke;
  context.lineWidth = 1;
  context.shadowColor = colors.glow;
  context.shadowBlur = 10;

  context.beginPath();
  context.arc(metrics.center, metrics.center, segment.outerRadius, segment.startAngle, segment.endAngle);
  context.lineTo(
    metrics.center + Math.cos(segment.endAngle) * segment.innerRadius,
    metrics.center + Math.sin(segment.endAngle) * segment.innerRadius
  );
  context.arc(metrics.center, metrics.center, segment.innerRadius, segment.endAngle, segment.startAngle, true);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
};

const drawRing = (context, metrics, options) => {
  const {
    count,
    labels,
    innerRadius,
    outerRadius,
    stroke,
    textColor,
    commandColor,
    isCommandCursorVisible = true,
    styledSegmentColors,
    styledSegmentIndices = [],
    rotation = -Math.PI / 2
  } = options;
  const segmentAngle = (Math.PI * 2) / count;
  const labelRadius = innerRadius + ((outerRadius - innerRadius) / 2);

  context.save();
  context.lineWidth = 1;
  context.strokeStyle = stroke;

  if (styledSegmentColors) {
    styledSegmentIndices.forEach((segmentIndex) => {
      drawRingSegmentPanel(
        context,
        metrics,
        {
          count,
          endAngle: rotation + ((segmentIndex + 1) * segmentAngle),
          innerRadius,
          outerRadius,
          startAngle: rotation + (segmentIndex * segmentAngle)
        },
        styledSegmentColors
      );
    });
  }

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
      const textSize = Math.max(11, (outerRadius - innerRadius) * 0.36);

      if (label === COMMAND_RING_CURSOR_LABEL) {
        drawCommandPrompt(context, labelX, labelY, textSize, {
          accent: commandColor,
          text: textColor
        }, isCommandCursorVisible);
      } else {
        drawCenteredText(
          context,
          String(label),
          labelX,
          labelY,
          textSize,
          textColor
        );
      }
    }
  });

  context.restore();
};

const drawGradientSquareCell = (context, x, y, size, colors) => {
  const gradient = context.createLinearGradient(x, y, x + size, y + size);

  gradient.addColorStop(0, colors.start);
  gradient.addColorStop(1, colors.end);

  context.fillStyle = gradient;
  context.fillRect(x, y, size, size);
};

const drawSquare = (context, metrics, colors) => {
  const start = metrics.center - (metrics.squareSize / 2);
  const cellSize = metrics.squareSize / SQUARE_GRID_SIZE;

  context.save();
  context.shadowColor = colors.glow;
  context.shadowBlur = 18;

  for (let row = 0; row < SQUARE_GRID_SIZE; row += 1) {
    for (let column = 0; column < SQUARE_GRID_SIZE; column += 1) {
      drawGradientSquareCell(
        context,
        start + (column * cellSize),
        start + (row * cellSize),
        cellSize,
        {
          start: getSquarePaletteColor(column, row),
          end: getSquarePaletteColor(column + 1, row + 1)
        }
      );
    }
  }

  context.shadowBlur = 0;
  context.lineWidth = 1;
  context.strokeStyle = colors.cellBorder;

  for (let index = 1; index < SQUARE_GRID_SIZE; index += 1) {
    const offset = start + (cellSize * index);
    context.beginPath();
    context.moveTo(offset, start);
    context.lineTo(offset, start + metrics.squareSize);
    context.moveTo(start, offset);
    context.lineTo(start + metrics.squareSize, offset);
    context.stroke();
  }

  context.strokeStyle = colors.border;
  context.strokeRect(start, start, metrics.squareSize, metrics.squareSize);
  context.restore();
};

const createTenkiState = (orderedRows) => ({
  rings: RING_TEMPLATES.map((ring) => ({
    ...ring,
    labels: ring.getLabels(orderedRows)
  }))
});

const DEFAULT_TENKI_STATE = createTenkiState(DEFAULT_TENKI_ROWS);

const drawTenki = (canvas, state = DEFAULT_TENKI_STATE, options = {}) => {
  const context = resizeCanvas(canvas);
  const rect = canvas.getBoundingClientRect();
  const metrics = getCanvasMetrics(canvas, state.rings.length);
  const accent = getThemeColor("--accent", "#74f7d1");
  const accentSoft = getThemeColor("--accent-soft", "#a7ffe7");
  const accentSoftRgb = getColorRgb(accentSoft, "255, 213, 107");
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
      commandColor: accentSoft,
      styledSegmentColors: {
        fill: `rgba(${accentSoftRgb}, 0.1)`,
        glow: `rgba(${accentSoftRgb}, 0.18)`,
        stroke: `rgba(${accentSoftRgb}, 0.45)`
      },
      isCommandCursorVisible: options.isCommandCursorVisible,
      styledSegmentIndices: index === STYLED_RING_INDEX ? STYLED_SEGMENT_INDICES : [],
      rotation: ring.centerLastSegmentAtTop ? getTopCenteredLastSegmentRotation(ring.count) : undefined
    });
  });

  drawSquare(context, metrics, {
    border,
    cellBorder: "rgba(7, 21, 24, 0.26)",
    glow: "rgba(116, 247, 209, 0.14)"
  });
};

const initTenki = () => {
  typeTenkiConsoleLine(document.querySelector("[data-tenki-console-line]"));

  const canvas = document.querySelector("[data-tenki-canvas]");
  if (!canvas) return;

  let isCommandSegmentHovered = false;
  let isCommandCursorVisible = true;
  const render = () => drawTenki(canvas, DEFAULT_TENKI_STATE, {
    isCommandCursorVisible
  });
  const getPointerPoint = (event) => {
    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };
  const getCommandSegment = (metrics) => getRingSegmentHitArea(
    metrics,
    COMMAND_RING_INDEX,
    COMMAND_SEGMENT_INDEX,
    RING_SEGMENT_COUNT
  );
  const updateInteractiveHover = (event) => {
    const metrics = getCanvasMetrics(canvas, DEFAULT_TENKI_STATE.rings.length);
    const pointerPoint = getPointerPoint(event);
    const nextIsCommandSegmentHovered = isPointInRingSegment(pointerPoint, metrics, getCommandSegment(metrics));

    if (nextIsCommandSegmentHovered === isCommandSegmentHovered) return;

    isCommandSegmentHovered = nextIsCommandSegmentHovered;
    canvas.style.cursor = isCommandSegmentHovered ? TEXT_CURSOR : "";
    render();
  };
  const resizeObserver = new ResizeObserver(render);

  resizeObserver.observe(canvas);
  window.addEventListener("resize", render);
  window.setInterval(() => {
    isCommandCursorVisible = !isCommandCursorVisible;
    render();
  }, 600);
  canvas.addEventListener("pointermove", updateInteractiveHover);
  canvas.addEventListener("pointerleave", () => {
    if (!isCommandSegmentHovered) return;

    isCommandSegmentHovered = false;
    canvas.style.cursor = "";
    render();
  });
  render();
};

initTenki();
