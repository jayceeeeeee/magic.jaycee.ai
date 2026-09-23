const DEFAULT_FRACTAL_COLOR = {
  border: "rgba(116, 247, 209, 0.28)",
  fill: "rgba(116, 247, 209, 0.08)",
  glow: "rgba(116, 247, 209, 0.12)",
  text: "rgba(5, 21, 25, 0.58)"
};

const getSegmentAngle = (segmentCount) => (Math.PI * 2) / segmentCount;

const getSegmentLabel = (segment) => (
  segment?.label === undefined ? "" : String(segment.label)
);

const drawFractalSegment = (context, metrics, ring, segment, index) => {
  const segmentCount = ring.segments.length;
  const segmentAngle = getSegmentAngle(segmentCount);
  const startAngle = ring.rotation + (index * segmentAngle);
  const endAngle = startAngle + segmentAngle;
  const color = {
    ...DEFAULT_FRACTAL_COLOR,
    ...ring.color,
    ...segment.color
  };

  context.save();
  context.beginPath();
  context.arc(metrics.center, metrics.center, ring.outerRadius, startAngle, endAngle);
  context.lineTo(
    metrics.center + Math.cos(endAngle) * ring.innerRadius,
    metrics.center + Math.sin(endAngle) * ring.innerRadius
  );
  context.arc(metrics.center, metrics.center, ring.innerRadius, endAngle, startAngle, true);
  context.closePath();
  context.fillStyle = color.fill;
  context.shadowColor = color.glow;
  context.shadowBlur = ring.width * 0.16;
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = color.border;
  context.lineWidth = Math.max(1, ring.width * 0.018);
  context.stroke();
  context.restore();

  const label = getSegmentLabel(segment);
  if (!label) return;

  const labelRadius = ring.innerRadius + (ring.width / 2);
  const labelAngle = startAngle + (segmentAngle / 2);

  context.save();
  context.fillStyle = color.text;
  context.font = `600 ${Math.max(9, ring.width * 0.24)}px "Share Tech Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    label,
    metrics.center + Math.cos(labelAngle) * labelRadius,
    metrics.center + Math.sin(labelAngle) * labelRadius
  );
  context.restore();
};

export const drawJayceeFractals = (context, metrics, fractalRings = []) => {
  fractalRings.forEach((ring) => {
    if (!ring?.segments?.length) return;

    const normalizedRing = {
      rotation: -Math.PI / 2,
      width: ring.outerRadius - ring.innerRadius,
      ...ring
    };

    normalizedRing.segments.forEach((segment, index) => {
      drawFractalSegment(context, metrics, normalizedRing, segment, index);
    });
  });
};
