import { hourPillarTable } from "../data/baziData.js";
import { getPillarFromStemBranch } from "./baziCycle.js";
import { getDayPillar } from "./baziDay.js";

const getBirthHour = (birthTime) => {
  if (!birthTime) {
    return null;
  }

  const [hour] = birthTime.split(":").map(Number);

  return Number.isInteger(hour) ? hour : null;
};

const getHourRow = (birthTime) => {
  const hour = getBirthHour(birthTime);

  if (hour === null) {
    return null;
  }

  return hourPillarTable.find((row) => hour >= row.startHour && hour <= row.endHour);
};

const getHourStem = (hourRow, dayStem) => {
  const stemEntry = hourRow.stemsByDayStemGroup.find((entry) => entry.dayStems.includes(dayStem.pinyin));

  if (!stemEntry) {
    throw new Error(`No hour stem table entry for day stem: ${dayStem.pinyin}`);
  }

  return stemEntry.hourStem;
};

export const getHourPillar = (profileOrDateValue, dayPillar = getDayPillar(profileOrDateValue)) => {
  const profile =
    typeof profileOrDateValue === "string"
      ? { birthDate: profileOrDateValue }
      : profileOrDateValue;
  const hourRow = getHourRow(profile.birthTime);

  // The hour pillar cannot be determined when the birth time is unknown.
  if (!hourRow) {
    return null;
  }

  // The hour table gives pinyin keys; this resolves them to full stem/branch data.
  const pillar = getPillarFromStemBranch({
    stem: getHourStem(hourRow, dayPillar.stem),
    branch: hourRow.branch,
  });

  return {
    ...pillar,
    hourName: hourRow.hourName,
    hourNameTone: hourRow.hourNameTone,
    hourRange: `${String(hourRow.startHour).padStart(2, "0")}:00-${String(hourRow.endHour).padStart(2, "0")}:59`,
    name: hourRow.name,
  };
};
