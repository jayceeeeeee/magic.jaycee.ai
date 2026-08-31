import { getMonthPillar } from "../lib/baziMonth.js";
import { getYearPillar } from "../lib/baziYear.js";

export const renderPillarResults = ({ profile, yearPillarSymbol, yearPillarMeta, monthPillarSymbol, monthPillarMeta }) => {
  const yearPillar = getYearPillar(profile);
  const monthPillar = getMonthPillar(profile, yearPillar);

  yearPillarSymbol.textContent = yearPillar.hanzi;
  yearPillarMeta.textContent = `${yearPillar.pinyinTone} - ${yearPillar.description}`;

  if (monthPillarSymbol && monthPillarMeta) {
    monthPillarSymbol.textContent = monthPillar.hanzi;
    monthPillarMeta.textContent = `${monthPillar.pinyinTone} - ${monthPillar.description}`;
  }

  return {
    ...profile,
    pillars: {
      month: monthPillar,
      year: yearPillar,
    },
  };
};
