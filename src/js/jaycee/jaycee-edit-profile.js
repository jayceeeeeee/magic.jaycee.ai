import {
  PROFILE_TABLE,
  fetchProfileByUserId,
  getDisplayValue,
  getProfileColorValue,
  getThemeSettingsFromProfile
} from "./jaycee-data.js";
import { getTimezoneForCoordinates } from "../services/timezone.js";
import { createLocationSearch } from "../ui/locationSearch.js";

const PROFILE_DETAIL_FIELDS = [
  "username",
  "avatar_path",
  "full_name",
  "birth_date",
  "birth_time",
  "birth_place",
  "birth_place_position",
  "birth_timezone",
  "sex"
];

const getLoginUrl = () => (
  new URL(
    window.JayceeAuth?.getLoginUrl
      ? window.JayceeAuth.getLoginUrl()
      : "/src/html/auth/login.html",
    window.location.origin
  ).href
);

const getColorInputValue = (color, fallback) => (
  getProfileColorValue(color) || fallback
);

const setStatus = (statusEl, message, isError = false) => {
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.dataset.state = isError ? "error" : "ready";
};

const parseBirthPosition = (value) => {
  const [latitude, longitude, ...rest] = getDisplayValue(value).split(",").map((part) => part.trim());
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (
    rest.length
    || !Number.isFinite(parsedLatitude)
    || !Number.isFinite(parsedLongitude)
  ) {
    return null;
  }

  return {
    latitude: parsedLatitude,
    longitude: parsedLongitude
  };
};

const formatBirthPosition = ({ latitude, longitude }) => (
  `${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`
);

const setDerivedText = (element, value, fallback = "Select a birth place") => {
  if (!element) return;

  element.textContent = value || fallback;
  element.classList.toggle("is-empty", !value);
};

const isValidBirthDate = (dateValue) => {
  if (!dateValue) return true;

  const date = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return !Number.isNaN(date.getTime()) && date <= today;
};

const isValidBirthTime = (timeValue) => (
  !timeValue || /^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)
);

const getInitialBirthLocation = (profile) => {
  const position = parseBirthPosition(profile?.birth_place_position);
  const name = getDisplayValue(profile?.birth_place);

  if (!position || !name) return null;

  return {
    name,
    ...position
  };
};

const applyProfileTheme = (profile) => {
  document.body.dataset.theme = getThemeSettingsFromProfile(profile).theme;
};

const initThemeControls = ({ profile, themeSettings }) => {
  const controls = document.querySelector("[data-profile-theme-controls]");
  const themeSelect = document.querySelector("[data-profile-theme-select]");
  const primaryInput = document.querySelector("[data-profile-primary-color]");
  const secondaryInput = document.querySelector("[data-profile-secondary-color]");

  if (!controls || !themeSelect || !primaryInput || !secondaryInput || !profile?.id) return;

  controls.addEventListener("submit", (event) => event.preventDefault());
  controls.hidden = false;
  themeSelect.replaceChildren(...(window.JayceeThemes?.options || [{ label: "Aurora", value: "aurora" }]).map((theme) => {
    const option = document.createElement("option");

    option.value = theme.value;
    option.textContent = theme.label;

    return option;
  }));
  themeSelect.value = themeSettings.theme;
  primaryInput.value = getColorInputValue(themeSettings.primary_color, "#53dcc6");
  secondaryInput.value = getColorInputValue(themeSettings.secondary_color, "#ffd56b");

  const syncTheme = ({ includeColors = false } = {}) => {
    themeSettings.theme = window.JayceeThemes?.normalizeTheme?.(themeSelect.value) || "aurora";
    if (includeColors) {
      themeSettings.primary_color = getProfileColorValue(primaryInput.value);
      themeSettings.secondary_color = getProfileColorValue(secondaryInput.value);
    }
    applyProfileTheme(themeSettings);
  };

  themeSelect.addEventListener("change", syncTheme);
  primaryInput.addEventListener("input", () => syncTheme({ includeColors: true }));
  secondaryInput.addEventListener("input", () => syncTheme({ includeColors: true }));
};

const initProfileDetailsControls = ({ profile, status }) => {
  const form = document.querySelector("[data-profile-details-controls]");
  const birthPlaceInput = form?.querySelector("[data-profile-field=\"birth_place\"]");
  const birthDateInput = form?.querySelector("[data-profile-field=\"birth_date\"]");
  const birthTimeInput = form?.querySelector("[data-profile-field=\"birth_time\"]");
  const positionInput = form?.querySelector("[data-profile-field=\"birth_place_position\"]");
  const timezoneInput = form?.querySelector("[data-profile-field=\"birth_timezone\"]");
  const positionValue = form?.querySelector("[data-profile-derived=\"birth_place_position\"]");
  const timezoneValue = form?.querySelector("[data-profile-derived=\"birth_timezone\"]");
  const locationResults = form?.querySelector("[data-profile-location-results]");
  let selectedLocation = getInitialBirthLocation(profile);

  if (!form || !profile?.id) return;

  const fields = PROFILE_DETAIL_FIELDS
    .map((fieldName) => [fieldName, form.querySelector(`[data-profile-field="${fieldName}"]`)])
    .filter(([, field]) => field);

  fields.forEach(([fieldName, field]) => {
    field.value = fieldName === "birth_time"
      ? getDisplayValue(profile[fieldName]).slice(0, 5)
      : getDisplayValue(profile[fieldName]);
  });
  if (birthDateInput) {
    birthDateInput.max = new Date().toISOString().split("T")[0];
  }
  setDerivedText(positionValue, positionInput?.value || "");
  setDerivedText(timezoneValue, timezoneInput?.value || "");
  form.querySelectorAll("[data-profile-sex-option]").forEach((option) => {
    option.checked = getDisplayValue(option.value) === getDisplayValue(profile.sex);
  });

  const setDerivedBirthPlaceFields = async (location) => {
    selectedLocation = location;

    if (!location) {
      if (positionInput) positionInput.value = "";
      if (timezoneInput) timezoneInput.value = "";
      setDerivedText(positionValue, "");
      setDerivedText(timezoneValue, "");
      return;
    }

    const formattedPosition = formatBirthPosition(location);

    if (positionInput) {
      positionInput.value = formattedPosition;
    }
    setDerivedText(positionValue, formattedPosition);

    if (!timezoneInput) return;

    timezoneInput.value = "Resolving...";
    setDerivedText(timezoneValue, "Resolving...", "");

    try {
      timezoneInput.value = await getTimezoneForCoordinates(location);
      setDerivedText(timezoneValue, timezoneInput.value);
      setStatus(status, "");
    } catch (error) {
      console.error("Jaycee birth timezone lookup failed", error);
      timezoneInput.value = "";
      setDerivedText(timezoneValue, "Unavailable", "");
      setStatus(status, "Timezone could not be resolved for this place.", true);
    }
  };

  if (birthPlaceInput && locationResults) {
    createLocationSearch({
      input: birthPlaceInput,
      resultsList: locationResults,
      initialLocation: selectedLocation,
      onError: (message) => setStatus(status, message, true),
      onSelect: setDerivedBirthPlaceFields
    });
  }

  form.hidden = false;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  return {
    getUpdates: () => {
      if (
        birthPlaceInput
        && getDisplayValue(birthPlaceInput.value)
        && (!selectedLocation || selectedLocation.name !== getDisplayValue(birthPlaceInput.value))
      ) {
        return { error: "Choose a place from the location results." };
      }

      if (!isValidBirthDate(birthDateInput?.value || "")) {
        return { error: "Enter a valid birth date." };
      }

      if (!isValidBirthTime(birthTimeInput?.value || "")) {
        return { error: "Enter a valid birth time." };
      }

      if (timezoneInput?.value === "Resolving...") {
        return { error: "Wait for the birth timezone to finish resolving." };
      }

      const updates = Object.fromEntries(fields.map(([fieldName, field]) => {
        const value = getDisplayValue(field.value);

        return [fieldName, value || null];
      }));
      const sex = getDisplayValue(new FormData(form).get("sex"));

      updates.sex = sex || null;

      return { updates };
    }
  };
};

const initProfileSaveControls = ({ client, detailsControls, profile, themeSettings }) => {
  const actions = document.querySelector("[data-profile-settings-actions]");
  const button = document.querySelector("[data-profile-save]");
  const status = document.querySelector("[data-profile-save-status]");

  if (!actions || !button || !profile?.id) return;

  actions.hidden = false;
  button.addEventListener("click", async () => {
    const detailsResult = detailsControls?.getUpdates?.() || { updates: {} };

    if (detailsResult.error) {
      setStatus(status, detailsResult.error, true);
      return;
    }

    const updates = {
      ...detailsResult.updates,
      primary_color: themeSettings.primary_color || null,
      secondary_color: themeSettings.secondary_color || null,
      theme: themeSettings.theme
    };

    button.disabled = true;
    setStatus(status, "Saving...");

    try {
      const { error } = await client
        .from(PROFILE_TABLE)
        .update(updates)
        .eq("id", profile.id);

      if (error) throw error;

      Object.assign(profile, updates);
      setStatus(status, "Saved.");
      window.JayceeAuth?.refreshHeader?.();
    } catch (error) {
      console.error("Jaycee profile settings save failed", error);
      setStatus(status, error?.message || "Profile could not be saved.", true);
    } finally {
      button.disabled = false;
    }
  });
};

export const initJayceeEditProfilePage = async () => {
  const shell = document.querySelector("[data-profile-settings-shell]");
  const pageStatus = document.querySelector("[data-profile-settings-status]");

  if (!shell) return;

  try {
    const client = await window.JayceeAuth.getSupabaseClient();
    const sessionResult = await window.JayceeAuth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (!user) {
      window.location.href = getLoginUrl();
      return;
    }

    const profile = await fetchProfileByUserId(client, user.id);

    if (!profile) {
      shell.hidden = false;
      setStatus(pageStatus, "Profile not found.", true);
      return;
    }

    shell.hidden = false;
    applyProfileTheme(profile);
    const themeSettings = getThemeSettingsFromProfile(profile);
    const saveStatus = document.querySelector("[data-profile-save-status]");

    initThemeControls({
      profile,
      themeSettings
    });
    const detailsControls = initProfileDetailsControls({
      profile,
      status: saveStatus
    });

    initProfileSaveControls({
      client,
      detailsControls,
      profile,
      themeSettings
    });
    setStatus(pageStatus, "");
  } catch (error) {
    console.error("Jaycee edit profile load failed", error);
    shell.hidden = false;
    setStatus(pageStatus, error?.message || "Profile could not be loaded.", true);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initJayceeEditProfilePage, { once: true });
} else {
  initJayceeEditProfilePage();
}
