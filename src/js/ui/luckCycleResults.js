import { getLuckCycle } from "../lib/baziLuckCycle.js";

const getDirectionLabel = (direction) => (direction === "forward" ? "Forward" : "Reverse");

const renderEmptyLuckCycle = ({ summary, list }, message) => {
  summary.textContent = message;
  list.innerHTML = "";
};

export const renderLuckCycleResults = ({ profile, summary, list }) => {
  const luckCycle = getLuckCycle(profile, profile.pillars);

  if (!luckCycle) {
    renderEmptyLuckCycle({ summary, list }, "Awaiting gender");

    return {
      ...profile,
      luckCycle: null,
    };
  }

  summary.textContent = `${getDirectionLabel(luckCycle.direction)} cycle - ${luckCycle.dayCount} days / 3 = age ${luckCycle.startAgeLabel}`;
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
