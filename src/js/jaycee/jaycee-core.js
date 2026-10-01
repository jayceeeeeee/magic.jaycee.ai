import {
  MAIN_CORE_RING_LANGUAGE,
  loadJayceeLanguage
} from "./jaycee-language.js";

const RING_SEGMENT_COUNT = 9;
const SQUARE_GRID_SIZE = 3;
export const JAYCEE_ORDER = [1, 2, 4, 3, 5, 7, 6, 8, 9];
const ACTIVE_CORE_SEGMENT_INDEX = JAYCEE_ORDER.indexOf(9);
const ACTIVE_FILL_ALPHA = 0.255;
const CONSOLE_TYPING_SPEED = 18;
const CONSOLE_LINE_PAUSE = 90;
const SURFACE_FILL_ALPHA = 0.86;
const STYLED_RING_INDEX = 0;
const CORE_RING_MAX_RADIAL_SHARE = 0.46;
const CORE_RING_WIDTH_MAX = 58;
const CORE_RING_WIDTH_MIN = 18;
const CORE_RING_WIDTH_RATIO = 0.11;
const getSegmentIndices = (count) => Array.from({ length: count }, (_, index) => index);
const THEME_PALETTE_MIXES = {
  bottomLeft: 0.08,
  bottomRight: 0.24,
  topLeft: 0.08,
  topRight: 0.24
};
const getEmptyLabels = (count) => Array.from({ length: count }, () => "");
const RING_TEMPLATES = [
  {
    count: RING_SEGMENT_COUNT,
    getLabels: ({ coreRingLabels }) => coreRingLabels,
    tone: "accent"
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
  const toHex = (channel) => (
    Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, "0")
  );

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

const getSquarePaletteColor = (column, row, palette, gridSize = SQUARE_GRID_SIZE) => {
  const x = column / gridSize;
  const y = row / gridSize;
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

const typeJayceeConsoleLine = async (line) => {
  if (!line) return;

  const message = line.dataset.jayceeConsoleLine || "";
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

const getCanvasMetrics = (canvas, ringCount, options = {}) => {
  const rect = canvas.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  const center = size / 2;
  const safeRingCount = Math.max(1, ringCount);
  const mapSquareGridSize = Math.max(1, Number(options.mapSquareGridSize) || 1);
  const mapSquareCoreSpan = mapSquareGridSize % 2 === 0 ? 2 : 1;
  const padding = Math.max(14, size * 0.035);
  const outerRadius = center - padding;
  const ringWidthMax = options.ringWidthMax ?? CORE_RING_WIDTH_MAX;
  const ringWidthMin = options.ringWidthMin ?? CORE_RING_WIDTH_MIN;
  const ringWidthRatio = options.ringWidthRatio ?? CORE_RING_WIDTH_RATIO;
  const ringMaxRadialShare = options.ringMaxRadialShare ?? CORE_RING_MAX_RADIAL_SHARE;
  const preferredRingWidth = Math.min(
    ringWidthMax,
    Math.max(ringWidthMin, size * ringWidthRatio)
  );
  const ringWidth = Math.min(
    preferredRingWidth,
    (outerRadius * ringMaxRadialShare) / safeRingCount
  );
  const squareOuterRadius = outerRadius - (ringWidth * safeRingCount);
  const mapSquareSize = (squareOuterRadius * 2) / Math.SQRT2;
  const mapSquareCellSize = mapSquareSize / mapSquareGridSize;
  const squareSize = mapSquareCellSize * mapSquareCoreSpan;

  return {
    center,
    mapSquareCellSize,
    mapSquareCoreSpan,
    mapSquareGridSize,
    mapSquareSize,
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

export const getTopCenteredLastSegmentRotation = (count) => {
  const segmentAngle = (Math.PI * 2) / count;
  return -Math.PI / 2 - ((count - 0.5) * segmentAngle);
};

export const getTopCenteredSegmentRotation = (count, centeredIndex = 0) => {
  const segmentAngle = (Math.PI * 2) / count;
  return -Math.PI / 2 - ((centeredIndex + 0.5) * segmentAngle);
};

const drawRingSegmentPanel = (context, metrics, segment, colors) => {
  const isFullCircle = Math.abs(segment.endAngle - segment.startAngle) >= (Math.PI * 2) - 0.0001;
  const middleAngle = segment.startAngle + ((segment.endAngle - segment.startAngle) / 2);
  const middleRadius = segment.innerRadius + ((segment.outerRadius - segment.innerRadius) / 2);
  const segmentCenterX = metrics.center + (Math.cos(middleAngle) * middleRadius);
  const segmentCenterY = metrics.center + (Math.sin(middleAngle) * middleRadius);
  const gradient = colors.gradientMode === "radial"
    ? context.createRadialGradient(
      segmentCenterX,
      segmentCenterY,
      0,
      segmentCenterX,
      segmentCenterY,
      Math.max(1, (segment.outerRadius - segment.innerRadius) * 0.92)
    )
    : context.createLinearGradient(
      metrics.center + Math.cos(segment.startAngle) * segment.innerRadius,
      metrics.center + Math.sin(segment.startAngle) * segment.innerRadius,
      metrics.center + Math.cos(segment.endAngle) * segment.outerRadius,
      metrics.center + Math.sin(segment.endAngle) * segment.outerRadius
    );

  gradient.addColorStop(0, colors.start);
  if (colors.centerStop) {
    gradient.addColorStop(colors.centerStop, colors.start);
  }
  if (colors.middle) {
    gradient.addColorStop(colors.middleStop || 0.52, colors.middle);
  }
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
  context.globalAlpha = colors.transparent ? (colors.transparentAlpha ?? ACTIVE_FILL_ALPHA) : (colors.alpha ?? 1);
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
    const strokeSegmentBorder = () => {
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
    };
    if (colors.borderUnderlay) {
      context.shadowColor = colors.borderUnderlayGlow || colors.borderUnderlay;
      context.shadowBlur = (segment.outerRadius - segment.innerRadius) * 0.28;
      context.strokeStyle = colors.borderUnderlay;
      context.lineWidth = Math.max(2.4, (segment.outerRadius - segment.innerRadius) * 0.075);
      strokeSegmentBorder();
    }

    context.shadowColor = colors.borderGlow || colors.border;
    context.shadowBlur = (segment.outerRadius - segment.innerRadius) * 0.28;
    context.strokeStyle = colors.border;
    context.lineWidth = Math.max(1.6, (segment.outerRadius - segment.innerRadius) * 0.038);
    strokeSegmentBorder();
  }

  context.restore();
};

const drawCoverImage = (context, image, x, y, width, height) => {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  const drawWidth = imageRatio > targetRatio ? height * imageRatio : width;
  const drawHeight = imageRatio > targetRatio ? height : width / imageRatio;
  const drawX = x + ((width - drawWidth) / 2);
  const drawY = y + ((height - drawHeight) / 2);

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
};

const drawRingImage = (context, metrics, image, innerRadius, outerRadius, alpha = 1) => {
  if (!image) return;

  context.save();
  context.beginPath();
  context.arc(metrics.center, metrics.center, outerRadius, 0, Math.PI * 2);
  context.arc(metrics.center, metrics.center, innerRadius, Math.PI * 2, 0, true);
  context.closePath();
  context.clip();
  context.globalAlpha = alpha;
  drawCoverImage(
    context,
    image,
    metrics.center - outerRadius,
    metrics.center - outerRadius,
    outerRadius * 2,
    outerRadius * 2
  );
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

const drawRingPresentMarker = (context, metrics, options) => {
  const {
    angle,
    color = "rgba(255, 38, 38, 0.98)",
    innerRadius,
    outerRadius
  } = options;
  const ringWidth = outerRadius - innerRadius;
  const innerX = metrics.center + (Math.cos(angle) * innerRadius);
  const innerY = metrics.center + (Math.sin(angle) * innerRadius);
  const outerX = metrics.center + (Math.cos(angle) * outerRadius);
  const outerY = metrics.center + (Math.sin(angle) * outerRadius);

  context.save();
  context.lineCap = "round";
  context.shadowColor = "rgba(0, 0, 0, 0.72)";
  context.shadowBlur = ringWidth * 0.18;
  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.lineWidth = Math.max(3, ringWidth * 0.13);
  context.beginPath();
  context.moveTo(innerX, innerY);
  context.lineTo(outerX, outerY);
  context.stroke();
  context.shadowColor = "rgba(255, 38, 38, 0.76)";
  context.shadowBlur = ringWidth * 0.18;
  context.strokeStyle = color;
  context.lineWidth = Math.max(1.7, ringWidth * 0.075);
  context.beginPath();
  context.moveTo(innerX, innerY);
  context.lineTo(outerX, outerY);
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
    backgroundImage,
    backgroundImageAlpha = 1,
    styledSegmentColors,
    styledSegmentIndices = [],
    activeLabelIndex = -1,
    getTickLabel,
    tickCount = 0,
    tickLabelColor,
    tickStroke,
    presentMarkerAngle,
    presentMarkerColor,
    showBorders = true,
    showDividers = showBorders,
    subDividerStroke,
    subSegmentCount = 0,
    rotation = -Math.PI / 2
  } = options;
  const segmentAngle = (Math.PI * 2) / count;
  const labelRadius = innerRadius + ((outerRadius - innerRadius) / 2);
  const ringWidth = outerRadius - innerRadius;
  const hasBackgroundImage = Boolean(backgroundImage);
  const ringStroke = hasBackgroundImage ? "rgba(255, 255, 255, 0.96)" : stroke;
  const dividerStroke = hasBackgroundImage ? "rgba(255, 255, 255, 0.98)" : stroke;
  const dividerUnderlay = "rgba(0, 0, 0, 0.82)";

  const strokeWithUnderlay = (drawPath, foreground, underlayWidth, foregroundWidth) => {
    if (hasBackgroundImage) {
      context.shadowColor = "rgba(0, 0, 0, 0.75)";
      context.shadowBlur = ringWidth * 0.1;
      context.strokeStyle = dividerUnderlay;
      context.lineWidth = underlayWidth;
      drawPath();
    }

    context.shadowColor = hasBackgroundImage ? "rgba(0, 0, 0, 0.38)" : "transparent";
    context.shadowBlur = hasBackgroundImage ? ringWidth * 0.04 : 0;
    context.strokeStyle = foreground;
    context.lineWidth = foregroundWidth;
    drawPath();
  };
  const drawStyledSegments = () => {
    if (!styledSegmentColors) return;

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
  };

  context.save();
  context.lineWidth = 1;
  context.strokeStyle = ringStroke;
  context.shadowColor = "transparent";
  context.shadowBlur = 0;

  drawRingImage(context, metrics, backgroundImage, innerRadius, outerRadius, backgroundImageAlpha);

  if (!hasBackgroundImage) {
    drawStyledSegments();
  }

  if (showBorders) {
    strokeWithUnderlay(() => {
      context.beginPath();
      context.arc(metrics.center, metrics.center, innerRadius, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(metrics.center, metrics.center, outerRadius, 0, Math.PI * 2);
      context.stroke();
    }, ringStroke, Math.max(2.4, ringWidth * 0.06), 1);
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

  if (subSegmentCount > 1) {
    const subSegmentAngle = segmentAngle / subSegmentCount;
    const subStroke = hasBackgroundImage
      ? "rgba(255, 255, 255, 0.38)"
      : (subDividerStroke || stroke);

    context.save();
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.strokeStyle = subStroke;
    context.lineWidth = Math.max(0.8, ringWidth * 0.014);

    for (let segmentIndex = 0; segmentIndex < count; segmentIndex += 1) {
      for (let subIndex = 1; subIndex < subSegmentCount; subIndex += 1) {
        const angle = rotation + (segmentIndex * segmentAngle) + (subIndex * subSegmentAngle);

        context.beginPath();
        context.moveTo(
          metrics.center + Math.cos(angle) * innerRadius,
          metrics.center + Math.sin(angle) * innerRadius
        );
        context.lineTo(
          metrics.center + Math.cos(angle) * outerRadius,
          metrics.center + Math.sin(angle) * outerRadius
        );
        context.stroke();
      }
    }

    context.restore();
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
      strokeWithUnderlay(() => {
        context.beginPath();
        context.moveTo(dividerInnerX, dividerInnerY);
        context.lineTo(dividerX, dividerY);
        context.stroke();
      }, dividerStroke, Math.max(2.2, ringWidth * 0.052), 1);
    }

    if (label) {
      const isCoreRing = !showBorders;
      const isActiveLabel = index === activeLabelIndex;
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
        isActiveLabel ? ACTIVE_CORE_TEXT_COLOR : textColor,
        showBorders ? {} : {
          fontFamily: CORE_NUMBER_FONT,
          shadowBlur: 10,
          shadowColor: isActiveLabel ? "rgba(124, 255, 120, 0.38)" : "rgba(255, 255, 255, 0.1)",
          maxWidth: segmentChord * (isCompact ? 0.34 : 0.42),
          strokeColor: isActiveLabel ? "rgba(5, 21, 25, 0.32)" : "rgba(255, 255, 255, 0.1)",
          strokeWidth: Math.max(0.7, labelTextSize * 0.014),
          weight: 500
        }
      );
    }
  });

  if (hasBackgroundImage) {
    drawStyledSegments();
  }

  if (Number.isFinite(presentMarkerAngle)) {
    drawRingPresentMarker(context, metrics, {
      angle: presentMarkerAngle,
      color: presentMarkerColor,
      innerRadius,
      outerRadius
    });
  }

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

const getMapSquareLabelSize = (cellSize, metrics) => {
  const isCompact = metrics.size < 420;

  return Math.min(
    cellSize * 0.24,
    Math.max(isCompact ? 8 : 11, metrics.ringWidth * (isCompact ? 0.23 : 0.3))
  );
};

const drawMapSquare = (context, metrics, colors, mapSquare) => {
  if (!mapSquare || metrics.mapSquareGridSize <= 1) return;

  const gridSize = metrics.mapSquareGridSize;
  const start = metrics.center - (metrics.mapSquareSize / 2);
  const cellSize = metrics.mapSquareCellSize;
  const labelSize = getMapSquareLabelSize(cellSize, metrics);
  const centerStart = (gridSize - metrics.mapSquareCoreSpan) / 2;
  const centerEnd = centerStart + metrics.mapSquareCoreSpan;
  const selectedPosition = Number(mapSquare.selectedPosition);
  const hasBackgroundImage = Boolean(mapSquare.backgroundImage);
  let activeCell = null;

  const strokeSquareLine = (drawPath, foreground, underlayWidth = 2.4) => {
    if (hasBackgroundImage) {
      context.shadowColor = "rgba(0, 0, 0, 0.72)";
      context.shadowBlur = cellSize * 0.08;
      context.strokeStyle = "rgba(0, 0, 0, 0.82)";
      context.lineWidth = underlayWidth;
      drawPath();
    }

    context.shadowColor = hasBackgroundImage ? "rgba(0, 0, 0, 0.34)" : "transparent";
    context.shadowBlur = hasBackgroundImage ? cellSize * 0.035 : 0;
    context.strokeStyle = foreground;
    context.lineWidth = 1;
    drawPath();
  };

  context.save();
  context.shadowColor = colors.glow;
  context.shadowBlur = 18;

  if (hasBackgroundImage) {
    context.save();
    context.beginPath();
    context.rect(start, start, metrics.mapSquareSize, metrics.mapSquareSize);
    context.clip();
    drawCoverImage(context, mapSquare.backgroundImage, start, start, metrics.mapSquareSize, metrics.mapSquareSize);
    context.restore();
  }

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const position = (row * gridSize) + column + 1;
      const isSelected = position === selectedPosition;
      const x = start + (column * cellSize);
      const y = start + (row * cellSize);

      drawGradientSquareCell(
        context,
        x,
        y,
        cellSize,
        {
          start: getSquarePaletteColor(column, row, colors.palette, gridSize),
          end: getSquarePaletteColor(column + 1, row + 1, colors.palette, gridSize),
          alpha: hasBackgroundImage
            ? (isSelected ? 0.12 : 0.04)
            : (isSelected ? colors.activeFillAlpha : colors.fillAlpha)
        }
      );

      if (isSelected) {
        activeCell = { x, y };

        if (!hasBackgroundImage) {
          drawInsetSquareCell(
            context,
            activeCell.x,
            activeCell.y,
            cellSize,
            colors.inset
          );
        }
      }
    }
  }

  context.shadowBlur = 0;

  context.save();
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.strokeStyle = hasBackgroundImage ? "rgba(255, 255, 255, 0.52)" : colors.subCellBorder;
  context.lineWidth = 1;

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const x = start + (column * cellSize);
      const y = start + (row * cellSize);

      for (let index = 1; index < SQUARE_GRID_SIZE; index += 1) {
        const offset = (cellSize / SQUARE_GRID_SIZE) * index;

        context.beginPath();
        context.moveTo(x + offset, y);
        context.lineTo(x + offset, y + cellSize);
        context.moveTo(x, y + offset);
        context.lineTo(x + cellSize, y + offset);
        context.stroke();
      }
    }
  }

  context.restore();

  for (let index = 1; index < gridSize; index += 1) {
    const offset = start + (cellSize * index);

    strokeSquareLine(() => {
      context.beginPath();
      context.moveTo(offset, start);
      context.lineTo(offset, start + metrics.mapSquareSize);
      context.moveTo(start, offset);
      context.lineTo(start + metrics.mapSquareSize, offset);
      context.stroke();
    }, hasBackgroundImage ? "rgba(255, 255, 255, 0.96)" : colors.cellBorder);
  }

  strokeSquareLine(() => {
    context.strokeRect(start, start, metrics.mapSquareSize, metrics.mapSquareSize);
  }, hasBackgroundImage ? "rgba(255, 255, 255, 0.98)" : colors.border, 3);

  if (hasBackgroundImage && activeCell) {
    drawInsetSquareCell(
      context,
      activeCell.x,
      activeCell.y,
      cellSize,
      {
        ...colors.inset,
        border: "rgba(0, 255, 72, 1)",
        borderGlow: "rgba(0, 255, 72, 0.95)",
        shadow: "rgba(0, 18, 4, 0.96)"
      }
    );
  }

  if (hasBackgroundImage) {
    context.restore();
    return;
  }

  mapSquare.labels.forEach((label, index) => {
    if (!label) return;

    const row = Math.floor(index / gridSize);
    const column = index % gridSize;

    if (row >= centerStart && row < centerEnd && column >= centerStart && column < centerEnd) return;

    drawCenteredText(
      context,
      String(label),
      start + (column * cellSize) + (cellSize / 2),
      start + (row * cellSize) + (cellSize / 2),
      labelSize,
      colors.coreText.fill,
      {
        fontFamily: CORE_NUMBER_FONT,
        maxWidth: cellSize * 0.72,
        shadowBlur: 8,
        shadowColor: colors.coreText.shadow,
        strokeColor: colors.coreText.stroke,
        strokeWidth: Math.max(1, labelSize * 0.08),
        weight: 750
      }
    );
  });

  context.restore();
};

const drawSquare = (context, metrics, colors, labels = getEmptyLabels(RING_SEGMENT_COUNT)) => {
  const start = metrics.center - (metrics.squareSize / 2);
  const cellSize = metrics.squareSize / SQUARE_GRID_SIZE;
  const isCompact = metrics.size < 420;
  const numberSize = Math.min(
    cellSize * 0.24,
    Math.max(isCompact ? 9 : 13, metrics.ringWidth * (isCompact ? 0.28 : 0.38))
  );
  const hasBackgroundImage = Boolean(colors.backgroundImage);
  let activeCell = null;

  const strokeSquareLine = (drawPath, foreground, underlayWidth = 2.4) => {
    if (hasBackgroundImage) {
      context.shadowColor = "rgba(0, 0, 0, 0.72)";
      context.shadowBlur = cellSize * 0.08;
      context.strokeStyle = "rgba(0, 0, 0, 0.82)";
      context.lineWidth = underlayWidth;
      drawPath();
    }

    context.shadowColor = hasBackgroundImage ? "rgba(0, 0, 0, 0.34)" : "transparent";
    context.shadowBlur = hasBackgroundImage ? cellSize * 0.035 : 0;
    context.strokeStyle = foreground;
    context.lineWidth = 1;
    drawPath();
  };

  context.save();
  context.shadowColor = colors.glow;
  context.shadowBlur = 18;

  if (colors.backgroundImage) {
    context.save();
    context.beginPath();
    context.rect(start, start, metrics.squareSize, metrics.squareSize);
    context.clip();
    drawCoverImage(context, colors.backgroundImage, start, start, metrics.squareSize, metrics.squareSize);
    context.restore();
  }

  for (let row = 0; row < SQUARE_GRID_SIZE; row += 1) {
    for (let column = 0; column < SQUARE_GRID_SIZE; column += 1) {
      const orderIndex = (row * SQUARE_GRID_SIZE) + column;

      if (JAYCEE_ORDER[orderIndex] !== colors.activeSquareNumber) {
        drawGradientSquareCell(
          context,
          start + (column * cellSize),
          start + (row * cellSize),
          cellSize,
          {
            start: getSquarePaletteColor(column, row, colors.palette),
            end: getSquarePaletteColor(column + 1, row + 1, colors.palette),
            alpha: colors.backgroundImage ? 0.08 : (colors.fillAlpha ?? 1)
          }
        );
      } else {
        activeCell = {
          x: start + (column * cellSize),
          y: start + (row * cellSize)
        };
        drawGradientSquareCell(
          context,
          activeCell.x,
          activeCell.y,
          cellSize,
          {
            start: getSquarePaletteColor(column, row, colors.palette),
            end: getSquarePaletteColor(column + 1, row + 1, colors.palette),
            alpha: colors.backgroundImage ? 0.1 : (colors.activeFillAlpha ?? ACTIVE_FILL_ALPHA)
          }
        );

        if (!hasBackgroundImage) {
          drawInsetSquareCell(
            context,
            activeCell.x,
            activeCell.y,
            cellSize,
            colors.inset
          );
        }
      }
    }
  }

  for (let row = 0; row < SQUARE_GRID_SIZE; row += 1) {
    for (let column = 0; column < SQUARE_GRID_SIZE; column += 1) {
      const orderIndex = (row * SQUARE_GRID_SIZE) + column;
      const number = JAYCEE_ORDER[orderIndex];
      const label = labels[orderIndex];
      const centerX = start + (column * cellSize) + (cellSize / 2);
      const centerY = start + (row * cellSize) + (cellSize / 2);

      if (label) {
        drawCenteredText(
          context,
          label,
          centerX,
          centerY,
          numberSize,
          number === colors.activeSquareNumber ? ACTIVE_CORE_TEXT_COLOR : colors.coreText.fill,
          {
            fontFamily: CORE_NUMBER_FONT,
            maxWidth: cellSize * 0.76,
            shadowBlur: 10,
            shadowColor: number === colors.activeSquareNumber ? "rgba(124, 255, 120, 0.38)" : colors.coreText.shadow,
            strokeColor: number === colors.activeSquareNumber ? "rgba(5, 21, 25, 0.32)" : colors.coreText.stroke,
            strokeWidth: Math.max(1.2, numberSize * 0.08),
            weight: 800
          }
        );
      }
    }
  }

  context.shadowBlur = 0;

  for (let index = 1; index < SQUARE_GRID_SIZE; index += 1) {
    const offset = start + (cellSize * index);

    strokeSquareLine(() => {
      context.beginPath();
      context.moveTo(offset, start);
      context.lineTo(offset, start + metrics.squareSize);
      context.moveTo(start, offset);
      context.lineTo(start + metrics.squareSize, offset);
      context.stroke();
    }, hasBackgroundImage ? "rgba(255, 255, 255, 0.96)" : colors.cellBorder);
  }

  strokeSquareLine(() => {
    context.strokeRect(start, start, metrics.squareSize, metrics.squareSize);
  }, hasBackgroundImage ? "rgba(255, 255, 255, 0.98)" : colors.border, 3);

  if (hasBackgroundImage && activeCell) {
    drawInsetSquareCell(
      context,
      activeCell.x,
      activeCell.y,
      cellSize,
      {
        ...colors.inset,
        border: "rgba(0, 255, 72, 1)",
        borderGlow: "rgba(0, 255, 72, 0.95)",
        shadow: "rgba(0, 18, 4, 0.96)"
      }
    );
  }

  context.restore();
};

export const createJayceeState = ({
  coreRingLabels = getEmptyLabels(RING_SEGMENT_COUNT),
  coreSquareLabels = getEmptyLabels(RING_SEGMENT_COUNT),
  rings
} = {}) => ({
  coreSquareLabels,
  rings: (rings || RING_TEMPLATES).map((ring) => ({
    ...ring,
    count: ring.count || ring.segmentKeys?.length || RING_SEGMENT_COUNT,
    labels: ring.labels || ring.getLabels?.({ coreRingLabels }) || getEmptyLabels(ring.count || RING_SEGMENT_COUNT)
  }))
});

const DEFAULT_JAYCEE_STATE = createJayceeState();

export const drawJaycee = (canvas, state = DEFAULT_JAYCEE_STATE) => {
  const context = resizeCanvas(canvas);
  const rect = canvas.getBoundingClientRect();
  const metrics = getCanvasMetrics(canvas, state.rings.length, {
    ...state.metrics,
    mapSquareGridSize: state.mapSquare?.gridSize
  });
  const accent = getThemeColor("--accent", "#74f7d1");
  const accentSoft = getThemeColor("--accent-soft", "#a7ffe7");
  const accentSoftRgb = getColorRgb(accentSoft, "255, 213, 107");
  const palette = getThemePaletteCorners(accent, accentSoft);
  const borderColors = getThemeBorderColors(accent, accentSoft);
  const squareLineRgb = mixRgb(hexToRgb(accent), hexToRgb(accentSoft), 0.5);
  context.clearRect(0, 0, rect.width, rect.height);

  [...state.rings].reverse().forEach((ring, reversedIndex) => {
    const index = state.rings.length - reversedIndex - 1;
    const innerRadius = metrics.squareOuterRadius + (metrics.ringWidth * index);
    const outerRadius = innerRadius + metrics.ringWidth;
    const isSoft = ring.tone === "soft";

    drawRing(context, metrics, {
      activeLabelIndex: index === STYLED_RING_INDEX ? ACTIVE_CORE_SEGMENT_INDEX : -1,
      count: ring.count,
      labels: ring.labels,
      backgroundImage: ring.backgroundImage,
      backgroundImageAlpha: ring.backgroundImageAlpha,
      innerRadius,
      outerRadius,
      stroke: isSoft ? borderColors.ringSoft : borderColors.ring,
      textColor: index === STYLED_RING_INDEX ? CORE_TEXT_COLOR : "rgba(47, 42, 79, 0.74)",
      styledSegmentColors: (segmentIndex) => {
        const colors = {
          ...(ring.segmentColors?.[segmentIndex] || getSquareCellPaletteColors(segmentIndex, palette)),
          alpha: ring.fillAlpha ?? SURFACE_FILL_ALPHA,
          glow: `rgba(${accentSoftRgb}, 0.14)`
        };

        if (
          index === STYLED_RING_INDEX
          && ring.activeSegmentIndex === undefined
          && segmentIndex === ACTIVE_CORE_SEGMENT_INDEX
        ) {
          colors.border = "rgba(0, 255, 72, 1)";
          colors.borderGlow = "rgba(0, 255, 72, 0.95)";
          colors.borderUnderlay = "rgba(0, 18, 4, 0.96)";
          colors.borderUnderlayGlow = "rgba(0, 0, 0, 0.95)";
          colors.transparent = true;
          colors.transparentAlpha = ring.activeFillAlpha ?? ACTIVE_FILL_ALPHA;
        }

        if (segmentIndex === ring.activeSegmentIndex) {
          colors.border = "rgba(0, 255, 72, 1)";
          colors.borderGlow = "rgba(0, 255, 72, 0.95)";
          colors.borderUnderlay = "rgba(0, 18, 4, 0.96)";
          colors.borderUnderlayGlow = "rgba(0, 0, 0, 0.95)";
        }

        return colors;
      },
      showBorders: ring.showBorders ?? index !== STYLED_RING_INDEX,
      showDividers: ring.showDividers ?? index !== STYLED_RING_INDEX,
      styledSegmentIndices: ring.styledSegmentIndices || (index === STYLED_RING_INDEX ? getSegmentIndices(ring.count) : []),
      subDividerStroke: rgbToCss(squareLineRgb, state.squareCellBorderAlpha === undefined ? 0.12 : state.squareCellBorderAlpha * 0.62),
      subSegmentCount: ring.subSegmentCount || 0,
      getTickLabel: ring.getTickLabel,
      presentMarkerAngle: ring.presentMarkerAngle,
      presentMarkerColor: ring.presentMarkerColor,
      tickCount: ring.tickCount || 0,
      tickLabelColor: ring.tickLabelColor,
      tickStroke: ring.tickStroke,
      rotation: ring.rotation ?? (ring.centerLastSegmentAtTop ? getTopCenteredLastSegmentRotation(ring.count) : undefined)
    });
  });

  drawMapSquare(context, metrics, {
    activeFillAlpha: ACTIVE_FILL_ALPHA,
    border: state.squareBorderAlpha === undefined
      ? borderColors.square
      : rgbToCss(squareLineRgb, state.squareBorderAlpha),
    cellBorder: state.squareCellBorderAlpha === undefined
      ? borderColors.squareCell
      : rgbToCss(squareLineRgb, state.squareCellBorderAlpha),
    fillAlpha: state.mapSquare?.fillAlpha ?? 0.18,
    glow: "rgba(116, 247, 209, 0.1)",
    palette,
    subCellBorder: rgbToCss(squareLineRgb, state.squareCellBorderAlpha === undefined ? 0.12 : state.squareCellBorderAlpha * 0.62),
    coreText: {
      fill: "rgba(5, 21, 25, 0.46)",
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
  }, state.mapSquare);

  drawSquare(context, metrics, {
    border: state.squareBorderAlpha === undefined
      ? borderColors.square
      : rgbToCss(squareLineRgb, state.squareBorderAlpha),
    backgroundImage: state.squareBackgroundImage,
    cellBorder: state.squareCellBorderAlpha === undefined
      ? borderColors.squareCell
      : rgbToCss(squareLineRgb, state.squareCellBorderAlpha),
    activeFillAlpha: ACTIVE_FILL_ALPHA,
    activeSquareNumber: state.activeSquareNumber || 5,
    fillAlpha: state.squareFillAlpha ?? SURFACE_FILL_ALPHA,
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
  }, state.coreSquareLabels);
};

const normalizeAngle = (angle) => {
  const fullCircle = Math.PI * 2;
  return ((angle % fullCircle) + fullCircle) % fullCircle;
};

export const getJayceeHit = (canvas, state = DEFAULT_JAYCEE_STATE, clientX, clientY) => {
  const rect = canvas.getBoundingClientRect();
  const metrics = getCanvasMetrics(canvas, state.rings.length, {
    ...state.metrics,
    mapSquareGridSize: state.mapSquare?.gridSize
  });
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const squareStart = metrics.center - (metrics.squareSize / 2);

  if (
    x >= squareStart
    && x <= squareStart + metrics.squareSize
    && y >= squareStart
    && y <= squareStart + metrics.squareSize
  ) {
    const cellSize = metrics.squareSize / SQUARE_GRID_SIZE;
    const column = Math.min(SQUARE_GRID_SIZE - 1, Math.max(0, Math.floor((x - squareStart) / cellSize)));
    const row = Math.min(SQUARE_GRID_SIZE - 1, Math.max(0, Math.floor((y - squareStart) / cellSize)));
    const orderIndex = (row * SQUARE_GRID_SIZE) + column;

    return {
      number: JAYCEE_ORDER[orderIndex],
      type: "square"
    };
  }

  if (state.mapSquare && metrics.mapSquareGridSize > 1) {
    const mapSquareStart = metrics.center - (metrics.mapSquareSize / 2);

    if (
      x >= mapSquareStart
      && x <= mapSquareStart + metrics.mapSquareSize
      && y >= mapSquareStart
      && y <= mapSquareStart + metrics.mapSquareSize
    ) {
      const column = Math.min(
        metrics.mapSquareGridSize - 1,
        Math.max(0, Math.floor((x - mapSquareStart) / metrics.mapSquareCellSize))
      );
      const row = Math.min(
        metrics.mapSquareGridSize - 1,
        Math.max(0, Math.floor((y - mapSquareStart) / metrics.mapSquareCellSize))
      );
      const position = (row * metrics.mapSquareGridSize) + column + 1;

      return {
        column,
        position,
        row,
        type: "map-square"
      };
    }
  }

  const distance = Math.hypot(x - metrics.center, y - metrics.center);
  const angle = Math.atan2(y - metrics.center, x - metrics.center);

  for (let index = state.rings.length - 1; index >= 0; index -= 1) {
    const ring = state.rings[index];

    if (ring.interactive === false) continue;

    const innerRadius = metrics.squareOuterRadius + (metrics.ringWidth * index);
    const outerRadius = innerRadius + metrics.ringWidth;

    if (distance < innerRadius || distance > outerRadius) continue;

    const rotation = ring.rotation ?? (ring.centerLastSegmentAtTop ? getTopCenteredLastSegmentRotation(ring.count) : -Math.PI / 2);
    const segmentAngle = (Math.PI * 2) / ring.count;
    const segmentIndex = Math.floor(normalizeAngle(angle - rotation) / segmentAngle);

    return {
      ring,
      ringId: ring.id,
      segmentIndex,
      segmentKey: ring.segmentKeys?.[segmentIndex] || String(segmentIndex + 1),
      type: "ring"
    };
  }

  return null;
};

const initJaycee = () => {
  typeJayceeConsoleLine(document.querySelector("[data-jaycee-console-line]"));

  const canvas = document.querySelector("[data-jaycee-canvas]");
  if (!canvas) return;

  let jayceeState = DEFAULT_JAYCEE_STATE;
  const render = () => {
    try {
      drawJaycee(canvas, jayceeState);
    } catch (error) {
      console.error("Jaycee render failed", error);
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

  loadJayceeLanguage({
    coreRingLanguage: MAIN_CORE_RING_LANGUAGE,
    coreSquareLanguage: null,
    jayceeOrder: JAYCEE_ORDER
  })
    .then((language) => {
      jayceeState = createJayceeState(language);
      scheduleRender();
    })
    .catch((error) => {
      console.error("Jaycee language load failed", error);
    });

  window.addEventListener("pagehide", () => {
    window.clearInterval(clock);
  }, { once: true });
};

if (document.querySelector("[data-jaycee-canvas]")) {
  initJaycee();
}
