const TAU = Math.PI * 2;
const START_ANGLE = -Math.PI / 2;

const TENKI_CONFIG = {
  origin: {
    xRatio: 0.5,
    yRatio: 0.5
  },
  square: {
    cellsPerSide: 3,
    sizeRatio: 0.28
  },
  rings: [
    { segments: 9 },
    { segments: 10 }
  ],
  ringWidthRatio: 0.08,
  ringGapRatio: 0.025
};

const getCssColor = (name, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const polarToPoint = (center, radius, angle) => ({
  x: center.x + Math.cos(angle) * radius,
  y: center.y + Math.sin(angle) * radius
});

const drawClosedPath = (context, points) => {
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

const buildRingSegment = ({ center, innerRadius, outerRadius, angleStart, angleEnd }) => {
  const steps = 18;
  const points = [];

  for (let step = 0; step <= steps; step += 1) {
    const angle = angleStart + (angleEnd - angleStart) * (step / steps);
    points.push(polarToPoint(center, outerRadius, angle));
  }

  for (let step = steps; step >= 0; step -= 1) {
    const angle = angleStart + (angleEnd - angleStart) * (step / steps);
    points.push(polarToPoint(center, innerRadius, angle));
  }

  return points;
};

const drawNineCellSquare = ({ context, center, size, textColor }) => {
  const cellsPerSide = TENKI_CONFIG.square.cellsPerSide;
  const cellSize = size / cellsPerSide;
  const startX = center.x - size / 2;
  const startY = center.y - size / 2;

  context.save();
  context.fillStyle = "rgba(4, 16, 18, 0.42)";
  context.strokeStyle = "rgba(255, 255, 255, 0.26)";
  context.lineWidth = 1;
  context.fillRect(startX, startY, size, size);
  context.strokeRect(startX, startY, size, size);

  for (let line = 1; line < cellsPerSide; line += 1) {
    const offset = line * cellSize;

    context.beginPath();
    context.moveTo(startX + offset, startY);
    context.lineTo(startX + offset, startY + size);
    context.moveTo(startX, startY + offset);
    context.lineTo(startX + size, startY + offset);
    context.stroke();
  }

  context.fillStyle = textColor;
  context.font = `700 ${Math.max(11, cellSize * 0.3)}px "Share Tech Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (let index = 0; index < cellsPerSide * cellsPerSide; index += 1) {
    const column = index % cellsPerSide;
    const row = Math.floor(index / cellsPerSide);
    const x = startX + column * cellSize + cellSize / 2;
    const y = startY + row * cellSize + cellSize / 2;
    context.fillText(String(index + 1), x, y);
  }

  context.restore();
};

const drawSegmentedRing = ({ context, center, size, ring, ringIndex, innerRadius, outerRadius, textColor }) => {
  const segmentAngle = TAU / ring.segments;

  for (let index = 0; index < ring.segments; index += 1) {
    const angleStart = START_ANGLE + index * segmentAngle;
    const angleEnd = angleStart + segmentAngle;
    const points = buildRingSegment({
      center,
      innerRadius,
      outerRadius,
      angleStart,
      angleEnd
    });
    const alpha = 0.1 + ringIndex * 0.045 + (index / ring.segments) * 0.05;
    const gradient = context.createLinearGradient(0, 0, size, size);

    gradient.addColorStop(0, `rgba(83, 220, 198, ${alpha})`);
    gradient.addColorStop(1, `rgba(255, 213, 107, ${Math.max(0.06, alpha - 0.035)})`);

    drawClosedPath(context, points);
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.22)";
    context.lineWidth = 1;
    context.stroke();

    const labelAngle = angleStart + segmentAngle / 2;
    const labelRadius = innerRadius + (outerRadius - innerRadius) / 2;
    const labelPoint = polarToPoint(center, labelRadius, labelAngle);

    context.save();
    context.fillStyle = textColor;
    context.font = `700 ${Math.max(9, (outerRadius - innerRadius) * 0.34)}px "Share Tech Mono", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(83, 220, 198, 0.2)";
    context.shadowBlur = 6;
    context.fillText(String(index + 1), labelPoint.x, labelPoint.y);
    context.restore();
  }
};

const drawTenki = (canvas) => {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const size = Math.floor(Math.min(rect.width, rect.height));

  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);

  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, size, size);

  const text = getCssColor("--text", "#f2fffb");
  const center = {
    x: size * TENKI_CONFIG.origin.xRatio,
    y: size * TENKI_CONFIG.origin.yRatio
  };
  const squareSize = size * TENKI_CONFIG.square.sizeRatio;
  const ringWidth = size * TENKI_CONFIG.ringWidthRatio;
  const ringGap = size * TENKI_CONFIG.ringGapRatio;

  context.save();
  context.shadowColor = "rgba(83, 220, 198, 0.14)";
  context.shadowBlur = 18;

  TENKI_CONFIG.rings.forEach((ring, index) => {
    const innerRadius = squareSize / 2 + ringGap + index * (ringWidth + ringGap);
    const outerRadius = innerRadius + ringWidth;

    drawSegmentedRing({
      context,
      center,
      size,
      ring,
      ringIndex: index,
      innerRadius,
      outerRadius,
      textColor: text
    });
  });

  context.restore();

  drawNineCellSquare({
    context,
    center,
    size: squareSize,
    textColor: text
  });

};

const initTenki = () => {
  const canvas = document.querySelector("[data-tenki-canvas]");
  if (!canvas) return;

  const render = () => drawTenki(canvas);
  render();

  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return;
  }

  window.addEventListener("resize", render);
};

initTenki();
