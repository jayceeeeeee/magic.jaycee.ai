import { getMonthPillar } from "../lib/baziMonth.js";
import { getYearPillar } from "../lib/baziYear.js";

const renderPillar = ({ pillar, stemSymbol, stemMeta, branchSymbol, branchMeta }) => {
  stemSymbol.textContent = pillar.stem.hanzi;
  stemMeta.textContent = `${pillar.stem.pinyinTone} - ${pillar.stem.polarity} ${pillar.stem.element}`;
  branchSymbol.textContent = pillar.branch.hanzi;
  branchMeta.textContent = `${pillar.branch.pinyinTone} - ${pillar.branch.polarity} ${pillar.branch.element} ${pillar.branch.animal}`;
};

export const renderPillarResults = ({
  profile,
  yearStemSymbol,
  yearStemMeta,
  yearBranchSymbol,
  yearBranchMeta,
  monthStemSymbol,
  monthStemMeta,
  monthBranchSymbol,
  monthBranchMeta,
}) => {
  const yearPillar = getYearPillar(profile);
  const monthPillar = getMonthPillar(profile, yearPillar);

  renderPillar({
    pillar: yearPillar,
    stemSymbol: yearStemSymbol,
    stemMeta: yearStemMeta,
    branchSymbol: yearBranchSymbol,
    branchMeta: yearBranchMeta,
  });

  if (monthStemSymbol && monthStemMeta && monthBranchSymbol && monthBranchMeta) {
    renderPillar({
      pillar: monthPillar,
      stemSymbol: monthStemSymbol,
      stemMeta: monthStemMeta,
      branchSymbol: monthBranchSymbol,
      branchMeta: monthBranchMeta,
    });
  }

  return {
    ...profile,
    pillars: {
      month: monthPillar,
      year: yearPillar,
    },
  };
};
