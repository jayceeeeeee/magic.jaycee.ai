export const CELESTIAL_TICK_COUNT = 18;
export const SUN_RING_INDEX = 1;
export const MOON_RING_INDEX = 2;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_PEAK_UTC = Date.UTC(2000, 0, 6, 18, 14);

const getClockTickLabel = (index) => {
  const totalMinutes = Math.round((24 * 60 * index) / CELESTIAL_TICK_COUNT);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const getMoonTickLabel = (index) => {
  const cycleProgress = index / CELESTIAL_TICK_COUNT;
  const illumination = (1 - Math.cos(cycleProgress * Math.PI * 2)) / 2;

  return `${Math.round(illumination * 100)}%`;
};

const getMoonCycleState = (date = new Date()) => {
  const elapsedDays = (date.getTime() - KNOWN_NEW_MOON_PEAK_UTC) / DAY_IN_MILLISECONDS;
  const cycleAge = ((elapsedDays % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  const cycleProgress = cycleAge / SYNODIC_MONTH_DAYS;
  const illumination = (1 - Math.cos(cycleProgress * Math.PI * 2)) / 2;

  return {
    cycleAge,
    cycleProgress,
    illumination
  };
};

const getClockTimeLabel = (date = new Date()) => [
  date.getHours(),
  date.getMinutes(),
  date.getSeconds()
].map((value) => String(value).padStart(2, "0")).join(":");

export const CELESTIAL_RING_FRACTALS = {
  moon: {
    markerGlyph: "🌕",
    tickCount: CELESTIAL_TICK_COUNT,
    tickLabelColor: "rgba(5, 21, 25, 0.5)",
    tickStroke: "rgba(245, 248, 246, 0.38)",
    getTickLabel: getMoonTickLabel
  },
  sun: {
    markerGlyph: "☀",
    tickCount: CELESTIAL_TICK_COUNT,
    tickLabelColor: "rgba(5, 21, 25, 0.52)",
    tickStroke: "rgba(255, 247, 174, 0.42)",
    getTickLabel: getClockTickLabel
  }
};

export const getSunTimeAngle = (date = new Date()) => {
  const elapsedSeconds = date.getHours() * 3600
    + date.getMinutes() * 60
    + date.getSeconds()
    + date.getMilliseconds() / 1000;
  const dayProgress = elapsedSeconds / (24 * 3600);

  return -Math.PI / 2 + (dayProgress * Math.PI * 2);
};

export const getMoonCycleAngle = (date = new Date()) => {
  const { cycleProgress } = getMoonCycleState(date);

  return -Math.PI / 2 + (cycleProgress * Math.PI * 2);
};

export const getCelestialReadout = (date = new Date()) => {
  const moon = getMoonCycleState(date);

  return {
    moonDay: moon.cycleAge,
    moonIlluminationPercent: moon.illumination * 100,
    sunTime: getClockTimeLabel(date)
  };
};

export const getCelestialRingColors = (paletteName, segmentIndex) => {
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

export const getCelestialMarkerConfig = (paletteName, timestamp = new Date()) => {
  if (paletteName === "moon") {
    return {
      angle: getMoonCycleAngle(timestamp),
      glyph: CELESTIAL_RING_FRACTALS.moon.markerGlyph,
      glyphColor: "rgba(246, 248, 244, 0.88)",
      glyphSize: 0.42,
      shadowColor: "rgba(255, 16, 12, 0.42)",
      strokeColor: "rgba(219, 66, 61, 0.68)"
    };
  }

  return {
    angle: getSunTimeAngle(timestamp),
    glyph: CELESTIAL_RING_FRACTALS.sun.markerGlyph,
    glyphColor: "rgba(255, 226, 92, 0.94)",
    glyphSize: 0.44,
    shadowColor: "rgba(255, 16, 12, 0.42)",
    strokeColor: "rgba(219, 66, 61, 0.68)"
  };
};
