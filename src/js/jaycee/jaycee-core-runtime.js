import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee,
  getJayceeHit,
  getTopCenteredLastSegmentRotation
} from "./jaycee-core.js";
import {
  DEFAULT_SELECTED_NUMBER,
  fetchDynamicFractalElements,
  fetchProfileByUserId,
  fetchProfileByUsername,
  fetchPublicProfiles,
  fetchSkillsByIds,
  fetchUserDynamicFractals,
  fetchUserGameSettings,
  getAvatarImageUrl,
  getDisplayValue,
  getThemeSettingsFromProfile,
  loadOptionalImage,
  updateSkills,
  updateUserDynamicFractals,
  upsertUserGameSettings
} from "./jaycee-data.js";

const PROFILE_CORE_METRICS = {
  ringMaxRadialShare: 0.34,
  ringWidthMax: 32,
  ringWidthMin: 14,
  ringWidthRatio: 0.072
};
const PROFILE_RING_ACTIVE_FILL_ALPHA = 0.09;
const PROFILE_RING_FILL_ALPHA = 0.26;
const PROFILE_VIEW_CACHE_PREFIX = "jayceeProfileView";
const ACTIVE_RING_LIMIT = 3;

const getProfileViewCacheKey = ({ pageMode, profile, publicUsername }) => {
  const profileKey = profile?.id || publicUsername || "core";

  return `${PROFILE_VIEW_CACHE_PREFIX}:${pageMode}:${profileKey}`;
};

const loadProfileViewCache = (cacheKey) => {
  try {
    const value = window.localStorage.getItem(cacheKey);

    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.warn("Jaycee profile view cache could not be loaded", error);
    return null;
  }
};

const saveProfileViewCache = (cacheKey, state) => {
  if (!cacheKey) return;

  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(state));
  } catch (error) {
    console.warn("Jaycee profile view cache could not be saved", error);
  }
};

const applyProfileTheme = (profile) => {
  const theme = getThemeSettingsFromProfile(profile).theme;

  document.body.dataset.theme = theme;
};

const getLoginUrl = () => (
  new URL(
    window.JayceeAuth?.getLoginUrl
      ? window.JayceeAuth.getLoginUrl()
      : "/src/html/auth/auth.html",
    window.location.origin
  )
);

const redirectToLogin = () => {
  const loginUrl = getLoginUrl();

  loginUrl.searchParams.set("redirect", window.location.pathname);
  window.location.href = loginUrl.href;
};

const getEmptyLabels = (count) => Array.from({ length: count }, () => "");

const getActiveSegmentIndex = (segmentKeys, selectedSegment) => (
  Math.max(0, segmentKeys.findIndex((key) => String(key) === String(selectedSegment)))
);

const formatDuration = (secondsValue, { compact = true } = {}) => {
  let seconds = Math.round(Number(secondsValue));

  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  const day = 24 * 60 * 60;
  const hour = 60 * 60;
  const days = Math.floor(seconds / day);
  seconds -= days * 24 * 60 * 60;
  const hours = Math.floor(seconds / hour);
  seconds -= hours * hour;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  const parts = [
    ...(days ? [`${days}d`] : []),
    ...(hours ? [`${hours}h`] : []),
    ...(minutes ? [`${minutes}min`] : []),
    ...(seconds ? [`${seconds}s`] : [])
  ];

  if (compact && parts.length > 2) {
    return parts.slice(0, 2).join(" ");
  }

  return parts.join(" ");
};

const formatDistance = (metersValue) => {
  const meters = Number(metersValue);

  if (!Number.isFinite(meters) || meters <= 0) return "";

  if (meters >= 1000) {
    const kilometers = meters / 1000;

    return `${Number.isInteger(kilometers) ? kilometers : Number(kilometers.toFixed(2))}km`;
  }

  return `${Number.isInteger(meters) ? meters : Number(meters.toFixed(2))}m`;
};

const getElementLabel = (element, fallback = "") => (
  getDisplayValue(element?.label)
  || getDisplayValue(element?.value)
  || getDisplayValue(element?.name)
  || fallback
);

const getFractalElements = (elementsByFractalId, fractalId) => (
  (elementsByFractalId.get(getDisplayValue(fractalId)) || [])
    .slice()
    .sort((first, second) => {
      const firstPosition = Number(first.position);
      const secondPosition = Number(second.position);

      if (Number.isFinite(firstPosition) && Number.isFinite(secondPosition)) {
        return firstPosition - secondPosition;
      }

      return getDisplayValue(first.id).localeCompare(getDisplayValue(second.id));
    })
);

const getFractalById = (dynamicFractals, fractalId) => (
  dynamicFractals.find((fractal) => getDisplayValue(fractal.id) === getDisplayValue(fractalId)) || null
);

const createRingModelFromFractal = ({
  cycleSeconds,
  distanceMeters,
  elements,
  fractal,
  selectedDynamicRingSegments,
  skill = null,
  skillLabel = ""
}) => {
  if (!fractal || !elements.length) return null;

  const segmentKeys = elements.map((element) => getDisplayValue(element.id));
  const selectedSegment = selectedDynamicRingSegments.get(fractal.id) || segmentKeys[0];
  const selectedElement = elements.find((element) => (
    getDisplayValue(element.id) === getDisplayValue(selectedSegment)
  )) || elements[0];

  return {
    cycleSeconds,
    distanceMeters,
    elements,
    fractal,
    id: `dynamic-fractal:${fractal.id}`,
    label: getDisplayValue(fractal.label) || "Fractal",
    practiceSeconds: cycleSeconds,
    segmentKeys,
    selectedElement,
    selectedSegment,
    skill,
    skillLabel
  };
};

const getPassiveRingModel = ({
  dynamicFractals,
  elementsByFractalId,
  gameForm,
  selectedDynamicRingSegments
}) => {
  const fractal = getFractalById(dynamicFractals, gameForm?.primary_fractal);
  const elements = getFractalElements(elementsByFractalId, fractal?.id);

  return createRingModelFromFractal({
    cycleSeconds: Number(gameForm?.primary_time),
    distanceMeters: Number(gameForm?.primary_distance),
    elements,
    fractal,
    selectedDynamicRingSegments
  });
};

const getDynamicRingModels = ({
  dynamicFractals,
  elementsByFractalId,
  gameForm,
  selectedDynamicRingSegments,
  skillForms
}) => {
  const rootSkillId = getRootSkillId(skillForms);

  if (!rootSkillId) return [];

  const fractalBySkillId = new Map(dynamicFractals.map((fractal) => [
    getDisplayValue(fractal.skill),
    fractal
  ]));
  const orderedSkills = orderSkillForms(skillForms, rootSkillId);
  const cycleBySkillId = new Map();
  const distanceBySkillId = new Map();
  const passiveCycle = Number(gameForm.primary_time);
  const passiveDistance = Number(gameForm.primary_distance);

  return orderedSkills
    .map((skill) => {
      const skillId = getDisplayValue(skill.id);
      const fractal = fractalBySkillId.get(skillId);
      const elements = getFractalElements(elementsByFractalId, fractal?.id);

      if (!fractal || !elements.length) return null;

      if (!cycleBySkillId.has(skillId)) {
        const parentSkillId = getDisplayValue(skill.parent);
        const parentCycle = parentSkillId ? cycleBySkillId.get(parentSkillId) : passiveCycle;
        const parentDistance = parentSkillId ? distanceBySkillId.get(parentSkillId) : passiveDistance;
        const ratio = Number(skill.ratio);

        if (Number.isFinite(parentCycle) && Number.isFinite(ratio) && ratio > 0) {
          cycleBySkillId.set(skillId, parentCycle / ratio);
        }
        if (Number.isFinite(parentDistance) && Number.isFinite(ratio) && ratio > 0) {
          distanceBySkillId.set(skillId, parentDistance / ratio);
        }
      }

      return createRingModelFromFractal({
        cycleSeconds: cycleBySkillId.get(skillId),
        distanceMeters: distanceBySkillId.get(skillId),
        elements,
        fractal,
        selectedDynamicRingSegments,
        skill,
        skillLabel: getDisplayValue(skill.label) || "Active"
      });
    })
    .filter(Boolean)
    .slice(0, ACTIVE_RING_LIMIT);
};

const getPassiveModel = ({ dynamicFractals, gameForm }) => {
  const fractal = getFractalById(dynamicFractals, gameForm?.primary_fractal);
  const label = getDisplayValue(fractal?.label);

  if (!label && !getDisplayValue(gameForm?.primary_time) && !getDisplayValue(gameForm?.primary_distance)) return null;

  return {
    distanceMeters: Number(gameForm?.primary_distance),
    label: label || "Passive",
    cycleSeconds: Number(gameForm?.primary_time)
  };
};

const getUltimateModel = ({ dynamicFractals, gameForm, publicProfiles }) => {
  const fractal = getFractalById(dynamicFractals, gameForm?.ultimate_fractal);
  const label = getDisplayValue(fractal?.label);
  const linkedProfile = publicProfiles.find((profile) => (
    getDisplayValue(profile.id) === getDisplayValue(gameForm?.ultimate_link)
  ));

  if (!label && !linkedProfile) return null;

  return {
    label: label || "Ultimate",
    linkedProfile
  };
};

const getPublicProfileUrl = (profile) => {
  const username = getDisplayValue(profile?.username);

  return username ? `/src/html/jaycee-profile.html?username=${encodeURIComponent(username)}` : "";
};

const createGameSelect = (profiles, selectedUsername = "") => {
  const label = document.createElement("label");
  const text = document.createElement("span");
  const select = document.createElement("select");
  const defaultOption = document.createElement("option");

  label.className = "profile-fractal-select";
  text.textContent = "Choose a game";
  defaultOption.value = "";
  defaultOption.textContent = "jaycee";
  select.replaceChildren(defaultOption, ...profiles.map((profile) => {
    const option = document.createElement("option");
    const username = getDisplayValue(profile.username);

    option.value = username;
    option.textContent = username;

    return option;
  }));
  select.value = selectedUsername;
  select.addEventListener("change", () => {
    const username = getDisplayValue(select.value);

    if (!username) return;
    window.location.href = `/src/html/jaycee-profile.html?username=${encodeURIComponent(username)}`;
  });
  label.append(text, select);

  return label;
};

const getPublicProfileUsernameFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const queryUsername = getDisplayValue(params.get("username"));

  if (queryUsername) return queryUsername;
  if (!window.location.pathname.endsWith("/jaycee-profile.html")) return "";

  const match = window.location.pathname.match(/\/jaycee-([^/]+)\.html$/);

  return match && match[1] !== "profile" ? decodeURIComponent(match[1]) : "";
};

const createEmptyGameSettings = () => ({
  primary_distance: "",
  primary_fractal: "",
  primary_time: "",
  ultimate_fractal: "",
  ultimate_link: ""
});

const createGameForm = (settings) => ({
  primary_distance: getDisplayValue(settings?.primary_distance),
  primary_fractal: getDisplayValue(settings?.primary_fractal),
  primary_time: getDisplayValue(settings?.primary_time),
  ultimate_fractal: getDisplayValue(settings?.ultimate_fractal),
  ultimate_link: getDisplayValue(settings?.ultimate_link)
});

const getGamePayload = (form) => ({
  primary_distance: Number.isFinite(Number(form?.primary_distance)) && getDisplayValue(form?.primary_distance)
    ? Number(form.primary_distance)
    : null,
  primary_fractal: getDisplayValue(form?.primary_fractal) || null,
  primary_time: Number.isFinite(Number(form?.primary_time)) && getDisplayValue(form?.primary_time)
    ? Number(form.primary_time)
    : null,
  ultimate_fractal: getDisplayValue(form?.ultimate_fractal) || null,
  ultimate_link: getDisplayValue(form?.ultimate_link) || null
});

const createSkillForms = (skills) => (
  (skills || []).map((skill) => ({
    id: skill.id,
    label: getDisplayValue(skill.label),
    parent: getDisplayValue(skill.parent),
    ratio: getDisplayValue(skill.ratio)
  }))
);

const getSkillPayload = (form) => ({
  id: form.id,
  label: getDisplayValue(form.label),
  parent: getDisplayValue(form.parent) || null,
  ratio: Number.isFinite(Number(form.ratio)) && getDisplayValue(form.ratio)
    ? Number(form.ratio)
    : null
});

const getRootSkillId = (skillForms) => {
  const rootSkill = (skillForms || [])
    .filter((skill) => !getDisplayValue(skill.parent))
    .sort((first, second) => first.label.localeCompare(second.label))[0]
    || (skillForms || []).slice().sort((first, second) => first.label.localeCompare(second.label))[0];

  return getDisplayValue(rootSkill?.id);
};

const getDynamicFractalPayload = (fractal) => ({
  id: fractal.id,
  label: getDisplayValue(fractal.label),
  skill: getDisplayValue(fractal.skill) || null,
  time: Number.isFinite(Number(fractal.time)) && getDisplayValue(fractal.time)
    ? Number(fractal.time)
    : null
});

const orderSkillForms = (skillForms, primarySkillId) => {
  const remaining = new Map(skillForms.map((skill) => [skill.id, skill]));
  const ordered = [];
  const appendSkill = (skill) => {
    if (!skill || !remaining.has(skill.id)) return;

    remaining.delete(skill.id);
    ordered.push(skill);
    skillForms
      .filter((child) => child.parent === skill.id)
      .sort((first, second) => first.label.localeCompare(second.label))
      .forEach(appendSkill);
  };

  appendSkill(remaining.get(primarySkillId));
  [...remaining.values()]
    .filter((skill) => !skill.parent || !remaining.has(skill.parent))
    .sort((first, second) => first.label.localeCompare(second.label))
    .forEach(appendSkill);
  [...remaining.values()]
    .sort((first, second) => first.label.localeCompare(second.label))
    .forEach(appendSkill);

  return ordered;
};

const createPrimaryFractalPanel = ({
  dynamicFractals,
  gameForm,
  onFieldChange,
  onFractalFieldChange
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const primaryFractal = getFractalById(dynamicFractals, gameForm?.primary_fractal);
  const fields = [
    {
      disabled: !primaryFractal,
      key: "primary_fractal_label",
      label: "Fractal",
      type: "text",
      value: getDisplayValue(primaryFractal?.label)
    },
    { key: "primary_time", label: "Cycle (s)", type: "number", value: getDisplayValue(gameForm?.primary_time) },
    { key: "primary_distance", label: "Zone (m)", type: "number", value: getDisplayValue(gameForm?.primary_distance) }
  ];
  const fieldsRow = document.createElement("div");

  section.className = "profile-resonance-column profile-primary-fractal-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Passive";
  content.className = "profile-primary-fractal-content";
  fieldsRow.className = "profile-primary-fractal-fields";

  fields.forEach((field) => {
    const label = document.createElement("label");
    const labelText = document.createElement("span");
    const input = document.createElement("input");

    label.className = "profile-primary-fractal-field";
    labelText.textContent = field.label;
    input.type = field.type;
    input.value = field.value;
    input.disabled = Boolean(field.disabled);
    if (field.type === "number") {
      input.step = "any";
      input.inputMode = "decimal";
    }
    input.addEventListener("input", () => {
      if (field.disabled) return;
      if (field.key === "primary_fractal_label") {
        onFractalFieldChange(primaryFractal.id, "label", input.value);
      } else {
        onFieldChange(field.key, input.value);
      }
    });
    label.append(labelText, input);
    fieldsRow.append(label);
  });
  content.append(fieldsRow);
  section.append(heading, content);

  return section;
};

const createUltimatePanel = ({
  dynamicFractals,
  gameForm,
  onFractalFieldChange,
  onFieldChange,
  publicProfiles
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const fractalLabel = document.createElement("label");
  const fractalInput = document.createElement("input");
  const ultimateFractal = getFractalById(dynamicFractals, gameForm?.ultimate_fractal);
  const linkLabel = document.createElement("label");
  const linkSelect = document.createElement("select");
  const emptyLinkOption = document.createElement("option");
  const fieldsRow = document.createElement("div");

  section.className = "profile-resonance-column profile-primary-fractal-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Ultimate";
  content.className = "profile-primary-fractal-content";
  fieldsRow.className = "profile-primary-fractal-fields";

  fractalLabel.className = "profile-primary-fractal-field";
  fractalInput.type = "text";
  fractalInput.value = getDisplayValue(ultimateFractal?.label);
  fractalInput.disabled = !ultimateFractal;
  fractalInput.addEventListener("input", () => {
    if (!ultimateFractal) return;
    onFractalFieldChange(ultimateFractal.id, "label", fractalInput.value);
  });
  fractalLabel.append(document.createElement("span"), fractalInput);
  fractalLabel.firstElementChild.textContent = "Fractal";

  linkLabel.className = "profile-primary-fractal-field";
  emptyLinkOption.value = "";
  emptyLinkOption.textContent = "Choose a linked profile";
  linkSelect.className = "profile-primary-fractal-select";
  linkSelect.replaceChildren(emptyLinkOption, ...publicProfiles.map((profile) => {
    const option = document.createElement("option");
    const username = getDisplayValue(profile.username);

    option.value = getDisplayValue(profile.id);
    option.textContent = username || "Untitled profile";

    return option;
  }));
  linkSelect.value = getDisplayValue(gameForm?.ultimate_link);
  linkSelect.addEventListener("change", () => onFieldChange("ultimate_link", linkSelect.value));
  linkLabel.append(document.createElement("span"), linkSelect);
  linkLabel.firstElementChild.textContent = "Linked profile";

  fieldsRow.append(fractalLabel, linkLabel);
  content.append(fieldsRow);
  section.append(heading, content);

  return section;
};

const createSecondaryFractalPanel = ({
  dynamicFractals,
  onFractalFieldChange,
  skillForms
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const rootSkillId = getRootSkillId(skillForms);
  const fractalsBySkillId = new Map(dynamicFractals.map((fractal) => [
    getDisplayValue(fractal.skill),
    fractal
  ]));
  const orderedSkillForms = orderSkillForms(skillForms, rootSkillId);
  const orderedFractals = orderedSkillForms
    .map((skill) => fractalsBySkillId.get(getDisplayValue(skill.id)))
    .filter(Boolean);

  section.className = "profile-resonance-column profile-secondary-fractal-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Edit Fractals";
  content.className = "profile-skills-content";

  if (!orderedFractals.length) {
    const empty = document.createElement("p");

    empty.className = "profile-primary-fractal-status";
    empty.textContent = "No fractals yet.";
    content.append(empty);
  } else {
    const header = document.createElement("div");

    header.className = "profile-secondary-fractal-header";
    ["Fractal", "Cycle (s)"].forEach((text) => {
      const item = document.createElement("span");

      item.textContent = text;
      header.append(item);
    });
    content.append(header);
  }

  orderedFractals.forEach((fractal) => {
    const item = document.createElement("article");
    const labelInput = document.createElement("input");
    const cycleInput = document.createElement("input");

    item.className = "profile-secondary-fractal-row";
    labelInput.type = "text";
    labelInput.value = getDisplayValue(fractal.label);
    labelInput.setAttribute("aria-label", "Fractal name");
    labelInput.addEventListener("input", () => onFractalFieldChange(fractal.id, "label", labelInput.value));

    cycleInput.type = "number";
    cycleInput.step = "any";
    cycleInput.inputMode = "decimal";
    cycleInput.value = getDisplayValue(fractal.time);
    cycleInput.setAttribute("aria-label", "Fractal cycle");
    cycleInput.addEventListener("input", () => onFractalFieldChange(fractal.id, "time", cycleInput.value));

    item.append(labelInput, cycleInput);
    content.append(item);
  });
  section.append(heading, content);

  return section;
};

const createSkillsPanel = ({
  onFieldChange,
  skillForms
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const rootSkillId = getRootSkillId(skillForms);
  const orderedSkillForms = orderSkillForms(skillForms, rootSkillId);

  section.className = "profile-resonance-column profile-skills-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Actives";
  content.className = "profile-skills-content";

  if (!orderedSkillForms.length) {
    const empty = document.createElement("p");

    empty.className = "profile-primary-fractal-status";
    empty.textContent = "No actives yet.";
    content.append(empty);
  } else {
    const header = document.createElement("div");
    const number = document.createElement("span");
    const label = document.createElement("span");
    const parent = document.createElement("span");
    const ratio = document.createElement("span");

    header.className = "profile-skill-header";
    number.textContent = "#";
    label.textContent = "Active";
    parent.textContent = "Parent";
    ratio.textContent = "Ratio";
    header.append(number, label, parent, ratio);
    content.append(header);
  }

  orderedSkillForms.forEach((skill, index) => {
    const item = document.createElement("article");
    const badge = document.createElement("span");
    const isRootSkill = getDisplayValue(skill.id) === getDisplayValue(rootSkillId);

    badge.className = "profile-skill-badge";
    badge.textContent = String(index + 1);

    const labelInput = document.createElement("input");
    const parentSelect = document.createElement("select");
    const emptyParent = document.createElement("option");
    const ratioInput = document.createElement("input");

    item.className = "profile-skill-row";
    item.append(badge);
    labelInput.type = "text";
    labelInput.value = skill.label;
    labelInput.setAttribute("aria-label", "Active label");
    labelInput.addEventListener("input", () => onFieldChange(skill.id, "label", labelInput.value));

    emptyParent.value = "";
    emptyParent.textContent = isRootSkill ? "Root" : "No parent";
    parentSelect.setAttribute("aria-label", "Active parent");
    parentSelect.replaceChildren(emptyParent, ...skillForms
      .filter((optionSkill) => optionSkill.id !== skill.id)
      .map((optionSkill) => {
        const option = document.createElement("option");

        option.value = optionSkill.id;
        option.textContent = optionSkill.label || "Untitled active";

        return option;
      }));
    parentSelect.value = skill.parent;
    parentSelect.disabled = isRootSkill;
    parentSelect.addEventListener("change", () => onFieldChange(skill.id, "parent", parentSelect.value));

    ratioInput.type = "number";
    ratioInput.step = "any";
    ratioInput.inputMode = "decimal";
    ratioInput.value = skill.ratio;
    ratioInput.setAttribute("aria-label", "Active ratio");
    ratioInput.addEventListener("input", () => onFieldChange(skill.id, "ratio", ratioInput.value));

    item.append(labelInput, parentSelect, ratioInput);
    content.append(item);
  });
  section.append(heading, content);

  return section;
};

const createDashboardSavePanel = ({ onSave, saveDisabled, saveStatus }) => {
  const section = document.createElement("section");
  const button = document.createElement("button");
  const statusText = document.createElement("p");

  section.className = "profile-dashboard-save-panel";
  button.className = "profile-primary-fractal-save";
  button.type = "button";
  button.textContent = "Save";
  button.disabled = saveDisabled;
  button.addEventListener("click", onSave);
  section.append(button);
  if (saveStatus) {
    statusText.className = "profile-primary-fractal-status";
    statusText.textContent = saveStatus;
    section.append(statusText);
  }

  return section;
};

const createDynamicRingParameterPanel = ({ passiveModel, ringModels, ultimateModel }) => {
  if (!passiveModel && !ringModels.length && !ultimateModel) return null;

  const section = document.createElement("section");
  const heading = document.createElement("h2");

  section.className = "profile-parameter-panel";
  section.dataset.profileParameters = "";
  heading.textContent = "Parameters";
  section.append(heading);
  if (passiveModel) {
    const group = document.createElement("article");
    const title = document.createElement("h3");
    const list = document.createElement("dl");
    const rows = [{
      label: "Cycle",
      value: formatDuration(passiveModel.cycleSeconds, { compact: false }) || "00:00:00"
    }, {
      label: "Zone",
      value: formatDistance(passiveModel.distanceMeters) || "0m"
    }, {
      label: "Segment",
      value: getElementLabel(passiveModel.selectedElement, passiveModel.selectedSegment)
    }];

    group.className = "profile-parameter-section";
    title.textContent = passiveModel.label;
    list.className = "profile-parameter-list";
    rows.forEach((row) => {
      const label = document.createElement("dt");
      const value = document.createElement("dd");

      label.textContent = row.label;
      value.textContent = row.value;
      list.append(label, value);
    });
    group.append(title, list);
    section.append(group);
  }
  ringModels.forEach((ringModel) => {
    const group = document.createElement("article");
    const title = document.createElement("h3");
    const list = document.createElement("dl");
    const rows = [{
      label: "Cycle",
      value: formatDuration(ringModel.fractal.time, { compact: false }) || "00:00:00"
    }, {
      label: "Quest",
      value: formatDuration(ringModel.practiceSeconds, { compact: false }) || "00:00:00"
    }, {
      label: "Zone",
      value: formatDistance(ringModel.distanceMeters) || "0m"
    }, {
      label: "Segment",
      value: getElementLabel(ringModel.selectedElement, ringModel.selectedSegment)
    }, {
      label: "Active",
      value: ringModel.skillLabel
    }];

    group.className = "profile-parameter-section";
    title.textContent = ringModel.label;
    list.className = "profile-parameter-list";
    rows.forEach((row) => {
      const label = document.createElement("dt");
      const value = document.createElement("dd");

      label.textContent = row.label;
      value.textContent = row.value;
      list.append(label, value);
    });
    group.append(title, list);
    section.append(group);
  });

  if (ultimateModel) {
    const group = document.createElement("article");
    const title = document.createElement("h3");
    const list = document.createElement("dl");
    const profileUrl = getPublicProfileUrl(ultimateModel.linkedProfile);
    const rows = [{
      href: profileUrl,
      label: "Link",
      value: getDisplayValue(ultimateModel.linkedProfile?.username) || "No linked profile"
    }];

    group.className = "profile-parameter-section";
    title.textContent = ultimateModel.label;
    list.className = "profile-parameter-list";
    rows.forEach((row) => {
      const label = document.createElement("dt");
      const value = document.createElement("dd");

      label.textContent = row.label;
      if (row.href) {
        const link = document.createElement("a");

        link.href = row.href;
        link.textContent = row.value;
        value.append(link);
      } else {
        value.textContent = row.value;
      }
      list.append(label, value);
    });
    group.append(title, list);
    section.append(group);
  }

  return section;
};

const createProfileCoreState = ({
  avatarImage,
  hasUserProfile,
  ringModels,
  selectedSpaceNumber
}) => {
  const rings = [];

  ringModels.forEach((ringModel) => {
    const activeSegmentIndex = getActiveSegmentIndex(ringModel.segmentKeys, ringModel.selectedSegment);

    rings.push({
      id: ringModel.id,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      activeSegmentIndex,
      count: ringModel.segmentKeys.length,
      fillAlpha: 0,
      label: ringModel.label,
      labels: getEmptyLabels(ringModel.segmentKeys.length),
      rotation: getTopCenteredLastSegmentRotation(ringModel.segmentKeys.length),
      segmentKeys: ringModel.segmentKeys,
      showBorders: true,
      showDividers: true,
      styledSegmentIndices: [activeSegmentIndex],
      tone: "accent"
    });
  });

  return {
    ...createJayceeState({
      coreSquareLabels: getEmptyLabels(JAYCEE_ORDER.length),
      rings
    }),
    activeSquareNumber: selectedSpaceNumber,
    metrics: PROFILE_CORE_METRICS,
    squareBorderAlpha: 0.46,
    squareFillAlpha: hasUserProfile ? undefined : PROFILE_RING_FILL_ALPHA,
    squareCellBorderAlpha: 0.34,
    squareBackgroundImage: avatarImage
  };
};

export const initJayceePage = async () => {
  const shell = document.querySelector("[data-profile-shell]");
  const canvas = document.querySelector("[data-profile-canvas]");
  const status = document.querySelector("[data-profile-status]");
  const list = document.querySelector("[data-profile-resonances]");
  const publicUsername = getDisplayValue(shell?.dataset.profileUsername) || getPublicProfileUsernameFromUrl();
  const pageMode = getDisplayValue(shell?.dataset.profileMode) || (publicUsername ? "public" : "profile");
  const isPresentPage = pageMode === "present";
  const isEditableProfilePage = pageMode === "profile" && !publicUsername;
  const hasUserProfile = Boolean(publicUsername) || isEditableProfilePage;

  if (!shell || !canvas || !status || !list) return;

  let dynamicFractalElements = [];
  let dynamicFractals = [];
  let publicProfiles = [];
  let avatarImage = null;
  let coreState = null;
  let currentProfile = null;
  let dashboardSaveStatus = "";
  let dashboardSaveStatusTimer = null;
  let gameForm = createEmptyGameSettings();
  let gameSettings = null;
  let isDashboardSaving = false;
  let supabaseClient = null;
  let skillForms = [];
  let skills = [];
  let selectedSpaceNumber = DEFAULT_SELECTED_NUMBER;
  let profileViewCacheKey = "";
  const selectedDynamicRingSegments = new Map();

  const getElementsByFractalId = () => (
    dynamicFractalElements.reduce((elementsById, element) => {
      const fractalId = getDisplayValue(element.fractal_id) || getDisplayValue(element.fractal);

    if (!fractalId) return elementsById;
      if (!elementsById.has(fractalId)) {
        elementsById.set(fractalId, []);
      }
      elementsById.get(fractalId).push(element);

      return elementsById;
    }, new Map())
  );

  const restoreProfileViewCache = (cacheKey) => {
    const cache = loadProfileViewCache(cacheKey);

    if (!cache) return;

    if (Number.isFinite(Number(cache.selectedSpaceNumber))) {
      selectedSpaceNumber = Number(cache.selectedSpaceNumber);
    }
  };

  const saveProfileViewState = () => {
    saveProfileViewCache(profileViewCacheKey, {
      selectedSpaceNumber
    });
  };

  const setDynamicRingSegmentSelection = (ringId, segmentKey) => {
    const [, fractalId] = getDisplayValue(ringId).split(":");

    if (!fractalId) return;
    selectedDynamicRingSegments.set(fractalId, getDisplayValue(segmentKey));
  };

  const updateDynamicFractalField = (fractalId, field, value) => {
    dynamicFractals = dynamicFractals.map((fractal) => (
      String(fractal.id) === String(fractalId)
        ? { ...fractal, [field]: getDisplayValue(value) }
        : fractal
    ));

    dashboardSaveStatus = "Unsaved changes";
    syncProfileView();
  };

  const saveDashboardSettings = async () => {
    if (!supabaseClient || !currentProfile || isDashboardSaving) return;

    if (dashboardSaveStatusTimer) {
      window.clearTimeout(dashboardSaveStatusTimer);
      dashboardSaveStatusTimer = null;
    }
    isDashboardSaving = true;
    dashboardSaveStatus = "Saving...";
    renderResonances();

    try {
      const updatedSettings = await upsertUserGameSettings(
        supabaseClient,
        currentProfile,
        getGamePayload(gameForm)
      );
      const rootSkillId = getRootSkillId(skillForms);
      const skillPayloads = skillForms.map((skill) => {
        const payload = getSkillPayload(skill);

        return getDisplayValue(payload.id) === rootSkillId
          ? { ...payload, parent: null }
          : payload;
      });
      const fractalPayloads = dynamicFractals.map(getDynamicFractalPayload);

      gameSettings = updatedSettings || { ...gameSettings, ...getGamePayload(gameForm), user_id: currentProfile.id };
      gameForm = createGameForm(gameSettings);
      if (fractalPayloads.length) {
        const updatedFractals = await updateUserDynamicFractals(supabaseClient, fractalPayloads);

        dynamicFractals = dynamicFractals.map((fractal) => (
          updatedFractals.find((updatedFractal) => updatedFractal.id === fractal.id) || fractal
        ));
      }
      if (skillPayloads.length) {
        const updatedSkills = await updateSkills(supabaseClient, skillPayloads);

        skills = skills.map((skill) => updatedSkills.find((updatedSkill) => updatedSkill.id === skill.id) || skill);
        skillForms = createSkillForms(skills);
      }
      dashboardSaveStatus = "Saved";
      isDashboardSaving = false;
      renderResonances();
      dashboardSaveStatusTimer = window.setTimeout(() => {
        dashboardSaveStatus = "";
        dashboardSaveStatusTimer = null;
        renderResonances();
      }, 1600);
    } catch (error) {
      console.error("Dashboard settings could not be updated", error);
      dashboardSaveStatus = "Could not save";
      isDashboardSaving = false;
      renderResonances();
      status.textContent = error?.message || "Dashboard settings could not be updated.";
    }
  };

  const updatePrimaryFractalField = (field, value) => {
    gameForm = {
      ...gameForm,
      [field]: getDisplayValue(value)
    };
    dashboardSaveStatus = "Unsaved changes";
    renderCoreParameters();
  };

  const updateSkillField = (skillId, field, value) => {
    skillForms = skillForms.map((skill) => (
      skill.id === skillId
        ? { ...skill, [field]: getDisplayValue(value) }
        : skill
    ));
    dashboardSaveStatus = "Unsaved changes";
  };

  const renderPresentControls = () => {
    const corePanel = canvas.closest(".jaycee-profile-core");
    const existingControls = corePanel?.querySelector("[data-profile-present-controls]");

    if (!corePanel || !isPresentPage) {
      existingControls?.remove();
      corePanel?.classList.remove("has-fractal-controls");
      return;
    }

    const controls = existingControls || document.createElement("div");

    corePanel.classList.add("has-fractal-controls");
    controls.className = "profile-fractal-selectors";
    controls.dataset.profilePresentControls = "";
    controls.replaceChildren(createGameSelect(publicProfiles));

    if (!existingControls) {
      corePanel.insertBefore(controls, canvas);
    }
  };

  const renderResonances = () => {
    status.textContent = "";
    list.replaceChildren(
      ...(isEditableProfilePage ? [
        createPrimaryFractalPanel({
          dynamicFractals,
          gameForm,
          onFieldChange: updatePrimaryFractalField,
          onFractalFieldChange: updateDynamicFractalField
        }),
        createSkillsPanel({
          onFieldChange: updateSkillField,
          skillForms
        }),
        createUltimatePanel({
          dynamicFractals,
          gameForm,
          onFractalFieldChange: updateDynamicFractalField,
          onFieldChange: updatePrimaryFractalField,
          publicProfiles
        }),
        createSecondaryFractalPanel({
          dynamicFractals,
          onFractalFieldChange: updateDynamicFractalField,
          skillForms
        }),
        createDashboardSavePanel({
          onSave: saveDashboardSettings,
          saveDisabled: !currentProfile || isDashboardSaving,
          saveStatus: dashboardSaveStatus
        })
      ] : [])
    );
  };

  const renderCoreParameters = () => {
    const corePanel = canvas.closest(".jaycee-profile-core");
    const existingPanel = corePanel?.querySelector("[data-profile-parameters]");
    const ringModels = getDynamicRingModels({
      dynamicFractals,
      elementsByFractalId: getElementsByFractalId(),
      gameForm,
      selectedDynamicRingSegments,
      skillForms
    });
    const passiveModel = getPassiveRingModel({
      dynamicFractals,
      elementsByFractalId: getElementsByFractalId(),
      gameForm,
      selectedDynamicRingSegments
    }) || getPassiveModel({ dynamicFractals, gameForm });
    const ultimateModel = getUltimateModel({ dynamicFractals, gameForm, publicProfiles });
    const panel = createDynamicRingParameterPanel({ passiveModel, ringModels, ultimateModel });

    if (!corePanel || !panel) {
      existingPanel?.remove();
      return;
    }

    if (existingPanel) {
      existingPanel.replaceWith(panel);
    } else {
      canvas.insertAdjacentElement("afterend", panel);
    }
  };

  const renderCore = () => {
    const passiveRingModel = getPassiveRingModel({
      dynamicFractals,
      elementsByFractalId: getElementsByFractalId(),
      gameForm,
      selectedDynamicRingSegments
    });
    const activeRingModels = getDynamicRingModels({
      dynamicFractals,
      elementsByFractalId: getElementsByFractalId(),
      gameForm,
      selectedDynamicRingSegments,
      skillForms
    });
    const ringModels = [
      ...(passiveRingModel ? [passiveRingModel] : []),
      ...activeRingModels
    ];

    coreState = createProfileCoreState({
      avatarImage,
      hasUserProfile,
      ringModels,
      selectedSpaceNumber
    });
    drawJaycee(canvas, coreState);
  };

  const scheduleRenderCore = () => {
    window.requestAnimationFrame(renderCore);
  };

  const syncProfileView = () => {
    saveProfileViewState();
    renderCore();
    renderCoreParameters();
    renderResonances();
  };

  const handleCanvasClick = (event) => {
    const hit = getJayceeHit(canvas, coreState, event.clientX, event.clientY);

    if (!hit) return;

    if (hit.type === "square") {
      selectedSpaceNumber = hit.number;
    } else if (hit.type === "ring" && hit.ringId) {
      if (getDisplayValue(hit.ringId).startsWith("dynamic-fractal:")) {
        setDynamicRingSegmentSelection(hit.ringId, hit.segmentKey);
      }
    }

    syncProfileView();
  };

  try {
    const client = await window.JayceeAuth.getSupabaseClient();
    supabaseClient = client;
    const sessionResult = await window.JayceeAuth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (isEditableProfilePage && !user) {
      redirectToLogin();
      return;
    }

    const profile = !hasUserProfile
      ? null
      : publicUsername
        ? await fetchProfileByUsername(client, publicUsername)
        : await fetchProfileByUserId(client, user.id);
    currentProfile = profile;

    if (hasUserProfile && !profile) {
      shell.hidden = false;
      status.textContent = "Profile not found.";
      return;
    }

    shell.hidden = false;
    if (isEditableProfilePage) {
      applyProfileTheme(profile);
    }

    dynamicFractals = hasUserProfile ? await fetchUserDynamicFractals(client, profile) : [];
    dynamicFractalElements = hasUserProfile
      ? await fetchDynamicFractalElements(client, dynamicFractals.map((fractal) => fractal.id))
      : [];
    skills = hasUserProfile
      ? await fetchSkillsByIds(client, dynamicFractals.map((fractal) => fractal.skill))
      : [];
    skillForms = createSkillForms(skills);
    gameSettings = hasUserProfile ? await fetchUserGameSettings(client, profile) : null;
    gameForm = createGameForm(gameSettings);

    profileViewCacheKey = getProfileViewCacheKey({ pageMode, profile, publicUsername });
    restoreProfileViewCache(profileViewCacheKey);
    publicProfiles = (isPresentPage || hasUserProfile) ? await fetchPublicProfiles(client) : [];
    avatarImage = !hasUserProfile ? null : await loadOptionalImage(await getAvatarImageUrl(client, profile));
    renderCore();
    canvas.addEventListener("click", handleCanvasClick);
    const resizeObserver = new ResizeObserver(scheduleRenderCore);

    resizeObserver.observe(canvas);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener("resize", scheduleRenderCore);
    window.addEventListener("load", scheduleRenderCore);
    renderPresentControls();
    renderCoreParameters();
    renderResonances();
    scheduleRenderCore();
  } catch (error) {
    console.error("Jaycee profile load failed", error);
    shell.hidden = false;
    status.textContent = error?.message || "Profile could not be loaded.";
  }
};

export const startJayceePage = () => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initJayceePage, { once: true });
  } else {
    initJayceePage();
  }
};
