const RING_SEGMENT_COUNT = 9;
const SUN_HOUR_COUNT = 24;
const MOON_DAY_COUNT = 29;
const SQUARE_GRID_SIZE = 3;
const TENKI_ORDER = [1, 2, 4, 3, 5, 7, 6, 8, 9];
const URANUS_SEGMENT_INDEX = TENKI_ORDER.indexOf(9);
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
const TENKI_ELEMENTS = {
  1: "Wind",
  2: "Fire",
  3: "Thunder",
  4: "Earth",
  5: "Dao",
  6: "Mountain",
  7: "Lake",
  8: "Water",
  9: "Heaven"
};
const TENKI_TRIGRAMS = {
  1: "☴",
  2: "☲",
  3: "☳",
  4: "☷",
  5: "",
  6: "☶",
  7: "☱",
  8: "☵",
  9: "☰"
};
const TENKI_TRIGRAM_INCREMENTED_VALUES = {
  1: 4,
  2: 6,
  3: 5,
  4: 1,
  5: 9,
  6: 2,
  7: 7,
  8: 3,
  9: 8
};
const TENKI_PLANETS = {
  1: { name: "Neptune" },
  2: { name: "Sun" },
  3: { name: "Moon" },
  4: { name: "Mars" },
  5: { name: "Venus" },
  6: { name: "Mercury" },
  7: { name: "Jupiter" },
  8: { name: "Saturn" },
  9: { name: "Uranus" }
};
const getEmptyLabels = (count) => Array.from({ length: count }, () => "");
const TENKI_RING_TRIGRAMS = Object.entries(TENKI_TRIGRAM_INCREMENTED_VALUES)
  .reduce((trigrams, [key, value]) => ({
    ...trigrams,
    [value]: TENKI_TRIGRAMS[key]
  }), {});
const DEFAULT_TENKI_ROWS = TENKI_ORDER.map((number) => ({
  number,
  planet: TENKI_PLANETS[number],
  ringTrigram: TENKI_RING_TRIGRAMS[number] || "",
  trigram: TENKI_TRIGRAMS[number]
}));
const RING_TEMPLATES = [
  {
    count: RING_SEGMENT_COUNT,
    getLabels: (rows) => rows.map((row, index) => (
      index === URANUS_SEGMENT_INDEX ? row.planet : row.ringTrigram
    )),
    tone: "accent"
  },
  {
    count: 1,
    palette: "sun",
    tickCount: SUN_HOUR_COUNT,
    tone: "soft"
  },
  {
    count: 1,
    palette: "moon",
    tickCount: MOON_DAY_COUNT,
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

const drawPlanetGlyph = (context, x, y, size, planet, colors) => {
  const unit = size / 2;
  const stroke = () => {
    context.stroke();
  };
  const circle = (cx, cy, radius) => {
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
  };
  const line = (startX, startY, endX, endY) => {
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
  };

  context.save();
  context.translate(x, y);
  context.lineWidth = Math.max(1, size * 0.052);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = colors.stroke;
  context.fillStyle = colors.fill;
  context.shadowColor = colors.shadow;
  context.shadowBlur = size * 0.3;

  switch (planet.name) {
    case "Neptune":
      circle(0, 0, unit * 0.62);
      context.beginPath();
      context.arc(0, -unit * 0.12, unit * 0.5, Math.PI * 0.14, Math.PI * 0.86);
      stroke();
      context.beginPath();
      context.arc(0, unit * 0.12, unit * 0.42, Math.PI * 1.14, Math.PI * 1.86);
      stroke();
      circle(unit * 0.24, -unit * 0.18, unit * 0.08);
      break;
    case "Sun":
      circle(0, 0, unit * 0.38);
      [
        [0, -0.78, 0, -0.58],
        [0.55, -0.55, 0.4, -0.4],
        [0.78, 0, 0.58, 0],
        [0.55, 0.55, 0.4, 0.4],
        [0, 0.78, 0, 0.58],
        [-0.55, 0.55, -0.4, 0.4],
        [-0.78, 0, -0.58, 0],
        [-0.55, -0.55, -0.4, -0.4]
      ].forEach(([startX, startY, endX, endY]) => {
        line(unit * startX, unit * startY, unit * endX, unit * endY);
      });
      circle(0, 0, unit * 0.08);
      break;
    case "Moon":
      circle(0, 0, unit * 0.58);
      circle(-unit * 0.22, -unit * 0.2, unit * 0.07);
      circle(-unit * 0.08, unit * 0.22, unit * 0.1);
      circle(unit * 0.16, -unit * 0.04, unit * 0.055);
      break;
    case "Mars":
      circle(0, 0, unit * 0.56);
      circle(-unit * 0.2, -unit * 0.16, unit * 0.08);
      circle(unit * 0.2, unit * 0.18, unit * 0.1);
      context.beginPath();
      context.arc(0, -unit * 0.4, unit * 0.28, Math.PI * 0.16, Math.PI * 0.84);
      stroke();
      context.beginPath();
      context.moveTo(-unit * 0.42, unit * 0.16);
      context.bezierCurveTo(-unit * 0.18, unit * 0.02, unit * 0.08, unit * 0.34, unit * 0.42, unit * 0.12);
      stroke();
      break;
    case "Venus":
      circle(0, 0, unit * 0.58);
      [-0.28, 0, 0.28].forEach((offset, index) => {
        context.beginPath();
        context.moveTo(-unit * 0.42, unit * offset);
        context.bezierCurveTo(
          -unit * 0.12,
          unit * (offset + (index === 1 ? -0.08 : 0.08)),
          unit * 0.12,
          unit * (offset + (index === 1 ? 0.08 : -0.08)),
          unit * 0.42,
          unit * offset
        );
        stroke();
      });
      break;
    case "Mercury":
      circle(0, 0, unit * 0.6);
      circle(-unit * 0.24, -unit * 0.2, unit * 0.11);
      circle(unit * 0.18, -unit * 0.18, unit * 0.08);
      circle(unit * 0.18, unit * 0.18, unit * 0.1);
      circle(-unit * 0.22, unit * 0.2, unit * 0.07);
      circle(unit * 0.02, unit * 0.02, unit * 0.055);
      break;
    case "Jupiter":
      circle(0, 0, unit * 0.62);
      [-0.3, -0.08, 0.14, 0.36].forEach((offset) => {
        context.beginPath();
        context.moveTo(-unit * 0.52, unit * offset);
        context.bezierCurveTo(-unit * 0.18, unit * (offset - 0.08), unit * 0.18, unit * (offset + 0.08), unit * 0.52, unit * offset);
        stroke();
      });
      context.beginPath();
      context.ellipse(unit * 0.22, unit * 0.16, unit * 0.18, unit * 0.1, -0.18, 0, Math.PI * 2);
      stroke();
      break;
    case "Saturn":
      circle(0, 0, unit * 0.42);
      context.save();
      context.rotate(-0.28);
      context.scale(1, 0.34);
      context.beginPath();
      context.arc(0, 0, unit * 0.84, 0, Math.PI * 2);
      stroke();
      context.beginPath();
      context.arc(0, 0, unit * 0.58, 0, Math.PI * 2);
      stroke();
      context.restore();
      break;
    case "Uranus":
      context.strokeStyle = colors.interactiveStroke || colors.stroke;
      context.fillStyle = colors.interactiveHighlight || colors.fill;
      context.shadowColor = colors.interactiveGlow || colors.shadow;
      context.shadowBlur = size * 0.36;
      context.lineWidth = Math.max(1, size * 0.07);
      context.beginPath();
      context.arc(0, 0, unit * 0.78, 0, Math.PI * 2);
      stroke();
      context.beginPath();
      context.arc(0, 0, unit * 0.5, 0, Math.PI * 2);
      stroke();
      context.shadowBlur = 0;
      context.lineWidth = Math.max(1, size * 0.08);
      line(0, -unit * 0.02, 0, unit * 0.32);
      context.beginPath();
      context.arc(0, -unit * 0.34, Math.max(1.6, unit * 0.08), 0, Math.PI * 2);
      context.fill();
      break;
    default:
      break;
  }

  context.restore();
};

const drawUranusQuestPrompt = (context, x, y, size, maxWidth, colors, options = {}) => {
  const iconSize = size * 1.02;
  const textSize = size * 0.64;
  const gap = size * 0.12;
  const label = "QUEST";

  context.save();
  context.font = `600 ${textSize}px "Share Tech Mono", monospace`;
  context.textAlign = "left";
  context.textBaseline = "middle";

  const textWidth = context.measureText(label).width;
  const totalWidth = iconSize + gap + textWidth;
  const scale = Math.min(options.isCompact ? 0.76 : 1, maxWidth ? maxWidth / totalWidth : 1);

  context.translate(x, y);
  context.scale(scale, scale);

  drawPlanetGlyph(context, -(totalWidth / 2) + (iconSize / 2), 0, iconSize, { name: "Uranus" }, {
    fill: colors.text,
    interactiveGlow: colors.glow,
    interactiveHighlight: colors.alert,
    interactiveStroke: colors.accent,
    shadow: colors.glow,
    stroke: colors.accent
  });

  context.shadowColor = colors.glow;
  context.shadowBlur = textSize * 0.24;
  context.fillStyle = colors.accent;
  context.fillText(label, -(totalWidth / 2) + iconSize + gap, textSize * 0.04);
  context.restore();
};

const getTopCenteredLastSegmentRotation = (count) => {
  const segmentAngle = (Math.PI * 2) / count;
  return -Math.PI / 2 - ((count - 0.5) * segmentAngle);
};

const getCelestialRingColors = (paletteName, segmentIndex) => {
  const palettes = {
    moon: [
      "rgba(246, 248, 244, 0.6)",
      "rgba(185, 190, 188, 0.52)",
      "rgba(250, 251, 246, 0.66)"
    ],
    sun: [
      "rgba(255, 226, 92, 0.72)",
      "rgba(255, 181, 45, 0.58)",
      "rgba(255, 247, 174, 0.72)"
    ]
  };
  const palette = palettes[paletteName];

  if (!palette) return null;

  return {
    alpha: 0.72,
    border: paletteName === "moon" ? "rgba(245, 248, 246, 0.34)" : "",
    borderGlow: paletteName === "moon" ? "rgba(245, 248, 246, 0.18)" : "",
    end: palette[(segmentIndex + 1) % palette.length],
    glow: paletteName === "sun"
      ? "rgba(255, 213, 74, 0.14)"
      : "rgba(245, 248, 246, 0.1)",
    start: palette[segmentIndex % palette.length]
  };
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
    innerRadius,
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
    const isQuarter = index % 6 === 0;
    const startRadius = outerRadius;
    const endRadius = outerRadius - (ringWidth * (isQuarter ? 0.34 : 0.22));

    context.lineWidth = Math.max(1, ringWidth * (isQuarter ? 0.024 : 0.015));
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
  }

  context.restore();
};

const drawRing = (context, metrics, options) => {
  const {
    count,
    labels,
    innerRadius,
    outerRadius,
    questTextColor,
    stroke,
    textColor,
    styledSegmentColors,
    styledSegmentIndices = [],
    tickCount = 0,
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
      innerRadius,
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
      const textSize = Math.max(11, (outerRadius - innerRadius) * 0.36);
      const isCompactCanvas = metrics.size < 520 || window.matchMedia("(max-width: 640px)").matches;
      const labelTextSize = Math.max(13, textSize * (isCompactCanvas ? 1.45 : 1.72));
      const segmentChord = 2 * labelRadius * Math.sin(segmentAngle / 2);

      if (label.name) {
        const isUranus = label.name === "Uranus";

        if (isUranus) {
          const promptInset = (outerRadius - innerRadius) * 0.06;
          const promptX = labelX - (Math.cos(middleAngle) * promptInset);
          const promptY = labelY - (Math.sin(middleAngle) * promptInset);

          drawUranusQuestPrompt(context, promptX, promptY, labelTextSize, segmentChord * (isCompactCanvas ? 0.62 : 0.92), {
            accent: "rgba(124, 255, 120, 0.92)",
            alert: "rgba(232, 255, 90, 0.84)",
            glow: "rgba(124, 255, 120, 0.42)",
            text: questTextColor || textColor
          }, {
            isCompact: isCompactCanvas
          });
        } else {
          drawPlanetGlyph(context, labelX, labelY, labelTextSize, label, {
            fill: textColor,
            shadow: "rgba(255, 255, 255, 0.42)",
            stroke: "rgba(5, 21, 25, 0.7)"
          });
        }
      } else {
        drawCenteredText(
          context,
          String(label),
          labelX,
          labelY,
          labelTextSize,
          textColor,
          showBorders ? {} : {
            fontFamily: "\"Segoe UI Symbol\", \"Noto Sans Symbols\", \"DejaVu Sans\", sans-serif",
            shadowBlur: 10,
            shadowColor: "rgba(255, 255, 255, 0.1)",
            maxWidth: segmentChord * 0.66,
            rotation: Math.PI / 2,
            strokeColor: "rgba(255, 255, 255, 0.1)",
            strokeWidth: Math.max(1, labelTextSize * 0.018),
            weight: 500
          }
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

const drawElementIcon = (context, x, y, size, element, colors, options = {}) => {
  const unit = size / 2;
  const motion = options.motion || 0;

  context.save();
  context.translate(x, y);
  context.lineWidth = Math.max(1, size * 0.055);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = colors.stroke;
  context.fillStyle = colors.fill;
  context.shadowColor = colors.shadow;
  context.shadowBlur = size * 0.12;

  switch (element) {
    case "Wind":
      [-0.36, 0, 0.34].forEach((offset, index) => {
        context.beginPath();
        context.moveTo(-unit * 0.78, unit * offset);
        context.bezierCurveTo(
          -unit * 0.24,
          unit * (offset - 0.26),
          unit * 0.24,
          unit * (offset + 0.26),
          unit * (index === 1 ? 0.74 : 0.52),
          unit * offset
        );
        context.stroke();
      });
      break;
    case "Fire":
      context.lineWidth = Math.max(1, size * 0.07);
      context.beginPath();
      context.moveTo(-unit * 0.48, unit * 0.68);
      context.bezierCurveTo(-unit * 0.18, unit * 0.24, -unit * 0.2, -unit * 0.3, unit * 0.02, -unit * 0.86);
      context.bezierCurveTo(unit * 0.16, -unit * 0.48, unit * 0.58, -unit * 0.14, unit * 0.44, unit * 0.28);
      context.bezierCurveTo(unit * 0.34, unit * 0.56, unit * 0.08, unit * 0.74, -unit * 0.2, unit * 0.72);
      context.stroke();
      context.beginPath();
      context.moveTo(unit * 0.02, unit * 0.5);
      context.bezierCurveTo(-unit * 0.14, unit * 0.18, unit * 0.02, -unit * 0.1, unit * 0.18, -unit * 0.32);
      context.bezierCurveTo(unit * 0.26, -unit * 0.04, unit * 0.26, unit * 0.28, unit * 0.02, unit * 0.5);
      context.stroke();
      break;
    case "Thunder":
      context.beginPath();
      context.moveTo(unit * 0.22, -unit * 0.9);
      context.lineTo(-unit * 0.32, -unit * 0.05);
      context.lineTo(unit * 0.06, -unit * 0.05);
      context.lineTo(-unit * 0.22, unit * 0.9);
      context.lineTo(unit * 0.48, -unit * 0.22);
      context.lineTo(unit * 0.12, -unit * 0.22);
      context.closePath();
      context.fill();
      break;
    case "Earth":
      context.lineWidth = Math.max(1, size * 0.06);
      [
        [-0.58, -0.48, 0.38, -0.48],
        [-0.72, -0.08, 0.58, -0.08],
        [-0.5, 0.32, 0.74, 0.32],
        [-0.66, 0.7, 0.46, 0.7]
      ].forEach(([startX, startY, endX, endY]) => {
        context.beginPath();
        context.moveTo(unit * startX, unit * startY);
        context.lineTo(unit * endX, unit * endY);
        context.stroke();
      });
      context.beginPath();
      context.moveTo(-unit * 0.58, -unit * 0.48);
      context.lineTo(-unit * 0.72, -unit * 0.08);
      context.moveTo(unit * 0.38, -unit * 0.48);
      context.lineTo(unit * 0.58, -unit * 0.08);
      context.moveTo(-unit * 0.5, unit * 0.32);
      context.lineTo(-unit * 0.66, unit * 0.7);
      context.moveTo(unit * 0.74, unit * 0.32);
      context.lineTo(unit * 0.46, unit * 0.7);
      context.stroke();
      break;
    case "Dao":
      context.strokeStyle = colors.interactiveStroke;
      context.shadowColor = colors.interactiveGlow;
      context.shadowBlur = size * (0.16 + (motion * 0.12));
      context.lineWidth = Math.max(1, size * 0.07);
      context.beginPath();
      context.arc(0, 0, unit * (0.92 + (motion * 0.06)), 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, unit * 0.58, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, unit * 0.26, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.strokeStyle = colors.interactiveHighlight;
      context.lineWidth = Math.max(1, size * 0.045);
      context.beginPath();
      context.arc(0, 0, unit * 0.76, Math.PI * 1.12, Math.PI * 1.72);
      context.stroke();
      break;
    case "Mountain":
      context.beginPath();
      context.moveTo(-unit * 0.84, unit * 0.68);
      context.lineTo(-unit * 0.22, -unit * 0.74);
      context.lineTo(unit * 0.08, -unit * 0.12);
      context.lineTo(unit * 0.36, -unit * 0.52);
      context.lineTo(unit * 0.84, unit * 0.68);
      context.closePath();
      context.stroke();
      break;
    case "Lake":
      context.beginPath();
      context.arc(0, -unit * 0.1, unit * 0.62, 0.12 * Math.PI, 0.88 * Math.PI);
      context.stroke();
      [-0.22, 0.12, 0.42].forEach((offset) => {
        context.beginPath();
        context.moveTo(-unit * 0.62, unit * offset);
        context.bezierCurveTo(-unit * 0.28, unit * (offset + 0.14), unit * 0.28, unit * (offset - 0.14), unit * 0.62, unit * offset);
        context.stroke();
      });
      break;
    case "Water":
      context.beginPath();
      context.moveTo(0, -unit * 0.88);
      context.bezierCurveTo(unit * 0.58, -unit * 0.1, unit * 0.56, unit * 0.74, 0, unit * 0.82);
      context.bezierCurveTo(-unit * 0.56, unit * 0.74, -unit * 0.58, -unit * 0.1, 0, -unit * 0.88);
      context.stroke();
      break;
    case "Heaven":
      [
        [-0.42, -0.3, 0.2],
        [0.3, -0.44, 0.16],
        [0.46, 0.24, 0.18],
        [-0.18, 0.44, 0.14]
      ].forEach(([starX, starY, radius]) => {
        const centerX = unit * starX;
        const centerY = unit * starY;
        const outer = unit * radius;
        const verticalOuter = outer * 1.22;
        const inner = outer * 0.32;
        const verticalInner = inner * 1.12;

        context.beginPath();
        context.moveTo(centerX, centerY - verticalOuter);
        context.lineTo(centerX + inner, centerY - verticalInner);
        context.lineTo(centerX + outer, centerY);
        context.lineTo(centerX + inner, centerY + verticalInner);
        context.lineTo(centerX, centerY + verticalOuter);
        context.lineTo(centerX - inner, centerY + verticalInner);
        context.lineTo(centerX - outer, centerY);
        context.lineTo(centerX - inner, centerY - verticalInner);
        context.closePath();
        context.fill();
        context.stroke();

        context.beginPath();
        context.arc(centerX, centerY, Math.max(1, outer * 0.16), 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 0.48;
      [
        [-0.66, 0.02, 0.08],
        [0.04, -0.04, 0.06],
        [0.12, 0.52, 0.055]
      ].forEach(([dotX, dotY, radius]) => {
        context.beginPath();
        context.arc(unit * dotX, unit * dotY, unit * radius, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
      break;
    default:
      break;
  }

  context.restore();
};

const drawSquare = (context, metrics, colors, options = {}) => {
  const start = metrics.center - (metrics.squareSize / 2);
  const cellSize = metrics.squareSize / SQUARE_GRID_SIZE;

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
      const element = TENKI_ELEMENTS[number];
      const centerX = start + (column * cellSize) + (cellSize / 2);
      const centerY = start + (row * cellSize) + (cellSize / 2);

      if (number === 5) {
        drawElementIcon(
          context,
          centerX,
          centerY,
          cellSize * 0.52,
          element,
          colors.icon,
          {
            motion: 0
          }
        );
      } else {
        drawCenteredText(
          context,
          TENKI_TRIGRAMS[number],
          centerX,
          centerY,
          cellSize * 0.36,
          colors.trigram.fill,
          {
            fontFamily: "\"Segoe UI Symbol\", \"Noto Sans Symbols\", \"DejaVu Sans\", sans-serif",
            maxWidth: cellSize * 0.66,
            shadowBlur: 10,
            shadowColor: colors.trigram.shadow,
            strokeColor: colors.trigram.stroke,
            strokeWidth: Math.max(1, cellSize * 0.018),
            weight: 500
          }
        );
      }
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
  const motion = 0;

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
      questTextColor: accent,
      stroke: isSoft ? borderColors.ringSoft : borderColors.ring,
      textColor: index === STYLED_RING_INDEX ? "rgba(5, 21, 25, 0.44)" : "rgba(47, 42, 79, 0.74)",
      styledSegmentColors: (segmentIndex) => {
        const celestialColors = getCelestialRingColors(ring.palette, segmentIndex);

        if (celestialColors) {
          return celestialColors;
        }

        const colors = {
          ...getSquareCellPaletteColors(segmentIndex, palette),
          alpha: SURFACE_FILL_ALPHA,
          glow: `rgba(${accentSoftRgb}, 0.14)`
        };

        if (segmentIndex === URANUS_SEGMENT_INDEX) {
          colors.border = "rgba(124, 255, 120, 0.92)";
          colors.borderGlow = "rgba(124, 255, 120, 0.42)";
          colors.transparent = true;
        }

        return colors;
      },
      showBorders: index !== STYLED_RING_INDEX,
      showDividers: !ring.palette && index !== STYLED_RING_INDEX,
      styledSegmentIndices: index === STYLED_RING_INDEX || ring.palette ? getSegmentIndices(ring.count) : [],
      tickCount: ring.tickCount || 0,
      tickStroke: ring.palette === "moon" ? "rgba(245, 248, 246, 0.38)" : "rgba(255, 247, 174, 0.42)",
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
    icon: {
      fill: "rgba(5, 21, 25, 0.58)",
      interactiveGlow: "rgba(124, 255, 120, 0.42)",
      interactiveHighlight: "rgba(232, 255, 90, 0.84)",
      interactiveStroke: "rgba(124, 255, 120, 0.92)",
      shadow: "rgba(255, 255, 255, 0.18)",
      stroke: "rgba(5, 21, 25, 0.68)"
    },
    trigram: {
      fill: "rgba(5, 21, 25, 0.44)",
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
  }, {
    motion
  });
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
};

initTenki();
