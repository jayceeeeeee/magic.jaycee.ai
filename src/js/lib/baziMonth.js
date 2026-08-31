import { earthlyBranches, heavenlyStems, solarTerms, tigerMonthStemRules } from "../data/baziData.js";
import { findSolarLongitudeTransition, getBirthInstant } from "./baziSolar.js";
import { getYearPillar } from "./baziYear.js";

// Rotates any ordered cycle so later calculations can start from a meaningful BaZi anchor.
const getCycleFrom = (items, startPinyin) => {
  const startIndex = items.findIndex((item) => item.pinyin === startPinyin);

  if (startIndex === -1) {
    throw new Error(`Unknown cycle start: ${startPinyin}`);
  }

  return [...items.slice(startIndex), ...items.slice(0, startIndex)];
};

// BaZi month pillars start on jieqi terms, not zhongqi terms, with Lichun as month 1.
const monthStartTerms = getCycleFrom(
  solarTerms.filter((term) => term.type === "jieqi"),
  "Lichun",
);

// Moves forward inside a repeating stem or branch cycle from a named starting point.
const getCycleItem = (items, startPinyin, offset) => {
  const startIndex = items.findIndex((item) => item.pinyin === startPinyin);

  if (startIndex === -1) {
    throw new Error(`Unknown cycle item: ${startPinyin}`);
  }

  return items[(startIndex + offset) % items.length];
};

const getTigerMonthStem = (yearStem) => {
  // The first BaZi month is always Tiger; its stem depends on the year's stem.
  const rule = tigerMonthStemRules.find((candidate) => candidate.yearStems.includes(yearStem.pinyin));

  if (!rule) {
    throw new Error(`No Tiger month stem rule for year stem: ${yearStem.pinyin}`);
  }

  return heavenlyStems.find((stem) => stem.pinyin === rule.tigerMonthStem);
};

export const getMonthPillar = (profileOrDateValue, yearPillar = getYearPillar(profileOrDateValue)) => {
  const profile =
    typeof profileOrDateValue === "string"
      ? { birthDate: profileOrDateValue }
      : profileOrDateValue;
  const birthInstant = getBirthInstant(profile);
  const birthYear = Number(profile.birthDate.split("-")[0]);
  const boundaryYears = [birthYear - 1, birthYear];

  // Build the surrounding solar month starts because births in January can belong
  // to the final BaZi month of the previous solar year.
  const boundaries = boundaryYears.flatMap((year) =>
    monthStartTerms.map((term, monthIndex) => ({
      date: findSolarLongitudeTransition(year, term.longitude),
      term,
      monthIndex,
    })),
  );

  // The current BaZi month is the latest solar month start before the birth instant.
  const currentMonthStart = boundaries
    .filter((boundary) => boundary.date <= birthInstant)
    .sort((first, second) => second.date - first.date)[0];
  const monthIndex = currentMonthStart?.monthIndex ?? 11;

  // monthIndex is a BaZi solar-month offset: 0 = Tiger, 1 = Rabbit, etc.
  const branch = getCycleItem(earthlyBranches, "Yin", monthIndex);

  // After the year stem chooses the Tiger-month stem, the other month stems
  // continue linearly through the 10 heavenly stems.
  const tigerStem = getTigerMonthStem(yearPillar.stem);
  const stem = getCycleItem(heavenlyStems, tigerStem.pinyin, monthIndex);

  return {
    solarTerm: currentMonthStart?.term ?? monthStartTerms[11],
    monthNumber: monthIndex + 1,
    stem,
    branch,
    hanzi: `${stem.hanzi}${branch.hanzi}`,
    pinyin: `${stem.pinyin} ${branch.pinyin}`,
    pinyinTone: `${stem.pinyinTone} ${branch.pinyinTone}`,
    description: `${stem.polarity} ${stem.element} ${branch.animal}`,
  };
};
