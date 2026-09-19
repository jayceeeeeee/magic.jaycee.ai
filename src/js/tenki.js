const SEGMENT_COUNT = 12;
const SEGMENTS_PER_TURN = 9;
const TAU = Math.PI * 2;
const START_ANGLE = -Math.PI / 2;

const getCssColor = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const polarToPoint = (center, radius, angle) => ({
  x: center.x + Math.cos(angle) * radius,
  y: center.y + Math.sin(angle) * radius
});

const buildSpiralSegment = ({ center, innerStart, bandWidth, pitch, angleStart, angleEnd }) => {
  const steps = 18;
  const outerPoints = [];
  const innerPoints = [];

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const angle = angleStart + (angleEnd - angleStart) * t;
    const progress = (angle - START_ANGLE) / TAU;
    const innerRadius = innerStart + pitch * progress;
    outerPoints.push(polarToPoint(center, innerRadius + bandWidth, angle));
  }

  for (let step = steps; step >= 0; step -= 1) {
    const t = step / steps;
    const angle = angleStart + (angleEnd - angleStart) * t;
    const progress = (angle - START_ANGLE) / TAU;
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
  const accentSoft = getCssColor("--accent-soft", "#ffd56b");
  const text = getCssColor("--text", "#f2fffb");
  const center = { x: size / 2, y: size / 2 };
  const segmentAngle = TAU / SEGMENTS_PER_TURN;
  const margin = size * 0.08;
  const innerStart = size * 0.115;
  const bandWidth = size * 0.105;
  const turns = (SEGMENT_COUNT + 1) / SEGMENTS_PER_TURN;
  const maxInnerRadius = size / 2 - margin - bandWidth;
  const pitch = (maxInnerRadius - innerStart) / turns;

  context.save();
  context.shadowColor = "rgba(83, 220, 198, 0.16)";
  context.shadowBlur = 18;

  for (let index = 0; index < SEGMENT_COUNT; index += 1) {
    const angleStart = START_ANGLE + index * segmentAngle;
    const angleEnd = angleStart + segmentAngle;
    const points = buildSpiralSegment({
      center,
      innerStart,
      bandWidth,
      pitch,
      angleStart,
      angleEnd
    });

    const gradient = context.createLinearGradient(0, 0, size, size);
    const alpha = 0.12 + index * 0.008;
    gradient.addColorStop(0, `rgba(83, 220, 198, ${alpha})`);
    gradient.addColorStop(1, `rgba(255, 213, 107, ${Math.max(0.06, alpha - 0.04)})`);

    drawSegmentPath(context, points);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = index === 9 ? "rgba(255, 213, 107, 0.66)" : "rgba(255, 255, 255, 0.24)";
    context.lineWidth = index === 9 ? 1.7 : 1;
    context.stroke();

    const labelAngle = (angleStart + angleEnd) / 2;
    const labelProgress = (labelAngle - START_ANGLE) / TAU;
    const labelRadius = innerStart + pitch * labelProgress + bandWidth * 0.5;
    const labelPoint = polarToPoint(center, labelRadius, labelAngle);

    context.save();
    context.fillStyle = index === 9 ? accentSoft : text;
    context.font = `700 ${Math.max(12, size * 0.038)}px "Share Tech Mono", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = index === 9 ? "rgba(255, 213, 107, 0.34)" : "rgba(83, 220, 198, 0.22)";
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
