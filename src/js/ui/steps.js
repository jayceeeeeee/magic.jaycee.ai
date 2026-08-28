export const createStepController = ({
  stepFlow,
  previousButton,
  nextButton,
  unlockedSteps = [],
  onStepChange,
  useHash = true,
}) => {
  let activeStepId = "mode-step";
  let previousStepId = "";
  let nextStepId = "";
  const unlockedStepIds = new Set(unlockedSteps);

  const getStep = (stepId) => document.querySelector(`#${stepId}`);

  const updateNavigation = () => {
    if (previousButton) {
      previousButton.hidden = !previousStepId;
    }

    if (nextButton) {
      nextButton.hidden = !nextStepId || !unlockedStepIds.has(nextStepId);
    }
  };

  const canShowStep = (stepId) => stepId === "mode-step" || unlockedStepIds.has(stepId);

  const setHash = (stepId) => {
    if (!useHash) {
      return;
    }

    const nextHash = stepId === "mode-step" ? "" : `#${stepId}`;

    if (window.location.hash === nextHash) {
      return;
    }

    window.history.pushState(null, "", nextHash || window.location.pathname);
  };

  const showStep = (stepId, options = {}) => {
    const targetStep = getStep(stepId);

    if (!targetStep || !canShowStep(stepId)) {
      return;
    }

    document.querySelectorAll(".step").forEach((step) => {
      const isTarget = step.id === stepId;

      step.hidden = !isTarget;
      step.classList.toggle("is-active", isTarget);
    });

    activeStepId = stepId;
    previousStepId = stepFlow[stepId]?.previous || "";
    nextStepId = stepFlow[stepId]?.next || "";
    updateNavigation();
    if (options.updateHash !== false) {
      setHash(stepId);
    }
    onStepChange?.(activeStepId);
  };

  const unlockStep = (stepId) => {
    if (!stepId) {
      return;
    }

    unlockedStepIds.add(stepId);
    updateNavigation();
  };

  const showPreviousStep = () => {
    if (previousStepId) {
      showStep(previousStepId);
    }
  };

  const showNextStep = () => {
    if (nextStepId && unlockedStepIds.has(nextStepId)) {
      showStep(nextStepId);
    }
  };

  return {
    showStep,
    showPreviousStep,
    showNextStep,
    unlockStep,
    canShowStep,
    getUnlockedSteps() {
      return [...unlockedStepIds];
    },
    get activeStepId() {
      return activeStepId;
    },
  };
};
