export const modeRoutes = {
  adventure: "birth-step",
  "co-op": "co-op-step",
  competition: "competition-step",
};

export const stepFlow = {
  "mode-step": {
    previous: "",
    next: "",
  },
  "birth-step": {
    previous: "mode-step",
    next: "pillar-step",
  },
  "pillar-step": {
    previous: "birth-step",
    next: "",
  },
};
