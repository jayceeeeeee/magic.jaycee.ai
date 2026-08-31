const DAY_MS = 86400000;
const J2000_JULIAN_DAY = 2451545;
const UNIX_EPOCH_JULIAN_DAY = 2440587.5;

const normalizeDegrees = (degrees) => ((degrees % 360) + 360) % 360;

const getForwardArc = (fromDegrees, toDegrees) => normalizeDegrees(toDegrees - fromDegrees);

const getJulianDay = (date) => date.getTime() / DAY_MS + UNIX_EPOCH_JULIAN_DAY;

export const getSolarLongitude = (date) => {
  const julianCenturies = (getJulianDay(date) - J2000_JULIAN_DAY) / 36525;
  const meanLongitude = normalizeDegrees(
    280.46646 + 36000.76983 * julianCenturies + 0.0003032 * julianCenturies ** 2,
  );
  const meanAnomaly = normalizeDegrees(
    357.52911 - 0.0001537 * julianCenturies ** 2 + 35999.05029 * julianCenturies,
  );
  const anomalyRadians = (meanAnomaly * Math.PI) / 180;
  const equationOfCenter =
    Math.sin(anomalyRadians) * (1.914602 - 0.004817 * julianCenturies - 0.000014 * julianCenturies ** 2) +
    Math.sin(2 * anomalyRadians) * (0.019993 - 0.000101 * julianCenturies) +
    Math.sin(3 * anomalyRadians) * 0.000289;
  const trueLongitude = meanLongitude + equationOfCenter;
  const omega = (125.04 - 1934.136 * julianCenturies) * (Math.PI / 180);

  return normalizeDegrees(trueLongitude - 0.00569 - 0.00478 * Math.sin(omega));
};

export const getBirthInstant = ({ birthDate, birthTime = "", coordinates = null }) => {
  const [year, month, day] = birthDate.split("-").map(Number);
  const [hour = 12, minute = 0] = birthTime ? birthTime.split(":").map(Number) : [];
  const localMeanSolarOffsetMs = coordinates?.longitude ? coordinates.longitude * 4 * 60 * 1000 : 0;
  const utcTime = Date.UTC(year, month - 1, day, hour, minute || 0);

  return new Date(utcTime - localMeanSolarOffsetMs);
};

export const findSolarLongitudeTransition = (year, targetLongitude) => {
  const roughDayOfYear = ((targetLongitude - 280 + 360) % 360) * 365.2422 / 360;
  let low = new Date(Date.UTC(year, 0, 1 + Math.floor(roughDayOfYear) - 3));
  let high = new Date(Date.UTC(year, 0, 1 + Math.floor(roughDayOfYear) + 3));

  while (getForwardArc(getSolarLongitude(low), targetLongitude) >= 180) {
    low = new Date(low.getTime() - DAY_MS);
  }

  while (getForwardArc(getSolarLongitude(high), targetLongitude) < 180) {
    high = new Date(high.getTime() + DAY_MS);
  }

  for (let index = 0; index < 48; index += 1) {
    const middle = new Date((low.getTime() + high.getTime()) / 2);

    if (getForwardArc(getSolarLongitude(middle), targetLongitude) < 180) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return high;
};
