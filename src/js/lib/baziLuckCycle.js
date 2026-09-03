import { luckCycleDirections, solarTerms } from "../data/baziData.js";
import { findSolarLongitudeTransition, getBirthInstant } from "./baziSolar.js";
import { getSexagenaryIndexFromPillar, getSexagenaryPillar } from "./baziCycle.js";
import { getMonthPillar } from "./baziMonth.js";
import { getYearPillar } from "./baziYear.js";

const DAY_MS = 86400000;
const LUCK_PILLAR_COUNT = 9;
const LUCK_PILLAR_YEARS = 10;
const SOLAR_MONTH_DAYS = 30;
// Da Yun start age uses a fractal ratio: one solar month of 30 days maps to
// one luck pillar of 10 years, so each counted day equals 10 / 30 years.
const LUCK_YEARS_PER_COUNTED_DAY = LUCK_PILLAR_YEARS / SOLAR_MONTH_DAYS;

const getLuckDirection = ({ gender, yearPillar }) => {
  const directionEntry = luckCycleDirections.find(
    (entry) => entry.gender === gender && entry.yearPolarity === yearPillar.stem.polarity,
  );

  if (!directionEntry) {
    return null;
  }

  return directionEntry.direction;
};

const getSurroundingJieqiTransitions = (birthYear) =>
  [birthYear - 1, birthYear, birthYear + 1]
    .flatMap((year) =>
      solarTerms
        .filter((term) => term.type === "jieqi")
        .map((term) => ({
          term,
          date: findSolarLongitudeTransition(year, term.longitude),
        })),
    )
    .sort((first, second) => first.date - second.date);

// Forward Da Yun counts from birth to the next jieqi; reverse counts back to the previous one.
const getReferenceJieqi = ({ birthInstant, birthYear, direction }) => {
  const transitions = getSurroundingJieqiTransitions(birthYear);

  if (direction === "forward") {
    return transitions.find((transition) => transition.date > birthInstant);
  }

  const previousTransitions = transitions.filter((transition) => transition.date < birthInstant);

  return previousTransitions[previousTransitions.length - 1];
};

const getStartAge = ({ birthInstant, referenceDate }) => {
  // Ceil turns a partial remaining day into a counted day, while the birth day itself is excluded.
  const dayCount = Math.ceil(Math.abs(referenceDate - birthInstant) / DAY_MS);

  return {
    dayCount,
    startAge: dayCount * LUCK_YEARS_PER_COUNTED_DAY,
  };
};

const formatAge = (age) => (Number.isInteger(age) ? String(age) : age.toFixed(1));

export const getLuckCycle = (profileOrDateValue, pillars = {}) => {
  const profile =
    typeof profileOrDateValue === "string"
      ? { birthDate: profileOrDateValue }
      : profileOrDateValue;

  if (!profile?.birthDate || !profile.gender) {
    return null;
  }

  const yearPillar = pillars.year || getYearPillar(profile);
  const monthPillar = pillars.month || getMonthPillar(profile, yearPillar);
  const direction = getLuckDirection({ gender: profile.gender, yearPillar });

  if (!direction) {
    return null;
  }

  const birthInstant = getBirthInstant(profile);
  const birthYear = Number(profile.birthDate.split("-")[0]);
  const referenceJieqi = getReferenceJieqi({ birthInstant, birthYear, direction });

  if (!referenceJieqi) {
    throw new Error("Unable to find the Da Yun reference jieqi.");
  }

  const { dayCount, startAge } = getStartAge({
    birthInstant,
    referenceDate: referenceJieqi.date,
  });
  const monthCycleIndex = getSexagenaryIndexFromPillar(monthPillar);
  const cycleStep = direction === "forward" ? 1 : -1;

  // The first Da Yun pillar is one step after/before the month pillar, then it advances every 10 years.
  const pillarsList = Array.from({ length: LUCK_PILLAR_COUNT }, (_, index) => {
    const age = startAge + index * LUCK_PILLAR_YEARS;

    return {
      order: index + 1,
      age,
      ageLabel: formatAge(age),
      pillar: getSexagenaryPillar(monthCycleIndex + cycleStep * (index + 1)),
    };
  });

  return {
    name: "Da Yun",
    hanzi: "\u5927\u904b",
    direction,
    dayCount,
    startAge,
    startAgeLabel: formatAge(startAge),
    referenceJieqi,
    pillars: pillarsList,
  };
};
