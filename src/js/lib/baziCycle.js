import { earthlyBranches, heavenlyStems, sexagenaryCycle } from "../data/baziData.js";

export const getSexagenaryPillar = (cycleIndex) => {
  const cycleEntry = sexagenaryCycle[((cycleIndex % sexagenaryCycle.length) + sexagenaryCycle.length) % sexagenaryCycle.length];
  const stem = heavenlyStems.find((candidate) => candidate.pinyin === cycleEntry.stem);
  const branch = earthlyBranches.find((candidate) => candidate.pinyin === cycleEntry.branch);

  if (!stem || !branch) {
    throw new Error(`Invalid sexagenary cycle entry at index: ${cycleIndex}`);
  }

  return {
    stem,
    branch,
    hanzi: `${stem.hanzi}${branch.hanzi}`,
    pinyin: `${stem.pinyin} ${branch.pinyin}`,
    pinyinTone: `${stem.pinyinTone} ${branch.pinyinTone}`,
    description: `${stem.polarity} ${stem.element} ${branch.animal}`,
  };
};
