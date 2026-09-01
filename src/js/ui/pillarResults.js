import { getDayPillar } from "../lib/baziDay.js";
import { getHourPillar } from "../lib/baziHour.js";
import { getMonthPillar } from "../lib/baziMonth.js";
import { getYearPillar } from "../lib/baziYear.js";

const renderPillar = ({ pillar, stemSymbol, stemMeta, branchSymbol, branchMeta }) => {
  stemSymbol.textContent = pillar.stem.hanzi;
  stemMeta.textContent = `${pillar.stem.pinyinTone} - ${pillar.stem.polarity} ${pillar.stem.element}`;
  branchSymbol.textContent = pillar.branch.hanzi;
  branchMeta.textContent = `${pillar.branch.pinyinTone} - ${pillar.branch.polarity} ${pillar.branch.element} ${pillar.branch.animal}`;
};

const renderMissingPillar = ({ stemCell, stemSymbol, stemMeta, branchCell, branchSymbol, branchMeta, message }) => {
  stemCell.classList.add("is-empty");
  branchCell.classList.add("is-empty");
  stemSymbol.textContent = "--";
  branchSymbol.textContent = "--";
  stemMeta.textContent = message;
  branchMeta.textContent = message;
};

export const renderPillarResults = ({
  profile,
  hourStemCell,
  hourStemSymbol,
  hourStemMeta,
  hourBranchCell,
  hourBranchSymbol,
  hourBranchMeta,
  dayStemSymbol,
  dayStemMeta,
  dayBranchSymbol,
  dayBranchMeta,
  yearStemSymbol,
  yearStemMeta,
  yearBranchSymbol,
  yearBranchMeta,
  monthStemSymbol,
  monthStemMeta,
  monthBranchSymbol,
  monthBranchMeta,
}) => {
  const dayPillar = getDayPillar(profile);
  const hourPillar = getHourPillar(profile, dayPillar);
  const yearPillar = getYearPillar(profile);
  const monthPillar = getMonthPillar(profile, yearPillar);

  if (hourPillar) {
    hourStemCell.classList.remove("is-empty");
    hourBranchCell.classList.remove("is-empty");
    renderPillar({
      pillar: hourPillar,
      stemSymbol: hourStemSymbol,
      stemMeta: hourStemMeta,
      branchSymbol: hourBranchSymbol,
      branchMeta: hourBranchMeta,
    });
  } else {
    renderMissingPillar({
      stemCell: hourStemCell,
      stemSymbol: hourStemSymbol,
      stemMeta: hourStemMeta,
      branchCell: hourBranchCell,
      branchSymbol: hourBranchSymbol,
      branchMeta: hourBranchMeta,
      message: "Awaiting birth time",
    });
  }

  renderPillar({
    pillar: dayPillar,
    stemSymbol: dayStemSymbol,
    stemMeta: dayStemMeta,
    branchSymbol: dayBranchSymbol,
    branchMeta: dayBranchMeta,
  });

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
      hour: hourPillar,
      day: dayPillar,
      month: monthPillar,
      year: yearPillar,
    },
  };
};
