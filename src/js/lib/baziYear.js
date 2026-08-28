import { earthlyBranches, heavenlyStems } from "../data/baziData.js";

const REFERENCE_YEAR = 1984;

export const getBaziYear = (dateValue) => {
  const [year, month, day] = dateValue.split("-").map(Number);

  if (month < 2 || (month === 2 && day < 4)) {
    return year - 1;
  }

  return year;
};

const getCycleIndex = (year) => ((year - REFERENCE_YEAR) % 60 + 60) % 60;

export const getYearPillar = (dateValue) => {
  const baziYear = getBaziYear(dateValue);
  const cycleIndex = getCycleIndex(baziYear);
  const stem = heavenlyStems[cycleIndex % heavenlyStems.length];
  const branch = earthlyBranches[cycleIndex % earthlyBranches.length];

  return {
    baziYear,
    hanzi: `${stem.hanzi}${branch.hanzi}`,
    pinyin: `${stem.pinyin} ${branch.pinyin}`,
    description: `${stem.polarity} ${stem.element} ${branch.animal}`,
  };
};
