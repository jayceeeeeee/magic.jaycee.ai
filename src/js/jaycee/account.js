import {
  JAYCEE_GAME_CONFIG
} from "../config/game-config.js";
import {
  PROFILE_TABLE,
  fetchDynamicFractalElements,
  fetchProfileByUserId,
  fetchPublicProfiles,
  fetchSkillsByIds,
  fetchUserDynamicFractals,
  fetchUserGameSettings,
  getDisplayValue,
  getProfileColorValue,
  getThemeSettingsFromProfile,
  updateFractalElements,
  updateSkills,
  updateUserGameSettings
} from "../config/data.js";
import { getTimezoneForCoordinates } from "../services/timezone.js";
import { createLocationSearch } from "../ui/locationSearch.js";

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

const getColorInputValue = (color, fallback) => (
  getProfileColorValue(color) || fallback
);

const applyProfileTheme = (themeSettings) => {
  document.body.dataset.theme = getThemeSettingsFromProfile(themeSettings).theme;
};

const parseBirthPosition = (value) => {
  const [latitude, longitude, ...rest] = getDisplayValue(value).split(",").map((part) => part.trim());
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (rest.length || !Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) return null;

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

const createSexField = (profile) => {
  const field = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const options = document.createElement("div");

  field.className = "profile-gender-field";
  legend.textContent = "Sex";
  options.className = "profile-gender-options";
  ["male", "female"].forEach((sex) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");

    label.className = "profile-gender-option";
    input.name = "sex";
    input.type = "radio";
    input.value = sex;
    input.checked = getDisplayValue(profile.sex) === sex;
    text.textContent = sex;
    label.append(input, text);
    options.append(label);
  });
  field.append(legend, options);

  return field;
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

const getFractalById = (fractals, id) => (
  fractals.find((fractal) => getDisplayValue(fractal.id) === getDisplayValue(id)) || null
);

const getFractalByLabel = (fractals, label) => (
  fractals.find((fractal) => (
    getDisplayValue(fractal.label).toLowerCase() === getDisplayValue(label).toLowerCase()
  )) || null
);

const getConfiguredFractals = ({ fractals, gameSettings }) => {
  const passive = getFractalById(fractals, gameSettings?.primary_fractal)
    || getFractalByLabel(fractals, JAYCEE_GAME_CONFIG.passive.fractalLabel);
  const active = JAYCEE_GAME_CONFIG.activeAbilities
    .map((ability) => getFractalByLabel(fractals, ability.fractalLabel))
    .filter(Boolean);
  const ultimate = getFractalById(fractals, gameSettings?.ultimate_fractal)
    || getFractalByLabel(fractals, JAYCEE_GAME_CONFIG.ultimate.fractalLabel);

  return [passive, ...active, ultimate].filter(Boolean);
};

const getElementsForFractal = (elements, fractalId) => (
  elements
    .filter((element) => getDisplayValue(element.fractal_id) === getDisplayValue(fractalId))
    .slice()
    .sort((first, second) => Number(first.position) - Number(second.position))
);

const getSkillRows = ({ fractals, gameSettings, skills }) => {
  const configuredFractals = getConfiguredFractals({ fractals, gameSettings });

  return configuredFractals
    .filter((fractal) => getDisplayValue(fractal.skill))
    .map((fractal, index) => ({
      fractal,
      label: index < 3 ? `Active ${index + 1}` : "Ultimate",
      skill: skills.find((skill) => getDisplayValue(skill.id) === getDisplayValue(fractal.skill)) || null
    }))
    .filter((row) => row.skill);
};

const createCharacterSection = ({ profile, themeSettings }) => {
  const { content, section } = createSection("Character", "is-character");
  const themeForm = document.createElement("form");
  const detailsForm = document.createElement("form");
  const themeSelectLabel = document.createElement("label");
  const themeLabelText = document.createElement("span");
  const themeSelect = document.createElement("select");
  const primaryField = createTextField({
    label: "Primary",
    name: "primary_color",
    type: "color",
    value: getColorInputValue(themeSettings.primary_color, "#53dcc6")
  });
  const secondaryField = createTextField({
    label: "Secondary",
    name: "secondary_color",
    type: "color",
    value: getColorInputValue(themeSettings.secondary_color, "#ffd56b")
  });
  const usernameField = createTextField({ label: "Username", name: "username", value: profile.username });
  const avatarField = createTextField({ label: "Avatar path", name: "avatar_path", value: profile.avatar_path });
  const nameField = createTextField({ label: "Full name", name: "full_name", value: profile.full_name });

  themeForm.className = "profile-theme-controls jaycee-account-theme";
  detailsForm.className = "profile-details-controls jaycee-account-form";
  themeLabelText.textContent = "Theme";
  themeSelect.name = "theme";
  themeSelect.replaceChildren(...(window.JayceeThemes?.options || [{ label: "Aurora", value: "aurora" }]).map((theme) => {
    const option = document.createElement("option");

    option.value = theme.value;
    option.textContent = theme.label;

    return option;
  }));
  themeSelect.value = themeSettings.theme;
  themeSelectLabel.append(themeLabelText, themeSelect);
  themeForm.append(themeSelectLabel, primaryField.wrapper, secondaryField.wrapper);

  nameField.wrapper.classList.add("profile-field-wide");
  detailsForm.append(usernameField.wrapper, avatarField.wrapper, nameField.wrapper);
  content.append(themeForm, detailsForm);

  const syncTheme = () => {
    themeSettings.theme = window.JayceeThemes?.normalizeTheme?.(themeSelect.value) || "aurora";
    themeSettings.primary_color = getProfileColorValue(primaryField.input.value);
    themeSettings.secondary_color = getProfileColorValue(secondaryField.input.value);
    applyProfileTheme(themeSettings);
  };

  themeForm.addEventListener("submit", (event) => event.preventDefault());
  detailsForm.addEventListener("submit", (event) => event.preventDefault());
  themeSelect.addEventListener("change", syncTheme);
  primaryField.input.addEventListener("input", syncTheme);
  secondaryField.input.addEventListener("input", syncTheme);

  return {
    getUpdates: () => ({
      avatar_path: getDisplayValue(avatarField.input.value) || null,
      full_name: getDisplayValue(nameField.input.value) || null,
      primary_color: themeSettings.primary_color || null,
      secondary_color: themeSettings.secondary_color || null,
      theme: themeSettings.theme,
      username: getDisplayValue(usernameField.input.value) || null
    }),
    section
  };
};

const createMapsSection = ({ profile, status }) => {
  const { content, section } = createSection("Maps", "is-maps");
  const form = document.createElement("form");
  const sexField = createSexField(profile);
  const birthDateField = createTextField({ label: "Birth date", name: "birth_date", type: "date", value: profile.birth_date });
  const birthTimeField = createTextField({ label: "Birth time", name: "birth_time", type: "time", value: getDisplayValue(profile.birth_time).slice(0, 5) });
  const locationWrapper = document.createElement("div");
  const birthPlaceField = createTextField({ label: "Birth place", name: "birth_place", value: profile.birth_place });
  const results = document.createElement("ul");
  const derived = document.createElement("div");
  const positionDisplay = document.createElement("strong");
  const timezoneDisplay = document.createElement("strong");
  const positionInput = document.createElement("input");
  const timezoneInput = document.createElement("input");
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
  let selectedLocation = getInitialBirthLocation(profile);

  form.className = "profile-details-controls jaycee-account-form";
  mannaFields.className = "profile-manna-fields";
  birthDateField.input.max = new Date().toISOString().split("T")[0];
  locationWrapper.className = "location-field profile-location-field";
  results.className = "location-results";
  results.hidden = true;
  results.setAttribute("aria-label", "Location suggestions");
  derived.className = "profile-derived-birth-data";
  positionInput.type = "hidden";
  timezoneInput.type = "hidden";
  positionInput.value = getDisplayValue(profile.birth_place_position);
  timezoneInput.value = getDisplayValue(profile.birth_timezone);
  mannaTargetField.input.step = "any";
  setDerivedText(positionDisplay, positionInput.value);
  setDerivedText(timezoneDisplay, timezoneInput.value);
  derived.append(
    Object.assign(document.createElement("div"), { innerHTML: "<span>Birth position</span>" }),
    Object.assign(document.createElement("div"), { innerHTML: "<span>Birth timezone</span>" })
  );
  derived.children[0].append(positionDisplay);
  derived.children[1].append(timezoneDisplay);
  locationWrapper.append(birthPlaceField.wrapper, results);
  mannaFields.append(mannaTargetField.wrapper, mannaUnitField.wrapper, mannaCycleField.wrapper);
  form.append(
    sexField,
    birthDateField.wrapper,
    birthTimeField.wrapper,
    locationWrapper,
    derived,
    mannaFields,
    positionInput,
    timezoneInput
  );
  content.append(form);

  const setDerivedBirthPlaceFields = async (location) => {
    selectedLocation = location;

    if (!location) {
      positionInput.value = "";
      timezoneInput.value = "";
      setDerivedText(positionDisplay, "");
      setDerivedText(timezoneDisplay, "");
      return;
    }

    const formattedPosition = formatBirthPosition(location);

    positionInput.value = formattedPosition;
    setDerivedText(positionDisplay, formattedPosition);
    timezoneInput.value = "Resolving...";
    setDerivedText(timezoneDisplay, "Resolving...", "");

    try {
      timezoneInput.value = await getTimezoneForCoordinates(location);
      setDerivedText(timezoneDisplay, timezoneInput.value);
      setStatus(status, "");
    } catch (error) {
      console.error("Jaycee birth timezone lookup failed", error);
      timezoneInput.value = "";
      setDerivedText(timezoneDisplay, "Unavailable", "");
      setStatus(status, "Timezone could not be resolved for this place.", true);
    }
  };

  createLocationSearch({
    input: birthPlaceField.input,
    resultsList: results,
    initialLocation: selectedLocation,
    onError: (message) => setStatus(status, message, true),
    onSelect: setDerivedBirthPlaceFields
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  return {
    getUpdates: () => {
      if (
        birthPlaceField.input
        && getDisplayValue(birthPlaceField.input.value)
        && (!selectedLocation || selectedLocation.name !== getDisplayValue(birthPlaceField.input.value))
      ) {
        return { error: "Choose a place from the location results." };
      }

      if (!isValidBirthDate(birthDateField.input.value)) {
        return { error: "Enter a valid birth date." };
      }

      if (!isValidBirthTime(birthTimeField.input.value)) {
        return { error: "Enter a valid birth time." };
      }

      if (timezoneInput.value === "Resolving...") {
        return { error: "Wait for the birth timezone to finish resolving." };
      }

      return {
        updates: {
          birth_date: getDisplayValue(birthDateField.input.value) || null,
          birth_place: getDisplayValue(birthPlaceField.input.value) || null,
          birth_place_position: getDisplayValue(positionInput.value) || null,
          birth_time: getDisplayValue(birthTimeField.input.value) || null,
          birth_timezone: getDisplayValue(timezoneInput.value) || null,
          sex: getDisplayValue(new FormData(form).get("sex")) || null,
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

const createItemsSection = ({ elements, fractals }) => {
  const { content, section } = createSection("Items", "is-items");
  const picker = document.createElement("label");
  const pickerText = document.createElement("span");
  const select = document.createElement("select");
  const grid = document.createElement("div");
  let selectedFractalId = getDisplayValue(fractals[0]?.id);

  picker.className = "profile-primary-fractal-field";
  pickerText.textContent = "Fractal";
  select.className = "profile-primary-fractal-select";
  select.replaceChildren(...fractals.map((fractal) => {
    const option = document.createElement("option");

    option.value = getDisplayValue(fractal.id);
    option.textContent = getDisplayValue(fractal.label) || "Untitled item";

    return option;
  }));
  picker.append(pickerText, select);
  grid.className = "jaycee-item-elements-grid";
  content.append(picker, grid);

  const renderElements = () => {
    const fractalElements = getElementsForFractal(elements, selectedFractalId);

    grid.replaceChildren(...fractalElements.map((element) => {
      const label = document.createElement("label");
      const span = document.createElement("span");
      const input = document.createElement("input");

      label.className = "profile-primary-fractal-field";
      span.textContent = `Position ${element.position}`;
      input.value = getDisplayValue(element.value);
      input.dataset.elementId = element.id;
      input.addEventListener("input", () => {
        element.value = input.value;
      });
      label.append(span, input);

      return label;
    }));
  };

  select.addEventListener("change", () => {
    selectedFractalId = select.value;
    renderElements();
  });
  renderElements();

  return {
    getUpdates: () => elements.map((element) => ({
      id: element.id,
      value: getDisplayValue(element.value)
    })),
    section
  };
};

const createSkillsSection = ({ fractals, gameForm, publicProfiles, skillRows }) => {
  const { content, section } = createSection("Skills", "is-skills");
  const skillList = document.createElement("div");
  const teammateLabel = document.createElement("label");
  const teammateText = document.createElement("span");
  const teammateSelect = document.createElement("select");
  const emptyOption = document.createElement("option");

  skillList.className = "jaycee-account-skill-list";
  skillRows.forEach((row, index) => {
    const item = document.createElement("article");
    const badge = document.createElement("span");
    const field = createTextField({
      label: `${row.label} - ${getDisplayValue(row.fractal.label)}`,
      name: row.skill.id,
      value: row.skill.label
    });

    item.className = "profile-skill-row jaycee-account-skill-row";
    badge.className = "profile-skill-badge";
    badge.textContent = row.label === "Ultimate" ? "U" : String(index + 1);
    field.input.addEventListener("input", () => {
      row.skill.label = field.input.value;
    });
    item.append(badge, field.wrapper);
    skillList.append(item);
  });

  teammateLabel.className = "profile-primary-fractal-field";
  teammateText.textContent = "Follows";
  teammateSelect.className = "profile-primary-fractal-select";
  emptyOption.value = "";
  emptyOption.textContent = "Choose a follow";
  teammateSelect.replaceChildren(emptyOption, ...publicProfiles.map((profile) => {
    const option = document.createElement("option");

    option.value = getDisplayValue(profile.id);
    option.textContent = getDisplayValue(profile.username) || "Untitled profile";

    return option;
  }));
  teammateSelect.value = getDisplayValue(gameForm?.ultimate_link);
  teammateLabel.append(teammateText, teammateSelect);
  content.append(skillList, teammateLabel);

  return {
    getGameUpdates: () => ({
      ultimate_link: getDisplayValue(teammateSelect.value) || null
    }),
    getSkillUpdates: () => skillRows.map((row) => ({
      id: row.skill.id,
      label: getDisplayValue(row.skill.label)
    })),
    section
  };
};

export const initJayceeAccountPage = async () => {
  const shell = document.querySelector("[data-account-shell]");
  const sections = document.querySelector("[data-account-sections]");
  const status = document.querySelector("[data-account-status]");
  const actions = document.querySelector("[data-account-actions]");
  const saveButton = document.querySelector("[data-account-save]");
  const saveStatus = document.querySelector("[data-account-save-status]");

  if (!shell || !sections || !saveButton) return;

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
      setStatus(status, "Profile not found.", true);
      return;
    }

    const [fractals, gameSettings, publicProfiles] = await Promise.all([
      fetchUserDynamicFractals(client, profile),
      fetchUserGameSettings(client, profile),
      fetchPublicProfiles(client)
    ]);
    const configuredFractals = getConfiguredFractals({ fractals, gameSettings });
    const [elements, skills] = await Promise.all([
      fetchDynamicFractalElements(client, configuredFractals.map((fractal) => fractal.id)),
      fetchSkillsByIds(client, configuredFractals.map((fractal) => fractal.skill))
    ]);
    const skillRows = getSkillRows({ fractals, gameSettings, skills });
    const themeSettings = getThemeSettingsFromProfile(profile);

    applyProfileTheme(themeSettings);
    const character = createCharacterSection({ profile, themeSettings });
    const items = createItemsSection({ elements, fractals: configuredFractals });
    const maps = createMapsSection({ profile, status: saveStatus });
    const skillsPanel = createSkillsSection({
      fractals: configuredFractals,
      gameForm: gameSettings,
      publicProfiles,
      skillRows
    });

    sections.replaceChildren(character.section, items.section, maps.section, skillsPanel.section);
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
        const profileUpdates = {
          ...character.getUpdates(),
          ...mapsResult.updates
        };

        const { error } = await client
          .from(PROFILE_TABLE)
          .update(profileUpdates)
          .eq("id", profile.id);

        if (error) throw error;

        await Promise.all([
          updateSkills(client, skillsPanel.getSkillUpdates()),
          updateFractalElements(client, items.getUpdates()),
          updateUserGameSettings(client, profile, skillsPanel.getGameUpdates())
        ]);

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
