import { getLuckCycle } from "../lib/baziLuckCycle.js";

export const renderLuckCycleResults = ({ profile, list }) => {
  const luckCycle = getLuckCycle(profile, profile.pillars);

  if (!luckCycle) {
    list.innerHTML = "";

    return {
      ...profile,
      luckCycle: null,
    };
  }

  list.innerHTML = luckCycle.pillars
    .map(
      (entry) => `
        <article class="luck-cycle-card">
          <span class="luck-cycle-age">${entry.ageLabel}</span>
          <strong class="luck-cycle-symbol">${entry.pillar.hanzi}</strong>
          <span class="luck-cycle-meta">${entry.pillar.pinyinTone}</span>
        </article>
      `,
    )
    .join("");

  return {
    ...profile,
    luckCycle,
  };
};
