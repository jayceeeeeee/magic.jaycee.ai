import { earthlyBranches, heavenlyStems, sexagenaryCycle } from "../data/baziData.js";

// Expands a lightweight data pair like { stem: "Jia", branch: "Zi" }
// into the full pillar object used by the UI and saved profile.
export const getPillarFromStemBranch = ({ stem: stemPinyin, branch: branchPinyin }) => {
  const stem = heavenlyStems.find((candidate) => candidate.pinyin === stemPinyin);
  const branch = earthlyBranches.find((candidate) => candidate.pinyin === branchPinyin);

  if (!stem || !branch) {
    throw new Error(`Invalid stem/branch pair: ${stemPinyin} ${branchPinyin}`);
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

export const getSexagenaryPillar = (cycleIndex) => {
  const cycleEntry = sexagenaryCycle[((cycleIndex % sexagenaryCycle.length) + sexagenaryCycle.length) % sexagenaryCycle.length];

  return getPillarFromStemBranch(cycleEntry);
};

export const getSexagenaryIndexFromPillar = (pillar) => {
  const cycleIndex = sexagenaryCycle.findIndex(
    (cycleEntry) => cycleEntry.stem === pillar.stem.pinyin && cycleEntry.branch === pillar.branch.pinyin,
  );

  if (cycleIndex === -1) {
    throw new Error(`Pillar is not in the 60-cycle: ${pillar.pinyin}`);
  }

  return cycleIndex;
};
