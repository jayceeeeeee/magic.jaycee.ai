export const createStepController = ({ stepFlow, previousButton, nextButton }) => {
  let activeStepId = "mode-step";
  let previousStepId = "";
  let nextStepId = "";

  const getStep = (stepId) => document.querySelector(`#${stepId}`);

  const updateNavigation = () => {
    if (previousButton) {
      previousButton.hidden = !previousStepId;
    }

    if (nextButton) {
      nextButton.hidden = true;
    }
  };

  const showStep = (stepId) => {
    const targetStep = getStep(stepId);

    if (!targetStep) {
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
  };

  const showPreviousStep = () => {
    if (previousStepId) {
      showStep(previousStepId);
    }
  };

  const showNextStep = () => {
    if (nextStepId) {
      showStep(nextStepId);
    }
  };

  return {
    showStep,
    showPreviousStep,
    showNextStep,
    get activeStepId() {
      return activeStepId;
    },
  };
};
