const modeButtons = document.querySelectorAll(".mode-button");
const birthForm = document.querySelector("#birth-form");
const formMessage = document.querySelector("#form-message");
const birthDateInput = document.querySelector("#birth-date");
const birthPlaceInput = document.querySelector("#birth-place");
const locationResults = document.querySelector("#location-results");
const siteBanner = document.querySelector(".site-banner");
const previousButton = document.querySelector("[data-flow-action='previous']");
const nextButton = document.querySelector("[data-flow-action='next']");
let selectedMode = "";
let activeStepId = "mode-step";
let previousStepId = "";
let nextStepId = "";
let selectedLocation = null;
let locationSearchTimeout = null;

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

birthDateInput.max = new Date().toISOString().split("T")[0];

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

const clearLocationResults = () => {
  locationResults.innerHTML = "";
  locationResults.hidden = true;
};

const setFormMessage = (message, type = "info") => {
  formMessage.textContent = message;
  formMessage.dataset.type = type;
};

const searchLocations = async (query) => {
  const endpoint = new URL("https://nominatim.openstreetmap.org/search");

  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("addressdetails", "1");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("q", query);

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  return response.json();
};

const renderLocationResults = (locations) => {
  locationResults.innerHTML = "";

  if (!locations.length) {
    clearLocationResults();
    return;
  }

  locations.forEach((location) => {
    const item = document.createElement("li");
    const button = document.createElement("button");

    button.className = "location-option";
    button.type = "button";
    button.textContent = location.display_name;

    button.addEventListener("click", () => {
      selectedLocation = {
        name: location.display_name,
        latitude: Number(location.lat),
        longitude: Number(location.lon),
      };

      birthPlaceInput.value = selectedLocation.name;
      clearLocationResults();
    });

    item.append(button);
    locationResults.append(item);
  });

  locationResults.hidden = false;
};

const getBirthFormData = () => {
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

const validateBirthProfile = (profile) => {
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

birthPlaceInput.addEventListener("input", () => {
  selectedLocation = null;
  clearTimeout(locationSearchTimeout);

  const query = birthPlaceInput.value.trim();

  if (query.length < 3) {
    clearLocationResults();
    return;
  }

  locationSearchTimeout = setTimeout(async () => {
    try {
      const locations = await searchLocations(query);
      renderLocationResults(locations);
    } catch {
      clearLocationResults();
      setFormMessage("Location search is unavailable right now. Try again in a moment.", "error");
    }
  }, 350);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".location-field")) {
    clearLocationResults();
  }
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

  const profile = getBirthFormData();
  const error = validateBirthProfile(profile);

  if (error) {
    setFormMessage(error, "error");
    return;
  }

  localStorage.setItem("birthProfile", JSON.stringify(profile));
  setFormMessage(`${profile.mode} profile saved locally.`, "success");
});
