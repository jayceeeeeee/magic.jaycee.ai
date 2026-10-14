export const JAYCEE_GAME_CONFIG = {
  lifeMaxYears: 1000000,
  passive: {
    cycleSeconds: 31556926.08,
    fractalLabel: "Stars",
    zoneMeters: 40075017
  },
  activeAbilities: [
    {
      cycleSeconds: 2551442.803,
      fractalLabel: "Moon",
      skillLabel: "Prayer",
      ratio: 1826.211
    },
    {
      cycleSeconds: 86400,
      fractalLabel: "Sun",
      ratio: 24
    },
    {
      cycleSeconds: 3600,
      fractalLabel: "Earth",
      ratio: 24
    }
  ],
  ultimate: {
    fractalLabel: "Body"
  }
};

export const JAYCEE_GAME_CYCLE_LABELS = {
  passive: "Year", 
  activeAbilities: ["Month", "Day", "Hour"]
};
