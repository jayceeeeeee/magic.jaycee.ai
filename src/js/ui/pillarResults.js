import { getYearPillar } from "../lib/baziYear.js";

export const renderPillarResults = ({ profile, yearPillarSymbol, yearPillarMeta }) => {
  const yearPillar = getYearPillar(profile.birthDate);

  yearPillarSymbol.textContent = yearPillar.hanzi;
  yearPillarMeta.textContent = `${yearPillar.pinyin} - ${yearPillar.description}`;

  return {
    ...profile,
    pillars: {
      year: yearPillar,
    },
  };
};
