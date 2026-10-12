import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee
} from "./jaycee-core.js";
import {
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
const PROFILE_RING_FILL_ALPHA = 0.26;
const ACTIVE_RING_LIMIT = 3;
const FRACTAL_SQUARE_GRID_SIZE = 3;
const FRACTAL_GRID_DISPLAY_LIMIT = 5;
const TRAILING_GLYPH_PATTERN = /((?:\p{Extended_Pictographic}|\p{S})(?:\uFE0F|\uFE0E)?(?:\u200D(?:\p{Extended_Pictographic}|\p{S})(?:\uFE0F|\uFE0E)?)*)\s*$/u;

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

const getTrailingGlyph = (value) => {
  const label = getDisplayValue(value).trim();
  const match = label.match(TRAILING_GLYPH_PATTERN);

  return match?.[1] || "";
};

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

const createFractalMeasureModel = ({
  cycleSeconds,
  distanceMeters,
  elements,
  fractal,
  skill = null,
  skillLabel = ""
}) => {
  if (!fractal || !elements.length) return null;

  return {
    cycleSeconds,
    distanceMeters,
    elements,
    fractal,
    label: getDisplayValue(fractal.label) || "Fractal",
    skill,
    skillLabel,
    questSeconds: cycleSeconds
  };
};

const getPassiveFractalModel = ({
  dynamicFractals,
  elementsByFractalId,
  gameForm
}) => {
  const fractal = getFractalById(dynamicFractals, gameForm?.primary_fractal);
  const elements = getFractalElements(elementsByFractalId, fractal?.id);

  return createFractalMeasureModel({
    cycleSeconds: Number(gameForm?.primary_time),
    distanceMeters: Number(gameForm?.primary_distance),
    elements,
    fractal
  });
};

const getActiveFractals = (dynamicFractals, gameForm) => {
  const excludedIds = new Set([
    getDisplayValue(gameForm?.primary_fractal),
    getDisplayValue(gameForm?.ultimate_fractal)
  ].filter(Boolean));

  return dynamicFractals
    .filter((fractal) => (
      getDisplayValue(fractal.id)
      && getDisplayValue(fractal.skill)
      && !excludedIds.has(getDisplayValue(fractal.id))
    ))
    .slice()
    .sort((first, second) => {
      const firstTime = Number(first.time);
      const secondTime = Number(second.time);
      const firstHasTime = Number.isFinite(firstTime);
      const secondHasTime = Number.isFinite(secondTime);

      if (firstHasTime && secondHasTime && firstTime !== secondTime) return secondTime - firstTime;
      if (firstHasTime !== secondHasTime) return firstHasTime ? -1 : 1;

      return (getDisplayValue(first.label) || getDisplayValue(first.id))
        .localeCompare(getDisplayValue(second.label) || getDisplayValue(second.id));
    });
};

const getFractalsForCoreGrid = ({ dynamicFractals, gameForm }) => ([
  getFractalById(dynamicFractals, gameForm?.primary_fractal),
  ...getActiveFractals(dynamicFractals, gameForm).slice(0, ACTIVE_RING_LIMIT),
  getFractalById(dynamicFractals, gameForm?.ultimate_fractal)
].filter(Boolean).slice(0, FRACTAL_GRID_DISPLAY_LIMIT));

const getActiveFractalModels = ({
  dynamicFractals,
  elementsByFractalId,
  gameForm,
  skillForms
}) => {
  let previousQuestSeconds = Number(gameForm.primary_time);
  let previousDistanceMeters = Number(gameForm.primary_distance);

  return getActiveFractals(dynamicFractals, gameForm)
    .slice(0, ACTIVE_RING_LIMIT)
    .map((fractal) => {
      const skill = getSkillById(skillForms, fractal.skill);
      const skillRatio = Number(skill?.ratio);
      const questSeconds = Number.isFinite(previousQuestSeconds) && Number.isFinite(skillRatio) && skillRatio > 0
        ? previousQuestSeconds / skillRatio
        : null;
      const distanceMeters = Number.isFinite(previousDistanceMeters) && Number.isFinite(skillRatio) && skillRatio > 0
        ? previousDistanceMeters / skillRatio
        : null;
      const elements = getFractalElements(elementsByFractalId, fractal?.id);

      if (!fractal || !elements.length) return null;

      previousQuestSeconds = questSeconds;
      previousDistanceMeters = distanceMeters;

      return createFractalMeasureModel({
        cycleSeconds: questSeconds,
        distanceMeters,
        elements,
        fractal,
        skill,
        skillLabel: getDisplayValue(skill.label) || "Active"
      });
    })
    .filter(Boolean);
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

const getSkillById = (skillForms, skillId) => (
  (skillForms || []).find((skill) => getDisplayValue(skill.id) === getDisplayValue(skillId)) || null
);

const getUltimateModel = ({ dynamicFractals, gameForm, publicProfiles, skillForms }) => {
  const fractal = getFractalById(dynamicFractals, gameForm?.ultimate_fractal);
  const label = getDisplayValue(fractal?.label);
  const skill = getSkillById(skillForms, fractal?.skill);
  const linkedProfile = publicProfiles.find((profile) => (
    getDisplayValue(profile.id) === getDisplayValue(gameForm?.ultimate_link)
  ));

  if (!label && !skill && !linkedProfile) return null;

  return {
    label: label || "Ultimate",
    linkedProfile,
    skillLabel: getDisplayValue(skill?.label)
  };
};

const getPublicProfileUrl = (profile) => {
  const username = getDisplayValue(profile?.username);

  return username ? `/src/html/jaycee-profile.html?username=${encodeURIComponent(username)}` : "";
};

const getJayceeOrderedElementGlyphs = (elements) => (
  JAYCEE_ORDER.map((number) => getTrailingGlyph(getElementLabel(elements[number - 1])))
);

const getFractalGridSquareModel = ({ dynamicFractals, elementsByFractalId, gameForm }) => {
  const fractals = getFractalsForCoreGrid({ dynamicFractals, gameForm });
  const subCellLabelsByPosition = {};

  fractals.forEach((fractal, index) => {
    const position = JAYCEE_ORDER[index];
    const elements = getFractalElements(elementsByFractalId, fractal.id);
    const labels = getJayceeOrderedElementGlyphs(elements);

    if (position && labels.some(Boolean)) {
      subCellLabelsByPosition[position] = labels;
    }
  });

  if (!Object.keys(subCellLabelsByPosition).length) return null;

  return {
    coreStyle: true,
    fillAlpha: 0.08,
    gridSize: FRACTAL_SQUARE_GRID_SIZE,
    labels: getEmptyLabels(FRACTAL_SQUARE_GRID_SIZE * FRACTAL_SQUARE_GRID_SIZE),
    subCellLabelsByPosition
  };
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
    ratio: getDisplayValue(skill.ratio)
  }))
);

const createLabeledGameInput = ({ ariaLabel, input, label }) => {
  const wrapper = document.createElement("label");
  const text = document.createElement("span");

  wrapper.className = "profile-skill-card-field";
  text.textContent = label;
  input.setAttribute("aria-label", ariaLabel || label);
  wrapper.append(text, input);

  return wrapper;
};

const getSkillPayload = (form) => ({
  id: form.id,
  label: getDisplayValue(form.label),
  ratio: Number.isFinite(Number(form.ratio)) && getDisplayValue(form.ratio)
    ? Number(form.ratio)
    : null
});

const getDynamicFractalPayload = (fractal) => ({
  id: fractal.id,
  label: getDisplayValue(fractal.label),
  skill: getDisplayValue(fractal.skill) || null,
  time: Number.isFinite(Number(fractal.time)) && getDisplayValue(fractal.time)
    ? Number(fractal.time)
    : null
});

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
  onSkillFieldChange,
  publicProfiles,
  skillForms
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const fractalLabel = document.createElement("label");
  const fractalInput = document.createElement("input");
  const ultimateFractal = getFractalById(dynamicFractals, gameForm?.ultimate_fractal);
  const ultimateSkill = getSkillById(skillForms, ultimateFractal?.skill);
  const skillLabel = document.createElement("label");
  const skillInput = document.createElement("input");
  const linkLabel = document.createElement("label");
  const linkSelect = document.createElement("select");
  const emptyLinkOption = document.createElement("option");
  const fieldsRow = document.createElement("div");

  section.className = "profile-resonance-column profile-primary-fractal-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Ultimate Ability";
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

  skillLabel.className = "profile-primary-fractal-field";
  skillInput.type = "text";
  skillInput.value = getDisplayValue(ultimateSkill?.label);
  skillInput.disabled = !ultimateSkill;
  skillInput.addEventListener("input", () => {
    if (!ultimateSkill) return;
    onSkillFieldChange(ultimateSkill.id, "label", skillInput.value);
  });
  skillLabel.append(document.createElement("span"), skillInput);
  skillLabel.firstElementChild.textContent = "Skill";

  linkLabel.className = "profile-primary-fractal-field";
  emptyLinkOption.value = "";
  emptyLinkOption.textContent = "Choose a teammate";
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
  linkLabel.firstElementChild.textContent = "Teammate";

  fieldsRow.append(fractalLabel, linkLabel, skillLabel);
  content.append(fieldsRow);
  section.append(heading, content);

  return section;
};

const createSkillsPanel = ({
  dynamicFractals,
  gameForm,
  onFractalFieldChange,
  onFieldChange,
  skillForms
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const activeFractals = getActiveFractals(dynamicFractals, gameForm)
    .slice(0, ACTIVE_RING_LIMIT);

  section.className = "profile-resonance-column profile-skills-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Basic Abilities";
  content.className = "profile-skills-content";

  if (!activeFractals.length) {
    const empty = document.createElement("p");

    empty.className = "profile-primary-fractal-status";
    empty.textContent = "No actives yet.";
    content.append(empty);
  }

  activeFractals.forEach((fractal, index) => {
    const skill = getSkillById(skillForms, fractal.skill);
    const item = document.createElement("article");
    const badge = document.createElement("span");
    const body = document.createElement("div");
    const passiveLine = document.createElement("div");
    const activeLine = document.createElement("div");
    const passiveTitle = document.createElement("span");
    const activeTitle = document.createElement("span");
    const fractalInput = document.createElement("input");
    const cycleInput = document.createElement("input");
    const skillInput = document.createElement("input");
    const ratioInput = document.createElement("input");

    badge.className = "profile-skill-badge";
    badge.textContent = String(index + 1);

    item.className = "profile-skill-row";
    body.className = "profile-skill-card-body";
    passiveLine.className = "profile-skill-card-line";
    activeLine.className = "profile-skill-card-line";
    passiveTitle.className = "profile-skill-card-line-title";
    activeTitle.className = "profile-skill-card-line-title";
    passiveTitle.textContent = "Passive";
    activeTitle.textContent = "Active";

    fractalInput.type = "text";
    fractalInput.value = getDisplayValue(fractal.label);
    fractalInput.addEventListener("input", () => onFractalFieldChange(fractal.id, "label", fractalInput.value));

    cycleInput.type = "number";
    cycleInput.step = "any";
    cycleInput.inputMode = "decimal";
    cycleInput.value = getDisplayValue(fractal.time);
    cycleInput.addEventListener("input", () => onFractalFieldChange(fractal.id, "time", cycleInput.value));

    skillInput.type = "text";
    skillInput.value = getDisplayValue(skill?.label);
    skillInput.disabled = !skill;
    skillInput.addEventListener("input", () => {
      if (!skill) return;
      onFieldChange(skill.id, "label", skillInput.value);
    });

    ratioInput.type = "number";
    ratioInput.step = "any";
    ratioInput.inputMode = "decimal";
    ratioInput.value = getDisplayValue(skill?.ratio);
    ratioInput.disabled = !skill;
    ratioInput.addEventListener("input", () => {
      if (!skill) return;
      onFieldChange(skill.id, "ratio", ratioInput.value);
    });

    passiveLine.append(
      passiveTitle,
      createLabeledGameInput({ ariaLabel: "Fractal name", input: fractalInput, label: "Name" }),
      createLabeledGameInput({ ariaLabel: "Fractal cycle", input: cycleInput, label: "Cycle (s)" })
    );
    activeLine.append(
      activeTitle,
      createLabeledGameInput({ ariaLabel: "Active skill", input: skillInput, label: "Name" }),
      createLabeledGameInput({ ariaLabel: "Active ratio", input: ratioInput, label: "Ratio" })
    );
    body.append(passiveLine, activeLine);
    item.append(badge, body);
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
  section.dataset.profileDashboardSave = "";
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

const createFractalParameterPanel = ({ activeModels, passiveModel, ultimateModel }) => {
  if (!passiveModel && !activeModels.length && !ultimateModel) return null;

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
      label: "Passive",
      value: formatDuration(passiveModel.cycleSeconds, { compact: false }) || "00:00:00"
    }, {
      label: "Zone",
      value: formatDistance(passiveModel.distanceMeters) || "0m"
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
  activeModels.forEach((fractalModel) => {
    const group = document.createElement("article");
    const title = document.createElement("h3");
    const list = document.createElement("dl");
    const rows = [{
      label: "Passive",
      value: formatDuration(fractalModel.fractal.time, { compact: false }) || "00:00:00"
    }, {
      label: "Active",
      value: formatDuration(fractalModel.questSeconds, { compact: false }) || "00:00:00"
    }, {
      label: "Zone",
      value: formatDistance(fractalModel.distanceMeters) || "0m"
    }, {
      label: "Skill",
      value: fractalModel.skillLabel
    }];

    group.className = "profile-parameter-section";
    title.textContent = fractalModel.label;
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
      isProfileLink: true,
      label: "Teammate",
      value: getDisplayValue(ultimateModel.linkedProfile?.username) || "No teammate"
    }, {
      label: "Skill",
      value: ultimateModel.skillLabel || "No skill"
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

        link.className = row.isProfileLink ? "profile-parameter-profile-link" : "";
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
  fractalSquare,
  hasUserProfile
}) => {
  return {
    ...createJayceeState({
      coreSquareLabels: getEmptyLabels(JAYCEE_ORDER.length),
      rings: []
    }),
    activeSquareNumber: 0,
    metrics: PROFILE_CORE_METRICS,
    squareBorderAlpha: 0.46,
    squareFillAlpha: hasUserProfile ? undefined : PROFILE_RING_FILL_ALPHA,
    squareCellBorderAlpha: 0.34,
    mapSquare: fractalSquare,
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
  let currentProfile = null;
  let dashboardSaveStatus = "";
  let dashboardSaveStatusTimer = null;
  let gameForm = createEmptyGameSettings();
  let gameSettings = null;
  let isDashboardSaving = false;
  let supabaseClient = null;
  let skillForms = [];
  let skills = [];
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

  const renderDashboardSavePanel = () => {
    const existingPanel = list.querySelector("[data-profile-dashboard-save]");

    if (!existingPanel || !isEditableProfilePage) return;

    existingPanel.replaceWith(createDashboardSavePanel({
      onSave: saveDashboardSettings,
      saveDisabled: !currentProfile || isDashboardSaving,
      saveStatus: dashboardSaveStatus
    }));
  };

  const markDashboardDirty = () => {
    dashboardSaveStatus = "Unsaved changes";
    renderDashboardSavePanel();
  };

  const updateDynamicFractalField = (fractalId, field, value) => {
    dynamicFractals = dynamicFractals.map((fractal) => (
      String(fractal.id) === String(fractalId)
        ? { ...fractal, [field]: getDisplayValue(value) }
        : fractal
    ));

    markDashboardDirty();
    saveProfileViewState();
    renderCore();
    renderCoreParameters();
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
      const skillPayloads = skillForms.map(getSkillPayload);
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
    markDashboardDirty();
    renderCore();
    renderCoreParameters();
    if (field === "ultimate_link") {
      renderResonances();
    }
  };

  const updateSkillField = (skillId, field, value) => {
    skillForms = skillForms.map((skill) => (
      skill.id === skillId
        ? { ...skill, [field]: getDisplayValue(value) }
        : skill
    ));
    markDashboardDirty();
    renderCore();
    renderCoreParameters();
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
          dynamicFractals,
          gameForm,
          onFractalFieldChange: updateDynamicFractalField,
          onFieldChange: updateSkillField,
          skillForms
        }),
        createUltimatePanel({
          dynamicFractals,
          gameForm,
          onFractalFieldChange: updateDynamicFractalField,
          onFieldChange: updatePrimaryFractalField,
          onSkillFieldChange: updateSkillField,
          publicProfiles,
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
    const activeModels = getActiveFractalModels({
      dynamicFractals,
      elementsByFractalId: getElementsByFractalId(),
      gameForm,
      skillForms
    });
    const passiveModel = getPassiveFractalModel({
      dynamicFractals,
      elementsByFractalId: getElementsByFractalId(),
      gameForm
    }) || getPassiveModel({ dynamicFractals, gameForm });
    const ultimateModel = getUltimateModel({ dynamicFractals, gameForm, publicProfiles, skillForms });
    const panel = createFractalParameterPanel({ activeModels, passiveModel, ultimateModel });

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
    const elementsByFractalId = getElementsByFractalId();
    const fractalSquare = getFractalGridSquareModel({
      dynamicFractals,
      elementsByFractalId,
      gameForm
    });

    const coreState = createProfileCoreState({
      avatarImage,
      fractalSquare,
      hasUserProfile
    });
    drawJaycee(canvas, coreState);
  };

  const scheduleRenderCore = () => {
    window.requestAnimationFrame(renderCore);
  };

  const syncProfileView = () => {
    renderCore();
    renderCoreParameters();
    renderResonances();
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

    publicProfiles = (isPresentPage || hasUserProfile) ? await fetchPublicProfiles(client) : [];
    avatarImage = !hasUserProfile ? null : await loadOptionalImage(await getAvatarImageUrl(client, profile));
    renderCore();
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
