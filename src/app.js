const modeButtons = document.querySelectorAll(".mode-button");
const birthForm = document.querySelector("#birth-form");
const formMessage = document.querySelector("#form-message");
const siteBanner = document.querySelector(".site-banner");
const previousButton = document.querySelector("[data-flow-action='previous']");
const nextButton = document.querySelector("[data-flow-action='next']");
let selectedMode = "";
let activeStepId = "mode-step";
let previousStepId = "";
let nextStepId = "";

const modeRoutes = {
  adventure: "birth-step",
  "co-op": "co-op-step",
  competition: "competition-step",
};

const stepFlow = {
  "mode-step": {
    previous: "",
    next: "",
  },
  "birth-step": {
    previous: "mode-step",
    next: "",
  },
};

const updateBannerSpace = () => {
  if (!siteBanner) {
    document.documentElement.style.setProperty("--banner-space", "0px");
    return;
  }

  const bannerHeight = siteBanner.getBoundingClientRect().height;
  const bannerTop = Number.parseFloat(getComputedStyle(siteBanner).top) || 0;

  document.documentElement.style.setProperty("--banner-space", `${bannerHeight + bannerTop + 16}px`);
};

if (siteBanner && "ResizeObserver" in window) {
  new ResizeObserver(updateBannerSpace).observe(siteBanner);
}

window.addEventListener("load", updateBannerSpace);
window.addEventListener("resize", updateBannerSpace);

const getStep = (stepId) => document.querySelector(`#${stepId}`);

const updateNavigation = () => {
  if (previousButton) {
    previousButton.hidden = !previousStepId;
  }

  if (nextButton) {
    nextButton.hidden = !nextStepId;
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

document.querySelectorAll("button").forEach((button) => {
  button.addEventListener("pointerdown", () => {
    if (button.classList.contains("is-locked")) {
      return;
    }

    button.classList.add("is-pressed");
  });

  button.addEventListener("pointerup", () => {
    button.classList.remove("is-pressed");
  });

  button.addEventListener("pointerleave", () => {
    button.classList.remove("is-pressed");
  });

  button.addEventListener("blur", () => {
    button.classList.remove("is-pressed");
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.classList.contains("is-locked")) {
      return;
    }

    selectedMode = button.dataset.mode;
    const targetId = button.dataset.target || modeRoutes[selectedMode];

    showStep(targetId);
  });
});

if (previousButton) {
  previousButton.addEventListener("click", () => {
    if (previousStepId) {
      showStep(previousStepId);
    }
  });
}

if (nextButton) {
  nextButton.addEventListener("click", () => {
    if (nextStepId) {
      showStep(nextStepId);
    }
  });
}

showStep(activeStepId);

birthForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(birthForm);
  const birthTime = formData.get("birth-time");
  const birthDay = formData.get("birth-day");
  const birthMonth = formData.get("birth-month");
  const birthYear = formData.get("birth-year");
  const birthPlace = formData.get("birth-place");

  formMessage.textContent = `${selectedMode || "game"} queued: ${birthDay}/${birthMonth}/${birthYear} at ${birthTime}, ${birthPlace}.`;
});
