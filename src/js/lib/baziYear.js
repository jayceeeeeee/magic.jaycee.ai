import { getSexagenaryPillar } from "./baziCycle.js";
import { findSolarLongitudeTransition, getBirthInstant } from "./baziSolar.js";

const REFERENCE_YEAR = 1984;
const START_OF_SPRING_LONGITUDE = 315;

// 1984 is a Jia-Zi year, so it anchors the 60-year stem/branch cycle.
const getCycleIndex = (year) => ((year - REFERENCE_YEAR) % 60 + 60) % 60;

export const getBaziYear = (profileOrDateValue) => {
  const profile =
    typeof profileOrDateValue === "string"
      ? { birthDate: profileOrDateValue }
      : profileOrDateValue;
  const birthInstant = getBirthInstant(profile);
  const birthYear = Number(profile.birthDate.split("-")[0]);
  const springBegins = findSolarLongitudeTransition(birthYear, START_OF_SPRING_LONGITUDE);

  // BaZi years begin at Lichun, the solar term at 315 degrees longitude.
  return birthInstant < springBegins ? birthYear - 1 : birthYear;
};

export const getYearPillar = (profileOrDateValue) => {
  const profile =
    typeof profileOrDateValue === "string"
      ? { birthDate: profileOrDateValue }
      : profileOrDateValue;
  const baziYear = getBaziYear(profile);
  const cycleIndex = getCycleIndex(baziYear);
  const pillar = getSexagenaryPillar(cycleIndex);

  return {
    ...pillar,
    baziYear,
  };
};
