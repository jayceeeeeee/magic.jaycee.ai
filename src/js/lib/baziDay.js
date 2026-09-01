import { getSexagenaryPillar } from "./baziCycle.js";

const DAY_MS = 86400000; // one day in milliseconds
const JIA_ZI_REFERENCE_DATE = "1900-02-20";
const DAY_START_HOUR = 23;

const getUtcDate = (dateValue) => {
  const [year, month, day] = dateValue.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
};

const getBaziDayDate = ({ birthDate, birthTime = "" }) => {
  const baziDayDate = getUtcDate(birthDate);

  // If the birth time is unknown, keep the civil date and skip the Late Rat shift.
  if (!birthTime) {
    return baziDayDate;
  }

  const [hour] = birthTime.split(":").map(Number);

  // With the Late Rat convention, the next BaZi day starts at 23:00.
  if (hour >= DAY_START_HOUR) {
    baziDayDate.setUTCDate(baziDayDate.getUTCDate() + 1);
  }

  return baziDayDate;
};

const getCycleIndex = (profile) => {
  const referenceDate = getUtcDate(JIA_ZI_REFERENCE_DATE);
  const dayDistance = Math.floor((getBaziDayDate(profile) - referenceDate) / DAY_MS);

  return ((dayDistance % 60) + 60) % 60;
};

export const getDayPillar = (profileOrDateValue) => {
  const profile =
    typeof profileOrDateValue === "string"
      ? { birthDate: profileOrDateValue }
      : profileOrDateValue;
  const cycleIndex = getCycleIndex(profile);
  const pillar = getSexagenaryPillar(cycleIndex);

  return {
    ...pillar,
    baziDate: getBaziDayDate(profile).toISOString().split("T")[0],
  };
};
