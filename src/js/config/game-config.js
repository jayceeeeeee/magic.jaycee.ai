export const JAYCEE_GAME_CONFIG = {
  lifeMaxYears: 1000000,
  passive: {
    skillColumn: "skill_0",
    cycleSeconds: 31556926.08,
    fractalLabel: "Stars",
    zoneMeters: 40075017
  },
  activeAbilities: [
    {
      skillColumn: "skill_1",
      cycleSeconds: 2551442.803,
      fractalLabel: "Moon",
      skillLabel: "Prayer",
      ratio: 1826.211
    },
    {
      skillColumn: "skill_2",
      cycleSeconds: 86400,
      fractalLabel: "Sun",
      ratio: 24
    },
    {
      skillColumn: "skill_3",
      cycleSeconds: 3600,
      fractalLabel: "Earth",
      ratio: 24
    }
  ],
  ultimate: {
    skillColumn: "skill_4",
    fractalLabel: "Body"
  }
};

export const JAYCEE_GAME_SKILL_COLUMNS = [
  JAYCEE_GAME_CONFIG.passive.skillColumn,
  ...JAYCEE_GAME_CONFIG.activeAbilities.map((ability) => ability.skillColumn),
  JAYCEE_GAME_CONFIG.ultimate.skillColumn
];

export const JAYCEE_GAME_CYCLE_LABELS = {
  passive: "Year", 
  activeAbilities: ["Month", "Day", "Hour"]
};
