const TAU = Math.PI * 2;
const FULL_CIRCLE_DEGREES = 360;

const SPIRAL_CONFIG = {
  timeCycleLength: 10,
  segmentsPerLoop: 9,
  startAngleDegrees: -90,
  origin: {
    xRatio: 0.5,
    yRatio: 0.5
  },
  innerRadiusRatio: 0.08,
  outerMarginRatio: 0.075,
  minReadableBandWidth: 9
};

const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;

const getGreatestCommonDivisor = (a, b) => {
  let left = Math.abs(a);
  let right = Math.abs(b);

  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left;
};

const getLeastCommonMultiple = (a, b) => {
  if (a === 0 || b === 0) return 0;

  return Math.abs(a * b) / getGreatestCommonDivisor(a, b);
};

const getCssColor = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const polarToPoint = (center, radius, angle) => ({
  x: center.x + Math.cos(angle) * radius,
  y: center.y + Math.sin(angle) * radius
});

const buildSpiralSegment = ({ center, innerStart, bandWidth, pitch, spiralStartAngle, angleStart, angleEnd }) => {
  const steps = 18;
  const outerPoints = [];
  const innerPoints = [];

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const angle = angleStart + (angleEnd - angleStart) * t;
    const progress = (angle - spiralStartAngle) / TAU;
    const innerRadius = innerStart + pitch * progress;
    outerPoints.push(polarToPoint(center, innerRadius + bandWidth, angle));
  }

  for (let step = steps; step >= 0; step -= 1) {
    const t = step / steps;
    const angle = angleStart + (angleEnd - angleStart) * t;
    const progress = (angle - spiralStartAngle) / TAU;
    const innerRadius = innerStart + pitch * progress;
    innerPoints.push(polarToPoint(center, innerRadius, angle));
  }

  return [...outerPoints, ...innerPoints];
};

const drawSegmentPath = (context, points) => {
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
      return;
    }

    context.lineTo(point.x, point.y);
  });
  context.closePath();
};

const formatDegrees = (degrees) => `${Number(degrees.toFixed(3))}deg`;

const drawConfigReadout = ({ context, size, lines }) => {
  const padding = Math.max(10, size * 0.022);
  const lineHeight = Math.max(12, size * 0.026);
  const fontSize = Math.max(9, size * 0.02);
  const panelWidth = Math.max(150, size * 0.34);
  const panelHeight = padding * 1.25 + lines.length * lineHeight;

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.26)";
  context.shadowBlur = 10;
  context.fillStyle = "rgba(4, 16, 18, 0.62)";
  context.fillRect(padding, padding, panelWidth, panelHeight);

  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.lineWidth = 1;
  context.strokeRect(padding, padding, panelWidth, panelHeight);

  context.fillStyle = "rgba(242, 255, 251, 0.86)";
  context.font = `600 ${fontSize}px "Share Tech Mono", monospace`;
  context.textAlign = "left";
  context.textBaseline = "top";

  lines.forEach((line, index) => {
    context.fillText(line, padding * 1.6, padding * 1.45 + index * lineHeight);
  });

  context.restore();
};

const drawTenkiSpiral = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const size = Math.floor(Math.min(rect.width, rect.height));

  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);

  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, size, size);

  const accent = getCssColor("--accent", "#53dcc6");
  const text = getCssColor("--text", "#f2fffb");
  const {
    timeCycleLength,
    segmentsPerLoop,
    startAngleDegrees,
    origin,
    innerRadiusRatio,
    outerMarginRatio,
    minReadableBandWidth
  } = SPIRAL_CONFIG;
  const globalTraitCount = getLeastCommonMultiple(segmentsPerLoop, timeCycleLength);
  const segmentGapDegrees = FULL_CIRCLE_DEGREES / globalTraitCount;
  const segmentCount = globalTraitCount;
  const fractalLoops = globalTraitCount / segmentsPerLoop;
  const center = {
    x: size * origin.xRatio,
    y: size * origin.yRatio
  };
  const spiralStartAngle = degreesToRadians(startAngleDegrees);
  const segmentAngleDegrees = (FULL_CIRCLE_DEGREES / segmentsPerLoop) + segmentGapDegrees;
  const segmentAngle = degreesToRadians(segmentAngleDegrees);
  const margin = size * outerMarginRatio;
  const innerStart = size * innerRadiusRatio;
  const totalAngleSpan = segmentCount * segmentAngle;
  const totalTurns = totalAngleSpan / TAU;
  const edgeRadius = Math.min(center.x, center.y, size - center.x, size - center.y);
  const availableRadius = edgeRadius - margin - innerStart;
  const bandWidth = availableRadius / (totalTurns + 1);
  const pitch = bandWidth;
  const shouldDrawLabels = bandWidth >= minReadableBandWidth;

  context.save();
  context.shadowColor = "rgba(83, 220, 198, 0.16)";
  context.shadowBlur = 18;

  for (let index = 0; index < segmentCount; index += 1) {
    const angleStart = spiralStartAngle + index * segmentAngle;
    const angleEnd = angleStart + segmentAngle;
    const points = buildSpiralSegment({
      center,
      innerStart,
      bandWidth,
      pitch,
      spiralStartAngle,
      angleStart,
      angleEnd
    });

    const gradient = context.createLinearGradient(0, 0, size, size);
    const alpha = 0.1 + (index / segmentCount) * 0.18;
    gradient.addColorStop(0, `rgba(83, 220, 198, ${alpha})`);
    gradient.addColorStop(1, `rgba(255, 213, 107, ${Math.max(0.06, alpha - 0.04)})`);

    drawSegmentPath(context, points);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.21)";
    context.lineWidth = Math.max(0.25, Math.min(0.85, bandWidth * 0.14));
    context.stroke();

    if (!shouldDrawLabels) {
      continue;
    }

    const labelAngle = (angleStart + angleEnd) / 2;
    const labelProgress = (labelAngle - spiralStartAngle) / TAU;
    const labelRadius = innerStart + pitch * labelProgress + bandWidth * 0.5;
    const labelPoint = polarToPoint(center, labelRadius, labelAngle);

    context.save();
    context.fillStyle = text;
    context.font = `700 ${Math.max(7, Math.min(size * 0.023, bandWidth * 0.82))}px "Share Tech Mono", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(83, 220, 198, 0.22)";
    context.shadowBlur = 8;
    context.fillText(String(index + 1), labelPoint.x, labelPoint.y);
    context.restore();
  }

  context.restore();

  context.beginPath();
  context.arc(center.x, center.y, innerStart * 0.68, 0, TAU);
  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 1;
  context.stroke();

  context.fillStyle = accent;
  context.font = `600 ${Math.max(10, size * 0.026)}px "Share Tech Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("TENKI", center.x, center.y);

  drawConfigReadout({
    context,
    size,
    lines: [
      `cycle ${timeCycleLength}`,
      `base ${segmentsPerLoop}`,
      `ppcm ${globalTraitCount}`,
      `fractals ${Number(fractalLoops.toFixed(3))}`,
      `gap ${formatDegrees(segmentGapDegrees)}`,
      `step ${formatDegrees(segmentAngleDegrees)}`
    ]
  });
};

const initTenki = () => {
  const canvas = document.querySelector("[data-tenki-canvas]");
  if (!canvas) return;

  const render = () => drawTenkiSpiral(canvas);
  render();

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return;
  }

  window.addEventListener("resize", render);
};

initTenki();
