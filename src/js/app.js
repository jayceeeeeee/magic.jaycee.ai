import { modeRoutes, stepFlow } from "./config/flow.js";
import {
  loadAppState,
  loadBirthDraft,
  loadBirthProfile,
  saveAppState,
  saveBirthDraft,
  saveBirthProfile,
} from "./services/storage.js";
import { initBannerSpacing } from "./ui/banner.js";
import { initButtonPressFeedback } from "./ui/buttons.js";
import { createLocationSearch } from "./ui/locationSearch.js";
import { renderPillarResults } from "./ui/pillarResults.js";
import { createStepController } from "./ui/steps.js";

const modeButtons = document.querySelectorAll(".mode-button");
const birthForm = document.querySelector("#birth-form");
const formMessage = document.querySelector("#form-message");
const birthDateInput = document.querySelector("#birth-date");
const birthPlaceInput = document.querySelector("#birth-place");
const locationResults = document.querySelector("#location-results");
const yearPillarSymbol = document.querySelector("#year-pillar-symbol");
const yearPillarMeta = document.querySelector("#year-pillar-meta");
const siteBanner = document.querySelector(".site-banner");
const previousButton = document.querySelector("[data-flow-action='previous']");
const nextButton = document.querySelector("[data-flow-action='next']");
const savedAppState = loadAppState();
const savedDraft = loadBirthDraft();
const savedProfile = loadBirthProfile();
let selectedMode = savedAppState?.selectedMode || savedDraft?.mode || savedProfile?.mode || "";

const savedLocation =
  savedDraft?.selectedLocation ||
  (savedProfile?.coordinates
    ? {
        name: savedProfile.birthPlace,
        latitude: savedProfile.coordinates.latitude,
        longitude: savedProfile.coordinates.longitude,
      }
    : null);

const setFormMessage = (message, type = "info") => {
  formMessage.textContent = message;
  formMessage.dataset.type = type;
};

const isValidBirthDate = (dateValue) => {
  if (!dateValue) {
    return false;
  }

  const date = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return !Number.isNaN(date.getTime()) && date <= today;
};

const isValidBirthTime = (timeValue) => /^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue);

const getBirthFormData = (selectedLocation) => {
  const formData = new FormData(birthForm);

  return {
    mode: selectedMode || "adventure",
    fullName: String(formData.get("full-name")).trim(),
    birthDate: String(formData.get("birth-date")),
    birthTime: String(formData.get("birth-time")),
    birthPlace: String(formData.get("birth-place")).trim(),
    coordinates: selectedLocation
      ? {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        }
      : null,
  };
};

const getCurrentDraft = (selectedLocation) => getBirthFormData(selectedLocation);

const saveCurrentState = (activeStepId, unlockedSteps = []) => {
  saveAppState({
    activeStepId,
    selectedMode,
    unlockedSteps,
  });
};

const restoreBirthForm = (profile) => {
  if (!profile) {
    return;
  }

  birthForm.elements["full-name"].value = profile.fullName || "";
  birthForm.elements["birth-date"].value = profile.birthDate || "";
  birthForm.elements["birth-time"].value = profile.birthTime || "";
  birthForm.elements["birth-place"].value = profile.birthPlace || "";
};

const validateBirthProfile = (profile, selectedLocation) => {
  if (!profile.fullName) {
    return "Enter your full name.";
  }

  if (!isValidBirthDate(profile.birthDate)) {
    return "Enter a valid birth date.";
  }

  if (!isValidBirthTime(profile.birthTime)) {
    return "Enter a valid birth time.";
  }

  if (!profile.birthPlace) {
    return "Enter your place of birth.";
  }

  if (!selectedLocation || selectedLocation.name !== profile.birthPlace) {
    return "Choose a place from the location results.";
  }

  return "";
};

const getHashStepId = () => window.location.hash.replace("#", "");

const getInitialStepId = () => {
  const hashStepId = getHashStepId();

  if (hashStepId) {
    return hashStepId;
  }

  return "mode-step";
};

initBannerSpacing(siteBanner);
initButtonPressFeedback();

birthDateInput.max = new Date().toISOString().split("T")[0];

restoreBirthForm(savedDraft || savedProfile);

const stepController = createStepController({
  stepFlow,
  previousButton,
  nextButton,
  unlockedSteps: savedAppState?.unlockedSteps || [],
  onStepChange: (activeStepId) => saveCurrentState(activeStepId, stepController.getUnlockedSteps()),
});

const locationSearch = createLocationSearch({
  input: birthPlaceInput,
  resultsList: locationResults,
  initialLocation: savedLocation,
  onError: (message) => setFormMessage(message, "error"),
  onSelect: (selectedLocation) => {
    saveBirthDraft({
      ...getCurrentDraft(selectedLocation),
      selectedLocation,
    });
  },
});

if (savedProfile?.pillars?.year) {
  renderPillarResults({
    profile: savedProfile,
    yearPillarSymbol,
    yearPillarMeta,
  });
}

if (savedAppState?.selectedMode || savedDraft || savedProfile) {
  stepController.unlockStep("birth-step");
}

if (savedProfile?.pillars?.year) {
  stepController.unlockStep("pillar-step");
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.classList.contains("is-locked")) {
      return;
    }

    selectedMode = button.dataset.mode;
    const targetId = button.dataset.target || modeRoutes[selectedMode];

    stepController.unlockStep(targetId);
    saveCurrentState("mode-step", stepController.getUnlockedSteps());
    stepController.showStep(targetId);
  });
});

birthForm.addEventListener("input", () => {
  const selectedLocation = locationSearch.getSelectedLocation();

  saveBirthDraft({
    ...getCurrentDraft(selectedLocation),
    selectedLocation,
  });
});

previousButton?.addEventListener("click", stepController.showPreviousStep);
nextButton?.addEventListener("click", stepController.showNextStep);

window.addEventListener("hashchange", () => {
  const hashStepId = getHashStepId();

  if (hashStepId && stepController.canShowStep(hashStepId)) {
    stepController.showStep(hashStepId, { updateHash: false });
    return;
  }

  stepController.showStep("mode-step", { updateHash: false });
});

stepController.showStep(getInitialStepId());

birthForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const selectedLocation = locationSearch.getSelectedLocation();
  const profile = getBirthFormData(selectedLocation);
  const error = validateBirthProfile(profile, selectedLocation);

  if (error) {
    setFormMessage(error, "error");
    return;
  }

  const profileWithPillars = renderPillarResults({
    profile,
    yearPillarSymbol,
    yearPillarMeta,
  });

  saveBirthProfile(profileWithPillars);
  saveBirthDraft({
    ...profile,
    selectedLocation,
  });
  stepController.unlockStep("pillar-step");
  stepController.showStep("pillar-step");
});
