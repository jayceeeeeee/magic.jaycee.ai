import {
  CELESTIAL_RING_FRACTALS,
  MOON_RING_INDEX,
  SUN_RING_INDEX,
  getCelestialMarkerConfig,
  getCelestialReadout,
  getCelestialRingColors as getFractalCelestialRingColors
} from "./tenki-fractals.js";

const RING_SEGMENT_COUNT = 9;
const SQUARE_GRID_SIZE = 3;
const TENKI_ORDER = [1, 2, 4, 3, 5, 7, 6, 8, 9];
const TENKI_CORE_LABELS = {
  1: "#6D",
  2: "#B6",
  3: "#92",
  4: "#00",
  5: "",
  6: "#24",
  7: "#DB",
  8: "#49",
  9: "#FF"
};
const ACTIVE_CORE_SEGMENT_INDEX = TENKI_ORDER.indexOf(9);
const ACTIVE_FILL_ALPHA = 0.255;
const CONSOLE_TYPING_SPEED = 18;
const CONSOLE_LINE_PAUSE = 90;
const SURFACE_FILL_ALPHA = 0.86;
const STYLED_RING_INDEX = 0;
const getSegmentIndices = (count) => Array.from({ length: count }, (_, index) => index);
const THEME_PALETTE_MIXES = {
  bottomLeft: 0.08,
  bottomRight: 0.24,
  topLeft: 0.08,
  topRight: 0.24
};
const getEmptyLabels = (count) => Array.from({ length: count }, () => "");
const getSquareBinaryLabel = (number) => (number - 1).toString(2)
  .padStart(3, "0")
  .replaceAll("0", "□")
  .replaceAll("1", "■");
const DEFAULT_TENKI_ROWS = TENKI_ORDER.map((number) => ({
  number
}));
const RING_TEMPLATES = [
  {
    count: RING_SEGMENT_COUNT,
    getLabels: (rows) => rows.map((row, index) => (
      index < RING_SEGMENT_COUNT - 1 ? getSquareBinaryLabel(row.number) : ""
    )),
    tone: "accent"
  },
  {
    count: 1,
    getTickLabel: CELESTIAL_RING_FRACTALS.sun.getTickLabel,
    palette: "sun",
    tickLabelColor: CELESTIAL_RING_FRACTALS.sun.tickLabelColor,
    tickCount: CELESTIAL_RING_FRACTALS.sun.tickCount,
    tickStroke: CELESTIAL_RING_FRACTALS.sun.tickStroke,
    tone: "soft"
  },
  {
    count: 1,
    getTickLabel: CELESTIAL_RING_FRACTALS.moon.getTickLabel,
    palette: "moon",
    tickLabelColor: CELESTIAL_RING_FRACTALS.moon.tickLabelColor,
    tickCount: CELESTIAL_RING_FRACTALS.moon.tickCount,
    tickStroke: CELESTIAL_RING_FRACTALS.moon.tickStroke,
    tone: "soft"
  }
].map((ring) => ({
  centerLastSegmentAtTop: true,
  getLabels: () => getEmptyLabels(ring.count),
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

const rgbToCss = ({ red, green, blue }, alpha) => (
  `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${alpha})`
);

const mixRgb = (start, end, amount) => ({
  red: start.red + ((end.red - start.red) * amount),
  green: start.green + ((end.green - start.green) * amount),
  blue: start.blue + ((end.blue - start.blue) * amount)
});

const getThemePaletteCorners = (accent, accentSoft) => {
  const accentRgb = hexToRgb(accent);
  const accentSoftRgb = hexToRgb(accentSoft);

  return {
    bottomLeft: rgbToHex(mixRgb(accentSoftRgb, accentRgb, THEME_PALETTE_MIXES.bottomLeft)),
    bottomRight: rgbToHex(mixRgb(accentSoftRgb, accentRgb, THEME_PALETTE_MIXES.bottomRight)),
    topLeft: rgbToHex(mixRgb(accentRgb, accentSoftRgb, THEME_PALETTE_MIXES.topLeft)),
    topRight: rgbToHex(mixRgb(accentRgb, accentSoftRgb, THEME_PALETTE_MIXES.topRight))
  };
};

const getThemeBorderColors = (accent, accentSoft) => {
  const borderRgb = mixRgb(hexToRgb(accent), hexToRgb(accentSoft), 0.5);

  return {
    ring: rgbToCss(borderRgb, 0.44),
    ringSoft: rgbToCss(borderRgb, 0.26),
    square: rgbToCss(borderRgb, 0.24),
    squareCell: rgbToCss(borderRgb, 0.14)
  };
};

const getSquarePaletteColor = (column, row, palette) => {
  const x = column / SQUARE_GRID_SIZE;
  const y = row / SQUARE_GRID_SIZE;
  const top = mixRgb(
    hexToRgb(palette.topLeft),
    hexToRgb(palette.topRight),
    x
  );
  const bottom = mixRgb(
    hexToRgb(palette.bottomLeft),
    hexToRgb(palette.bottomRight),
    x
  );

  return rgbToHex(mixRgb(top, bottom, y));
};

const getSquareCellPaletteColors = (index, palette) => {
  const column = index % SQUARE_GRID_SIZE;
  const row = Math.floor(index / SQUARE_GRID_SIZE);

  return {
    end: getSquarePaletteColor(column + 1, row + 1, palette),
    start: getSquarePaletteColor(column, row, palette)
  };
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
    size,
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

const drawCenteredText = (context, text, x, y, size, color, options = {}) => {
  context.save();
  const weight = options.weight || 600;
  const fontFamily = options.fontFamily || "\"Share Tech Mono\", monospace";
  let textSize = size;

  context.translate(x, y);
  if (options.rotation) {
    context.rotate(options.rotation);
  }
  context.fillStyle = color;
  context.font = `${weight} ${textSize}px ${fontFamily}`;
  if (options.maxWidth) {
    const measuredWidth = context.measureText(text).width;

    if (measuredWidth > options.maxWidth) {
      textSize *= options.maxWidth / measuredWidth;
      context.font = `${weight} ${textSize}px ${fontFamily}`;
    }
  }
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = options.shadowColor || color;
  context.shadowBlur = options.shadowBlur === undefined ? 10 : options.shadowBlur;
  if (options.strokeColor) {
    context.lineWidth = options.strokeWidth || Math.max(2, textSize * 0.18);
    context.strokeStyle = options.strokeColor;
    context.strokeText(text, 0, 0);
  }
  context.fillText(text, 0, 0);
  context.restore();
};

const ACTIVE_CORE_TEXT_COLOR = "rgba(124, 255, 120, 0.92)";
const CORE_NUMBER_FONT = "\"Rajdhani\", \"Share Tech Mono\", sans-serif";
const CORE_TEXT_COLOR = "rgba(5, 21, 25, 0.56)";

const getTopCenteredLastSegmentRotation = (count) => {
  const segmentAngle = (Math.PI * 2) / count;
  return -Math.PI / 2 - ((count - 0.5) * segmentAngle);
};

const drawCelestialPositionMarker = (context, metrics, options) => {
  const {
    angle,
    glyph,
    glyphColor,
    glyphSize,
    innerRadius,
    outerRadius,
    shadowColor,
    strokeColor
  } = options;
  const radius = innerRadius + ((outerRadius - innerRadius) / 2);
  const x = metrics.center + Math.cos(angle) * radius;
  const y = metrics.center + Math.sin(angle) * radius;

  context.save();
  context.strokeStyle = strokeColor;
  context.lineWidth = Math.max(2, (outerRadius - innerRadius) * 0.045);
  context.shadowColor = shadowColor;
  context.shadowBlur = (outerRadius - innerRadius) * 0.16;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(metrics.center, metrics.center);
  context.stroke();
  context.restore();

  drawCenteredText(
    context,
    glyph,
    x,
    y,
    Math.max(13, (outerRadius - innerRadius) * glyphSize),
    glyphColor,
    {
      fontFamily: "\"Segoe UI Emoji\", \"Apple Color Emoji\", \"Noto Color Emoji\", \"Segoe UI Symbol\", sans-serif",
      shadowBlur: 12,
      shadowColor,
      strokeColor: "rgba(120, 20, 14, 0.34)",
      strokeWidth: Math.max(1, (outerRadius - innerRadius) * 0.018),
      weight: 500
    }
  );
};

const drawCelestialRingMarker = (context, metrics, options) => {
  const {
    paletteName,
    timestamp,
    ...radii
  } = options;

  drawCelestialPositionMarker(context, metrics, {
    ...radii,
    ...getCelestialMarkerConfig(paletteName, timestamp)
  });
};

const drawCelestialReadout = (context) => {
  const readout = getCelestialReadout();
  const lines = [
    `SUN: ${readout.sunTime}`,
    `MOON: D${readout.moonDay.toFixed(2)} ${readout.moonIlluminationPercent.toFixed(1)}%`
  ];
  const x = 14;
  const y = 14;
  const width = 142;
  const height = 45;

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.18)";
  context.shadowBlur = 10;
  context.fillStyle = "rgba(255, 255, 255, 0.68)";
  context.strokeStyle = "rgba(5, 21, 25, 0.22)";
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, width, height, 5);
  context.fill();
  context.shadowBlur = 0;
  context.stroke();

  context.font = `550 11px ${CORE_NUMBER_FONT}`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(5, 21, 25, 0.66)";
  lines.forEach((line, index) => {
    context.fillText(line, x + 10, y + 16 + (index * 16));
  });
  context.restore();
};

const drawRingSegmentPanel = (context, metrics, segment, colors) => {
  const isFullCircle = Math.abs(segment.endAngle - segment.startAngle) >= (Math.PI * 2) - 0.0001;
  const gradient = context.createLinearGradient(
    metrics.center + Math.cos(segment.startAngle) * segment.innerRadius,
    metrics.center + Math.sin(segment.startAngle) * segment.innerRadius,
    metrics.center + Math.cos(segment.endAngle) * segment.outerRadius,
    metrics.center + Math.sin(segment.endAngle) * segment.outerRadius
  );

  gradient.addColorStop(0, colors.start);
  gradient.addColorStop(1, colors.end);

  context.save();

  context.beginPath();
  context.arc(metrics.center, metrics.center, segment.outerRadius, segment.startAngle, segment.endAngle);
  if (!isFullCircle) {
    context.lineTo(
      metrics.center + Math.cos(segment.endAngle) * segment.innerRadius,
      metrics.center + Math.sin(segment.endAngle) * segment.innerRadius
    );
  }
  context.arc(metrics.center, metrics.center, segment.innerRadius, segment.endAngle, segment.startAngle, true);
  context.closePath();
  context.fillStyle = gradient;
  context.shadowColor = colors.glow;
  context.shadowBlur = colors.transparent ? 0 : 8;
  context.globalAlpha = colors.transparent ? ACTIVE_FILL_ALPHA : (colors.alpha ?? 1);
  context.fill();
  context.globalAlpha = 1;

  if (colors.inset) {
    context.shadowBlur = 0;
    context.fillStyle = colors.inset.fill;
    context.beginPath();
    context.arc(metrics.center, metrics.center, segment.outerRadius, segment.startAngle, segment.endAngle);
    if (!isFullCircle) {
      context.lineTo(
        metrics.center + Math.cos(segment.endAngle) * segment.innerRadius,
        metrics.center + Math.sin(segment.endAngle) * segment.innerRadius
      );
    }
    context.arc(metrics.center, metrics.center, segment.innerRadius, segment.endAngle, segment.startAngle, true);
    context.closePath();
    context.fill();

    context.strokeStyle = colors.inset.shadow;
    context.lineWidth = Math.max(1, (segment.outerRadius - segment.innerRadius) * 0.025);
    context.stroke();
  }

  if (colors.border) {
    context.shadowColor = colors.borderGlow || colors.border;
    context.shadowBlur = (segment.outerRadius - segment.innerRadius) * 0.18;
    context.strokeStyle = colors.border;
    context.lineWidth = Math.max(1, (segment.outerRadius - segment.innerRadius) * 0.022);
    if (isFullCircle) {
      context.beginPath();
      context.arc(metrics.center, metrics.center, segment.outerRadius, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(metrics.center, metrics.center, segment.innerRadius, 0, Math.PI * 2);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(metrics.center, metrics.center, segment.outerRadius, segment.startAngle, segment.endAngle);
      context.lineTo(
        metrics.center + Math.cos(segment.endAngle) * segment.innerRadius,
        metrics.center + Math.sin(segment.endAngle) * segment.innerRadius
      );
      context.arc(metrics.center, metrics.center, segment.innerRadius, segment.endAngle, segment.startAngle, true);
      context.closePath();
      context.stroke();
    }
  }

  context.restore();
};

const drawRingTickMarks = (context, metrics, options) => {
  const {
    count,
    getTickLabel,
    innerRadius,
    labelColor,
    outerRadius,
    stroke,
    rotation = -Math.PI / 2
  } = options;
  const ringWidth = outerRadius - innerRadius;
  const tickStep = (Math.PI * 2) / count;

  context.save();
  context.strokeStyle = stroke;
  context.shadowColor = stroke;
  context.shadowBlur = ringWidth * 0.06;
  context.lineCap = "round";

  for (let index = 0; index < count; index += 1) {
    const angle = rotation + (index * tickStep);
    const isPrimary = index % 2 === 0;
    const startRadius = outerRadius;
    const endRadius = outerRadius - (ringWidth * (isPrimary ? 0.34 : 0.2));
    const label = getTickLabel ? getTickLabel(index) : "";

    context.lineWidth = Math.max(1, ringWidth * (isPrimary ? 0.024 : 0.014));
    context.beginPath();
    context.moveTo(
      metrics.center + Math.cos(angle) * startRadius,
      metrics.center + Math.sin(angle) * startRadius
    );
    context.lineTo(
      metrics.center + Math.cos(angle) * endRadius,
      metrics.center + Math.sin(angle) * endRadius
    );
    context.stroke();

    if (label) {
      const labelRadius = outerRadius - (ringWidth * 0.58);

      drawCenteredText(
        context,
        label,
        metrics.center + Math.cos(angle) * labelRadius,
        metrics.center + Math.sin(angle) * labelRadius,
        Math.max(7, ringWidth * 0.135),
        labelColor || stroke,
        {
          fontFamily: "\"Share Tech Mono\", \"Rajdhani\", monospace",
          maxWidth: ringWidth * 0.7,
          shadowBlur: 0,
          weight: 550
        }
      );
    }
  }

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
    styledSegmentColors,
    styledSegmentIndices = [],
    getTickLabel,
    tickCount = 0,
    tickLabelColor,
    tickStroke,
    showBorders = true,
    showDividers = showBorders,
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
        typeof styledSegmentColors === "function" ? styledSegmentColors(segmentIndex) : styledSegmentColors
      );
    });
  }

  if (showBorders) {
    context.beginPath();
    context.arc(metrics.center, metrics.center, innerRadius, 0, Math.PI * 2);
    context.stroke();

    context.beginPath();
    context.arc(metrics.center, metrics.center, outerRadius, 0, Math.PI * 2);
    context.stroke();
  }

  if (tickCount) {
    drawRingTickMarks(context, metrics, {
      count: tickCount,
      getTickLabel,
      innerRadius,
      labelColor: tickLabelColor,
      outerRadius,
      rotation: -Math.PI / 2,
      stroke: tickStroke || stroke
    });
  }

  labels.forEach((label, index) => {
    const startAngle = rotation + (index * segmentAngle);
    const middleAngle = startAngle + (segmentAngle / 2);
    const dividerX = metrics.center + Math.cos(startAngle) * outerRadius;
    const dividerY = metrics.center + Math.sin(startAngle) * outerRadius;
    const dividerInnerX = metrics.center + Math.cos(startAngle) * innerRadius;
    const dividerInnerY = metrics.center + Math.sin(startAngle) * innerRadius;
    const labelX = metrics.center + Math.cos(middleAngle) * labelRadius;
    const labelY = metrics.center + Math.sin(middleAngle) * labelRadius;

    if (showDividers) {
      context.beginPath();
      context.moveTo(dividerInnerX, dividerInnerY);
      context.lineTo(dividerX, dividerY);
      context.stroke();
    }

    if (label) {
      const isCoreRing = !showBorders;
      const isCompact = metrics.size < 420;
      const labelTextSize = isCoreRing
        ? Math.max(isCompact ? 8 : 12, (outerRadius - innerRadius) * (isCompact ? 0.28 : 0.38))
        : Math.max(14, (outerRadius - innerRadius) * 0.46);
      const segmentChord = 2 * labelRadius * Math.sin(segmentAngle / 2);

      drawCenteredText(
        context,
        String(label),
        labelX,
        labelY,
        showBorders ? Math.max(13, labelTextSize * 0.82) : labelTextSize,
        !showBorders && Number(label) === 9 ? ACTIVE_CORE_TEXT_COLOR : textColor,
        showBorders ? {} : {
          fontFamily: CORE_NUMBER_FONT,
          shadowBlur: 10,
          shadowColor: Number(label) === 9 ? "rgba(124, 255, 120, 0.38)" : "rgba(255, 255, 255, 0.1)",
          maxWidth: segmentChord * (isCompact ? 0.34 : 0.42),
          strokeColor: Number(label) === 9 ? "rgba(5, 21, 25, 0.32)" : "rgba(255, 255, 255, 0.1)",
          strokeWidth: Math.max(0.7, labelTextSize * 0.014),
          weight: 500
        }
      );
    }
  });

  context.restore();
};

const drawGradientSquareCell = (context, x, y, size, colors) => {
  const gradient = context.createLinearGradient(x, y, x + size, y + size);

  gradient.addColorStop(0, colors.start);
  gradient.addColorStop(1, colors.end);

  context.save();
  context.globalAlpha = colors.alpha ?? 1;
  context.fillStyle = gradient;
  context.fillRect(x, y, size, size);
  context.restore();
};

const drawInsetSquareCell = (context, x, y, size, colors) => {
  const shade = context.createLinearGradient(x, y, x, y + size);

  shade.addColorStop(0, colors.topShade);
  shade.addColorStop(0.44, colors.fill);
  shade.addColorStop(1, colors.bottomLight);

  context.save();
  if (!colors.transparent) {
    context.fillStyle = shade;
    context.fillRect(x, y, size, size);
  }

  context.strokeStyle = colors.shadow;
  context.lineWidth = Math.max(1, size * 0.025);
  context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  if (colors.border) {
    context.shadowColor = colors.borderGlow || colors.border;
    context.shadowBlur = size * 0.08;
    context.strokeStyle = colors.border;
    context.lineWidth = Math.max(1, size * 0.014);
    context.strokeRect(x + 1, y + 1, size - 2, size - 2);
  }

  context.restore();
};

const drawSquare = (context, metrics, colors) => {
  const start = metrics.center - (metrics.squareSize / 2);
  const cellSize = metrics.squareSize / SQUARE_GRID_SIZE;
  const isCompact = metrics.size < 420;
  const numberSize = Math.max(isCompact ? 9 : 13, metrics.ringWidth * (isCompact ? 0.28 : 0.38));

  context.save();
  context.shadowColor = colors.glow;
  context.shadowBlur = 18;

  for (let row = 0; row < SQUARE_GRID_SIZE; row += 1) {
    for (let column = 0; column < SQUARE_GRID_SIZE; column += 1) {
      const orderIndex = (row * SQUARE_GRID_SIZE) + column;

      if (TENKI_ORDER[orderIndex] !== 5) {
        drawGradientSquareCell(
          context,
          start + (column * cellSize),
          start + (row * cellSize),
          cellSize,
          {
            start: getSquarePaletteColor(column, row, colors.palette),
            end: getSquarePaletteColor(column + 1, row + 1, colors.palette),
            alpha: colors.fillAlpha ?? 1
          }
        );
      } else {
        drawGradientSquareCell(
          context,
          start + (column * cellSize),
          start + (row * cellSize),
          cellSize,
          {
            start: getSquarePaletteColor(column, row, colors.palette),
            end: getSquarePaletteColor(column + 1, row + 1, colors.palette),
            alpha: colors.activeFillAlpha ?? ACTIVE_FILL_ALPHA
          }
        );
        drawInsetSquareCell(
          context,
          start + (column * cellSize),
          start + (row * cellSize),
          cellSize,
          colors.inset
        );
      }
    }
  }

  for (let row = 0; row < SQUARE_GRID_SIZE; row += 1) {
    for (let column = 0; column < SQUARE_GRID_SIZE; column += 1) {
      const orderIndex = (row * SQUARE_GRID_SIZE) + column;
      const number = TENKI_ORDER[orderIndex];
      const label = TENKI_CORE_LABELS[number];
      const centerX = start + (column * cellSize) + (cellSize / 2);
      const centerY = start + (row * cellSize) + (cellSize / 2);

      drawCenteredText(
        context,
        label,
        centerX,
        centerY,
        numberSize,
        number === 5 ? ACTIVE_CORE_TEXT_COLOR : colors.coreText.fill,
        {
          fontFamily: CORE_NUMBER_FONT,
          maxWidth: cellSize * 0.76,
          shadowBlur: 10,
          shadowColor: number === 5 ? "rgba(124, 255, 120, 0.38)" : colors.coreText.shadow,
          strokeColor: number === 5 ? "rgba(5, 21, 25, 0.32)" : colors.coreText.stroke,
          strokeWidth: Math.max(1.2, numberSize * 0.08),
          weight: 800
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

const drawTenki = (canvas, state = DEFAULT_TENKI_STATE) => {
  const context = resizeCanvas(canvas);
  const rect = canvas.getBoundingClientRect();
  const metrics = getCanvasMetrics(canvas, state.rings.length);
  const accent = getThemeColor("--accent", "#74f7d1");
  const accentSoft = getThemeColor("--accent-soft", "#a7ffe7");
  const accentSoftRgb = getColorRgb(accentSoft, "255, 213, 107");
  const palette = getThemePaletteCorners(accent, accentSoft);
  const borderColors = getThemeBorderColors(accent, accentSoft);
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
      stroke: isSoft ? borderColors.ringSoft : borderColors.ring,
      textColor: index === STYLED_RING_INDEX ? CORE_TEXT_COLOR : "rgba(47, 42, 79, 0.74)",
      styledSegmentColors: (segmentIndex) => {
        const celestialColors = getFractalCelestialRingColors(ring.palette, segmentIndex);

        if (celestialColors) {
          return celestialColors;
        }

        const colors = {
          ...getSquareCellPaletteColors(segmentIndex, palette),
          alpha: SURFACE_FILL_ALPHA,
          glow: `rgba(${accentSoftRgb}, 0.14)`
        };

        if (index === STYLED_RING_INDEX && segmentIndex === ACTIVE_CORE_SEGMENT_INDEX) {
          colors.border = "rgba(124, 255, 120, 0.92)";
          colors.borderGlow = "rgba(124, 255, 120, 0.42)";
          colors.transparent = true;
        }

        return colors;
      },
      showBorders: index !== STYLED_RING_INDEX,
      showDividers: !ring.palette && index !== STYLED_RING_INDEX,
      styledSegmentIndices: index === STYLED_RING_INDEX || ring.palette ? getSegmentIndices(ring.count) : [],
      getTickLabel: ring.getTickLabel,
      tickCount: ring.tickCount || 0,
      tickLabelColor: ring.tickLabelColor,
      tickStroke: ring.tickStroke,
      rotation: ring.centerLastSegmentAtTop ? getTopCenteredLastSegmentRotation(ring.count) : undefined
    });
  });

  drawSquare(context, metrics, {
    border: borderColors.square,
    cellBorder: borderColors.squareCell,
    activeFillAlpha: ACTIVE_FILL_ALPHA,
    fillAlpha: SURFACE_FILL_ALPHA,
    glow: "rgba(116, 247, 209, 0.14)",
    palette,
    coreText: {
      fill: CORE_TEXT_COLOR,
      shadow: "rgba(255, 255, 255, 0.1)",
      stroke: "rgba(255, 255, 255, 0.1)"
    },
    inset: {
      border: "rgba(124, 255, 120, 0.92)",
      borderGlow: "rgba(124, 255, 120, 0.42)",
      bottomLight: "rgba(255, 255, 255, 0.035)",
      fill: "rgba(124, 255, 120, 0.035)",
      shadow: "rgba(17, 29, 23, 0.12)",
      topShade: "rgba(17, 29, 23, 0.055)",
      transparent: true
    }
  });

  drawCelestialRingMarker(context, metrics, {
    innerRadius: metrics.squareOuterRadius + (metrics.ringWidth * SUN_RING_INDEX),
    outerRadius: metrics.squareOuterRadius + (metrics.ringWidth * (SUN_RING_INDEX + 1)),
    paletteName: "sun"
  });
  drawCelestialRingMarker(context, metrics, {
    innerRadius: metrics.squareOuterRadius + (metrics.ringWidth * MOON_RING_INDEX),
    outerRadius: metrics.squareOuterRadius + (metrics.ringWidth * (MOON_RING_INDEX + 1)),
    paletteName: "moon"
  });

  drawCelestialReadout(context);
};

const initTenki = () => {
  typeTenkiConsoleLine(document.querySelector("[data-tenki-console-line]"));

  const canvas = document.querySelector("[data-tenki-canvas]");
  if (!canvas) return;

  const render = () => {
    try {
      drawTenki(canvas, DEFAULT_TENKI_STATE);
    } catch (error) {
      console.error("Tenki render failed", error);
    }
  };
  const scheduleRender = () => {
    window.requestAnimationFrame(() => {
      render();
      window.requestAnimationFrame(render);
    });
  };
  const resizeObserver = new ResizeObserver(scheduleRender);
  const clock = window.setInterval(render, 1000);

  resizeObserver.observe(canvas);
  if (canvas.parentElement) {
    resizeObserver.observe(canvas.parentElement);
  }
  window.addEventListener("resize", scheduleRender);
  window.addEventListener("load", scheduleRender);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleRender);
  }
  render();
  scheduleRender();

  window.addEventListener("pagehide", () => {
    window.clearInterval(clock);
  }, { once: true });
};

initTenki();
