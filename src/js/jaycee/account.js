import {
  PROFILE_TABLE,
  USER_IMAGES_BUCKET,
  fetchProfileByUserId,
  getAvatarImageUrl,
  getDisplayValue,
} from "../config/data.js";

const getLoginUrl = () => (
  new URL(
    window.JayceeAuth?.getLoginUrl
      ? window.JayceeAuth.getLoginUrl()
      : "/login.html",
    window.location.origin
  ).href
);

const setStatus = (element, message, isError = false) => {
  if (!element) return;

  element.textContent = message;
  element.dataset.state = isError ? "error" : "ready";
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

const createSection = (title, className = "") => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");

  section.className = ["profile-resonance-column", "jaycee-account-section", className].filter(Boolean).join(" ");
  heading.className = "profile-resonance-column-title";
  heading.textContent = title;
  content.className = "jaycee-account-section-content";
  section.append(heading, content);

  return { content, section };
};

const createTextField = ({ inputMode = "", label, name, type = "text", value = "" }) => {
  const wrapper = document.createElement("label");
  const text = document.createElement("span");
  const input = document.createElement("input");

  text.textContent = label;
  input.name = name;
  input.type = type;
  input.value = getDisplayValue(value);
  if (inputMode) {
    input.inputMode = inputMode;
  }
  wrapper.append(text, input);

  return { input, wrapper };
};

const createSelectField = ({ label, name, options, value = "" }) => {
  const wrapper = document.createElement("label");
  const text = document.createElement("span");
  const select = document.createElement("select");
  const normalizedValue = getDisplayValue(value);

  text.textContent = label;
  select.name = name;
  select.replaceChildren(...options.map((optionConfig) => {
    const option = document.createElement("option");

    option.value = optionConfig.value;
    option.textContent = optionConfig.label;

    return option;
  }));
  select.value = options.some((option) => option.value === normalizedValue)
    ? normalizedValue
    : getDisplayValue(options[0]?.value);
  wrapper.append(text, select);

  return { select, wrapper };
};

const getCurrencyOptions = () => {
  const fallbackCurrencies = ["EUR", "USD", "JPY", "GBP", "CHF", "CAD", "AUD", "NZD", "CNY", "HKD", "SGD", "KRW", "INR", "BRL", "MXN", "ZAR"];
  let currencies = fallbackCurrencies;

  try {
    currencies = typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("currency")
      : fallbackCurrencies;
  } catch (error) {
    currencies = fallbackCurrencies;
  }

  const names = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames([navigator.language || "en"], { type: "currency" })
    : null;

  return currencies.map((currency) => {
    const name = names?.of(currency);

    return {
      label: name && name !== currency ? `${currency} - ${name}` : currency,
      value: currency
    };
  });
};

const normalizeCurrencyValue = (value) => (
  /^[A-Z]{3}$/.test(getDisplayValue(value).toUpperCase())
    ? getDisplayValue(value).toUpperCase()
    : "EUR"
);

const MANNA_CYCLE_OPTIONS = [
  { label: "Year", value: "year" },
  { label: "Month", value: "month" },
  { label: "Day", value: "day" }
];

const sanitizeAvatarFileName = (fileName) => {
  const cleanedName = getDisplayValue(fileName)
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 90);

  return cleanedName || `avatar-${Date.now()}`;
};

const createCharacterSection = ({ avatarUrl = "", profile }) => {
  const { content, section } = createSection("Character", "is-character");
  const detailsForm = document.createElement("form");
  const avatarField = document.createElement("label");
  const avatarText = document.createElement("span");
  const avatarControl = document.createElement("div");
  const avatarPreview = document.createElement("span");
  const avatarInput = document.createElement("input");
  const avatarButton = document.createElement("span");
  const usernameField = createTextField({ label: "Username", name: "username", value: profile.username });
  const nameField = createTextField({ label: "Full name", name: "full_name", value: profile.full_name });
  let avatarPreviewUrl = "";

  detailsForm.className = "profile-details-controls jaycee-account-form";
  avatarField.className = "account-avatar-field";
  avatarControl.className = "account-avatar-control";
  avatarPreview.className = "account-avatar-preview";
  avatarButton.className = "account-avatar-button";
  avatarText.textContent = "Profile photo";
  avatarInput.name = "avatar";
  avatarInput.type = "file";
  avatarInput.accept = "image/*";
  avatarButton.textContent = "Choose";
  if (avatarUrl) {
    const image = document.createElement("img");

    image.alt = "";
    image.src = avatarUrl;
    avatarPreview.append(image);
  } else {
    avatarPreview.textContent = (getDisplayValue(profile.full_name) || getDisplayValue(profile.username) || "?").slice(0, 1).toUpperCase();
  }
  avatarControl.append(avatarPreview, avatarButton, avatarInput);
  avatarField.append(avatarText, avatarControl);
  nameField.wrapper.classList.add("profile-field-wide");
  detailsForm.append(avatarField, usernameField.wrapper, nameField.wrapper);
  content.append(detailsForm);

  detailsForm.addEventListener("submit", (event) => event.preventDefault());
  avatarInput.addEventListener("change", () => {
    const [file] = avatarInput.files || [];

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
      avatarPreviewUrl = "";
    }

    if (!file) return;

    avatarPreviewUrl = URL.createObjectURL(file);
    const image = document.createElement("img");

    image.alt = "";
    image.src = avatarPreviewUrl;
    avatarPreview.replaceChildren(image);
  });

  return {
    getUpdates: () => ({
      avatarFile: avatarInput.files?.[0] || null,
      full_name: getDisplayValue(nameField.input.value) || null,
      username: getDisplayValue(usernameField.input.value) || null,
    }),
    section
  };
};

const createMapsSection = ({ profile }) => {
  const { content, section } = createSection("Maps", "is-maps");
  const form = document.createElement("form");
  const birthDateField = createTextField({ label: "Birth date", name: "birth_date", type: "date", value: profile.birth_date });
  const birthTimeField = createTextField({ label: "Birth time", name: "birth_time", type: "time", value: getDisplayValue(profile.birth_time).slice(0, 5) });
  const mannaTargetField = createTextField({
    inputMode: "decimal",
    label: "Manna target",
    name: "manna_target",
    type: "number",
    value: profile.manna_target
  });
  const mannaUnitField = createSelectField({
    label: "Manna unit",
    name: "manna_unit",
    options: getCurrencyOptions(),
    value: normalizeCurrencyValue(profile.manna_unit)
  });
  const mannaCycleField = createSelectField({
    label: "Manna cycle",
    name: "manna_cycle",
    options: MANNA_CYCLE_OPTIONS,
    value: getDisplayValue(profile.manna_cycle) || "year"
  });
  const mannaFields = document.createElement("div");

  form.className = "profile-details-controls jaycee-account-form";
  mannaFields.className = "profile-manna-fields";
  birthDateField.input.max = new Date().toISOString().split("T")[0];
  mannaTargetField.input.step = "any";
  mannaFields.append(mannaTargetField.wrapper, mannaUnitField.wrapper, mannaCycleField.wrapper);
  form.append(
    birthDateField.wrapper,
    birthTimeField.wrapper,
    mannaFields
  );
  content.append(form);

  form.addEventListener("submit", (event) => event.preventDefault());

  return {
    getUpdates: () => {
      if (!isValidBirthDate(birthDateField.input.value)) {
        return { error: "Enter a valid birth date." };
      }

      if (!isValidBirthTime(birthTimeField.input.value)) {
        return { error: "Enter a valid birth time." };
      }

      return {
        updates: {
          birth_date: getDisplayValue(birthDateField.input.value) || null,
          birth_time: getDisplayValue(birthTimeField.input.value) || null,
          manna_target: Number.isFinite(Number(mannaTargetField.input.value)) && getDisplayValue(mannaTargetField.input.value)
            ? Number(mannaTargetField.input.value)
            : 0,
          manna_unit: normalizeCurrencyValue(mannaUnitField.select.value),
          manna_cycle: getDisplayValue(mannaCycleField.select.value) || "year"
        }
      };
    },
    section
  };
};

const uploadProfileAvatar = async ({ client, file, profile }) => {
  if (!file || !profile?.id) return "";

  const fileName = sanitizeAvatarFileName(file.name);
  const storagePath = `${profile.id}/${fileName}`;
  const { error } = await client.storage
    .from(USER_IMAGES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type || "application/octet-stream",
      upsert: true
    });

  if (error) throw error;

  return fileName;
};

export const initJayceeAccountPage = async () => {
  const shell = document.querySelector("[data-account-shell]");
  const sections = document.querySelector("[data-account-sections]");
  const status = document.querySelector("[data-account-status]");
  const actions = document.querySelector("[data-account-actions]");
  const saveButton = document.querySelector("[data-account-save]");
  const saveStatus = document.querySelector("[data-account-save-status]");
  const panel = document.querySelector("[data-account-shell] .jaycee-settings-panel");
  const toggleButton = document.querySelector("[data-account-toggle]");

  if (!shell || !sections || !saveButton) return;

  toggleButton?.addEventListener("click", () => {
    const isCollapsed = shell.classList.toggle("is-account-panel-collapsed");

    toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
    if (!isCollapsed) {
      panel?.focus?.();
    }
  });

  try {
    const client = await window.JayceeAuth.getSupabaseClient();
    const sessionResult = await window.JayceeAuth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (!user) {
      if (window.location.pathname.endsWith("/account.html")) {
        window.location.href = getLoginUrl();
      }
      return;
    }

    const profile = await fetchProfileByUserId(client, user.id);

    if (!profile) {
      shell.hidden = false;
      setStatus(status, "Profile not found.", true);
      return;
    }

    let avatarUrl = "";

    try {
      avatarUrl = await getAvatarImageUrl(client, profile);
    } catch (error) {
      console.warn("Account avatar could not be loaded", error);
    }

    const character = createCharacterSection({ avatarUrl, profile });
    const maps = createMapsSection({ profile });

    sections.replaceChildren(character.section, maps.section);
    shell.hidden = false;
    actions.hidden = false;
    setStatus(status, "");

    saveButton.addEventListener("click", async () => {
      const mapsResult = maps.getUpdates();

      if (mapsResult.error) {
        setStatus(saveStatus, mapsResult.error, true);
        return;
      }

      saveButton.disabled = true;
      setStatus(saveStatus, "Saving...");

      try {
        const characterUpdates = character.getUpdates();
        const profileUpdates = {
          full_name: characterUpdates.full_name,
          username: characterUpdates.username,
          ...mapsResult.updates
        };

        if (characterUpdates.avatarFile) {
          setStatus(saveStatus, "Uploading photo...");
          profileUpdates.avatar_path = await uploadProfileAvatar({
            client,
            file: characterUpdates.avatarFile,
            profile
          });
          setStatus(saveStatus, "Saving...");
        }

        const { error } = await client
          .from(PROFILE_TABLE)
          .update(profileUpdates)
          .eq("id", profile.id);

        if (error) throw error;

        Object.assign(profile, profileUpdates);
        setStatus(saveStatus, "Saved.");
        window.JayceeAuth?.refreshHeader?.();
      } catch (error) {
        console.error("Jaycee account save failed", error);
        setStatus(saveStatus, error?.message || "Account could not be saved.", true);
      } finally {
        saveButton.disabled = false;
      }
    });
  } catch (error) {
    console.error("Jaycee account load failed", error);
    shell.hidden = false;
    setStatus(status, error?.message || "Account could not be loaded.", true);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initJayceeAccountPage, { once: true });
} else {
  initJayceeAccountPage();
}
