import {
  PROFILE_TABLE,
  fetchProfileByUserId,
  getDisplayValue,
  getProfileColorValue,
  getThemeSettingsFromProfile
} from "./jaycee-data.js";

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

const applyProfileTheme = (profile) => {
  document.body.dataset.theme = getThemeSettingsFromProfile(profile).theme;
};

const initThemeControls = ({ client, profile, themeSettings }) => {
  const controls = document.querySelector("[data-profile-theme-controls]");
  const themeSelect = document.querySelector("[data-profile-theme-select]");
  const primaryInput = document.querySelector("[data-profile-primary-color]");
  const secondaryInput = document.querySelector("[data-profile-secondary-color]");
  const status = document.querySelector("[data-profile-theme-status]");
  let saveTimer = null;

  if (!controls || !themeSelect || !primaryInput || !secondaryInput || !profile?.id) return;

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

  const saveTheme = async () => {
    setStatus(status, "Saving...");

    const { error } = await client
      .from(PROFILE_TABLE)
      .update({
        primary_color: themeSettings.primary_color || null,
        secondary_color: themeSettings.secondary_color || null,
        theme: themeSettings.theme
      })
      .eq("id", profile.id);

    if (error) throw error;

    Object.assign(profile, themeSettings);
    setStatus(status, "Saved.");
    window.JayceeAuth?.refreshHeader?.();
  };

  const scheduleSave = () => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
    }

    saveTimer = window.setTimeout(async () => {
      saveTimer = null;

      try {
        await saveTheme();
      } catch (error) {
        console.error("Jaycee profile theme save failed", error);
        setStatus(status, error?.message || "Theme could not be saved.", true);
      }
    }, 320);
  };

  const syncTheme = ({ includeColors = false } = {}) => {
    themeSettings.theme = window.JayceeThemes?.normalizeTheme?.(themeSelect.value) || "aurora";
    if (includeColors) {
      themeSettings.primary_color = getProfileColorValue(primaryInput.value);
      themeSettings.secondary_color = getProfileColorValue(secondaryInput.value);
    }
    applyProfileTheme(themeSettings);
    scheduleSave();
  };

  themeSelect.addEventListener("change", syncTheme);
  primaryInput.addEventListener("input", () => syncTheme({ includeColors: true }));
  secondaryInput.addEventListener("input", () => syncTheme({ includeColors: true }));
};

const initProfileDetailsControls = ({ client, profile }) => {
  const form = document.querySelector("[data-profile-details-controls]");
  const status = document.querySelector("[data-profile-details-status]");

  if (!form || !profile?.id) return;

  const fields = PROFILE_DETAIL_FIELDS
    .map((fieldName) => [fieldName, form.querySelector(`[data-profile-field="${fieldName}"]`)])
    .filter(([, field]) => field);

  fields.forEach(([fieldName, field]) => {
    field.value = getDisplayValue(profile[fieldName]);
  });

  form.hidden = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(status, "Saving...");

    const updates = Object.fromEntries(fields.map(([fieldName, field]) => {
      const value = getDisplayValue(field.value);

      return [fieldName, value || null];
    }));

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
      console.error("Jaycee profile details save failed", error);
      setStatus(status, error?.message || "Profile could not be saved.", true);
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
    initThemeControls({
      client,
      profile,
      themeSettings: getThemeSettingsFromProfile(profile)
    });
    initProfileDetailsControls({ client, profile });
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
