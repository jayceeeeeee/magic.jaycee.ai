import {
  JAYCEE_ORDER,
  createJayceeState,
  drawJaycee,
  getJayceeHit,
  getTopCenteredLastSegmentRotation
} from "./jaycee-core.js";
import {
  CORE_RING_ID,
  DEFAULT_CORE_RING_NUMBER,
  DEFAULT_SELECTED_NUMBER,
  GOD_TYPE_VALUE,
  LORE_TYPE_VALUE,
  fetchDynamicFractalElements,
  fetchJayceeResonances,
  fetchProfileByUserId,
  fetchProfileByUsername,
  fetchPublicProfiles,
  fetchSkillsByIds,
  fetchUserResonances,
  fetchUserDynamicFractals,
  fetchUserGameSettings,
  getAvatarImageUrl,
  getBackgroundImageUrl,
  getDisplayValue,
  getThemeSettingsFromProfile,
  isHexColor,
  loadOptionalImage,
  updateSkills,
  updateUserDynamicFractals,
  upsertUserGameSettings
} from "./jaycee-data.js";
import {
  createResonanceColumn,
  getResonanceGroupsForNumber,
  getRowsForType
} from "./jaycee-dashboard.js";

const PROFILE_CORE_METRICS = {
  ringMaxRadialShare: 0.34,
  ringWidthMax: 32,
  ringWidthMin: 14,
  ringWidthRatio: 0.072
};
const PROFILE_RING_ACTIVE_FILL_ALPHA = 0.09;
const PROFILE_RING_FILL_ALPHA = 0.26;
const PROFILE_VIEW_CACHE_PREFIX = "jayceeProfileView";
const CORE_RING_FALLBACK_LABEL = "Lore";

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

const hexToRgbParts = (color) => {
  const value = Number.parseInt(color.slice(1), 16);

  return {
    blue: value & 255,
    green: (value >> 8) & 255,
    red: (value >> 16) & 255
  };
};

const clampColorChannel = (value) => Math.min(255, Math.max(0, Math.round(value)));

const rgbPartsToHex = ({ red, green, blue }) => (
  `#${[red, green, blue].map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0")).join("")}`
);

const mixHexColors = (start, end, amount) => {
  const startRgb = hexToRgbParts(start);
  const endRgb = hexToRgbParts(end);

  return rgbPartsToHex({
    blue: startRgb.blue + ((endRgb.blue - startRgb.blue) * amount),
    green: startRgb.green + ((endRgb.green - startRgb.green) * amount),
    red: startRgb.red + ((endRgb.red - startRgb.red) * amount)
  });
};

const getCssColorValue = (name, fallback) => {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();

  return isHexColor(value) ? value : fallback;
};

const getCoreRingSegmentColors = () => {
  const primary = getCssColorValue("--accent", "#53dcc6");
  const secondary = getCssColorValue("--accent-soft", "#ffd56b");

  return Array.from({ length: JAYCEE_ORDER.length }, (_, index) => {
    const alternation = index % 2 === 0 ? 0 : 0.08;

    return {
      centerStop: 0.18,
      end: mixHexColors(primary, secondary, 0.64 + alternation),
      gradientMode: "radial",
      middle: mixHexColors(primary, secondary, 0.32 + alternation),
      middleStop: 0.48,
      start: mixHexColors(primary, "#ffffff", 0.28)
    };
  });
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

const getGroupsWithSelectedResonanceValue = (groups, selectedNumber) => (
  groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({
      ...row,
      resonanceValue: getDisplayValue(row[String(selectedNumber)])
    }))
  }))
);

const getCoreRingSegmentKeys = () => JAYCEE_ORDER.map(String);

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

const getDynamicRingModels = ({
  dynamicFractals,
  elementsByFractalId,
  gameForm,
  selectedDynamicRingSegments,
  skillForms
}) => {
  const primaryFractal = dynamicFractals.find((fractal) => (
    getDisplayValue(fractal.id) === getDisplayValue(gameForm.primary_fractal)
  ));
  const primarySkillId = getDisplayValue(primaryFractal?.skill);

  if (!primaryFractal || !primarySkillId) return [];

  const fractalBySkillId = new Map(dynamicFractals.map((fractal) => [
    getDisplayValue(fractal.skill),
    fractal
  ]));
  const orderedSkills = orderSkillForms(skillForms, primarySkillId);
  const cycleBySkillId = new Map([[primarySkillId, Number(gameForm.primary_time)]]);
  const distanceBySkillId = new Map([[primarySkillId, Number(gameForm.primary_distance)]]);

  return orderedSkills
    .map((skill) => {
      const skillId = getDisplayValue(skill.id);
      const fractal = fractalBySkillId.get(skillId);
      const elements = getFractalElements(elementsByFractalId, fractal?.id);

      if (!fractal || !elements.length) return null;

      if (skillId !== primarySkillId && !cycleBySkillId.has(skillId)) {
        const parentCycle = cycleBySkillId.get(getDisplayValue(skill.parent));
        const parentDistance = distanceBySkillId.get(getDisplayValue(skill.parent));
        const ratio = Number(skill.ratio);

        if (Number.isFinite(parentCycle) && Number.isFinite(ratio) && ratio > 0) {
          cycleBySkillId.set(skillId, parentCycle / ratio);
        }
        if (Number.isFinite(parentDistance) && Number.isFinite(ratio) && ratio > 0) {
          distanceBySkillId.set(skillId, parentDistance / ratio);
        }
      }

      const segmentKeys = elements.map((element) => getDisplayValue(element.id));
      const selectedSegment = selectedDynamicRingSegments.get(fractal.id) || segmentKeys[0];
      const selectedElement = elements.find((element) => (
        getDisplayValue(element.id) === getDisplayValue(selectedSegment)
      )) || elements[0];

      return {
        cycleSeconds: cycleBySkillId.get(skillId),
        distanceMeters: distanceBySkillId.get(skillId),
        elements,
        fractal,
        id: `dynamic-fractal:${fractal.id}`,
        label: getDisplayValue(fractal.label) || "Fractal",
        practiceSeconds: cycleBySkillId.get(skillId),
        segmentKeys,
        selectedElement,
        selectedSegment,
        skill,
        skillLabel: getDisplayValue(skill.label) || "Active"
      };
    })
    .filter(Boolean);
};

const getCoreRingFractal = (rows) => (
  rows.find((row) => (
    row.sourceType === "jaycee"
    && getDisplayValue(row.type).toLowerCase() === LORE_TYPE_VALUE
  )) || null
);

const getCoreFractalLabel = (fractal, fallback) => getDisplayValue(fractal?.label) || fallback;

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
    window.location.href = `/src/html/jaycee-${encodeURIComponent(username)}.html`;
  });
  label.append(text, select);

  return label;
};

const createEmptyGameSettings = () => ({
  primary_distance: "",
  primary_fractal: "",
  primary_time: ""
});

const createGameForm = (settings) => ({
  primary_distance: getDisplayValue(settings?.primary_distance),
  primary_fractal: getDisplayValue(settings?.primary_fractal),
  primary_time: getDisplayValue(settings?.primary_time)
});

const getGamePayload = (form) => ({
  primary_distance: Number.isFinite(Number(form?.primary_distance)) && getDisplayValue(form?.primary_distance)
    ? Number(form.primary_distance)
    : null,
  primary_fractal: getDisplayValue(form?.primary_fractal) || null,
  primary_time: Number.isFinite(Number(form?.primary_time)) && getDisplayValue(form?.primary_time)
    ? Number(form.primary_time)
    : null
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

const getPrimarySkillId = (dynamicFractals, gameForm) => {
  const selectedFractalId = getDisplayValue(gameForm?.primary_fractal);
  const selectedFractal = dynamicFractals.find((fractal) => String(fractal.id) === String(selectedFractalId));

  return getDisplayValue(selectedFractal?.skill);
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
  onSelect
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const selectedFractalId = getDisplayValue(gameForm?.primary_fractal);
  const selectedFractal = dynamicFractals.find((fractal) => String(fractal.id) === String(selectedFractalId)) || null;
  const fields = [
    { key: "primary_time", label: "Cycle (s)", type: "number", value: getDisplayValue(gameForm?.primary_time) },
    { key: "primary_distance", label: "Zone (m)", type: "number", value: getDisplayValue(gameForm?.primary_distance) }
  ];
  const fractalLabel = document.createElement("label");
  const select = document.createElement("select");
  const emptyOption = document.createElement("option");
  const fieldsRow = document.createElement("div");

  section.className = "profile-resonance-column profile-primary-fractal-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Passive";
  content.className = "profile-primary-fractal-content";
  fractalLabel.className = "profile-primary-fractal-field";
  select.className = "profile-primary-fractal-select";
  select.value = "";
  emptyOption.value = "";
  emptyOption.textContent = "Choose a primary fractal";
  select.replaceChildren(emptyOption, ...dynamicFractals.map((fractal) => {
    const option = document.createElement("option");

    option.value = fractal.id;
    option.textContent = getDisplayValue(fractal.label) || "Untitled fractal";

    return option;
  }));
  select.value = selectedFractal ? selectedFractal.id : "";
  select.addEventListener("change", () => onSelect(select.value));
  fractalLabel.append(document.createElement("span"), select);
  fractalLabel.firstElementChild.textContent = "Fractal";
  content.append(fractalLabel);
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
      onFieldChange(field.key, input.value);
    });
    label.append(labelText, input);
    fieldsRow.append(label);
  });
  content.append(fieldsRow);
  section.append(heading, content);

  return section;
};

const createSecondaryFractalPanel = ({
  dynamicFractals,
  gameForm,
  onFractalFieldChange,
  skillForms
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const primarySkillId = getPrimarySkillId(dynamicFractals, gameForm);
  const fractalsBySkillId = new Map(dynamicFractals.map((fractal) => [
    getDisplayValue(fractal.skill),
    fractal
  ]));
  const orderedSkillForms = orderSkillForms(skillForms, primarySkillId);
  const orderedFractals = [
    ...orderedSkillForms
      .map((skill) => fractalsBySkillId.get(getDisplayValue(skill.id)))
      .filter(Boolean),
    ...dynamicFractals.filter((fractal) => (
      !orderedSkillForms.some((skill) => getDisplayValue(skill.id) === getDisplayValue(fractal.skill))
    ))
  ];

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
  primarySkillId,
  skillForms
}) => {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const content = document.createElement("div");
  const orderedSkillForms = orderSkillForms(skillForms, primarySkillId);
  const visibleSkillForms = orderedSkillForms.filter((skill) => (
    getDisplayValue(skill.id) !== getDisplayValue(primarySkillId)
  ));

  section.className = "profile-resonance-column profile-skills-panel";
  heading.className = "profile-resonance-column-title";
  heading.textContent = "Actives";
  content.className = "profile-skills-content";

  if (!visibleSkillForms.length) {
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

  visibleSkillForms.forEach((skill, index) => {
    const item = document.createElement("article");
    const badge = document.createElement("span");

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
    emptyParent.textContent = "No parent";
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

const createDynamicRingParameterPanel = ({ ringModels }) => {
  if (!ringModels.length) return null;

  const section = document.createElement("section");
  const heading = document.createElement("h2");

  section.className = "profile-parameter-panel";
  section.dataset.profileParameters = "";
  heading.textContent = "Parameters";
  section.append(heading);
  ringModels.forEach((ringModel) => {
    const group = document.createElement("article");
    const title = document.createElement("h3");
    const list = document.createElement("dl");
    const rows = [{
      label: "Cycle",
      value: formatDuration(ringModel.fractal.time, { compact: false }) || "00:00:00"
    }, {
      label: "Practice",
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

  return section;
};

const createProfileCoreState = ({
  avatarImage,
  hasUserProfile,
  ringBackgroundImage,
  ringModels,
  rows,
  selectedSpaceNumber,
  selectedCoreRingSegments
}) => {
  const coreRingSegmentKeys = getCoreRingSegmentKeys();
  const coreRingSegmentColors = getCoreRingSegmentColors();
  const hasRingBackground = Boolean(ringBackgroundImage);
  const coreRingFractal = getCoreRingFractal(rows);
  const coreRingRotation = getTopCenteredLastSegmentRotation(coreRingSegmentKeys.length);
  const coreRingActiveSegmentIndex = getActiveSegmentIndex(
    coreRingSegmentKeys,
    selectedCoreRingSegments.get(CORE_RING_ID) || DEFAULT_CORE_RING_NUMBER
  );
  const rings = [
    {
      id: CORE_RING_ID,
      activeSegmentIndex: coreRingActiveSegmentIndex,
      count: coreRingSegmentKeys.length,
      backgroundImage: ringBackgroundImage,
      backgroundImageAlpha: 0.9,
      fillAlpha: !hasRingBackground && coreRingSegmentColors ? PROFILE_RING_FILL_ALPHA : 0,
      activeFillAlpha: PROFILE_RING_ACTIVE_FILL_ALPHA,
      label: getCoreFractalLabel(coreRingFractal, CORE_RING_FALLBACK_LABEL),
      labels: getEmptyLabels(coreRingSegmentKeys.length),
      rotation: coreRingRotation,
      segmentColors: hasRingBackground ? null : coreRingSegmentColors,
      segmentKeys: coreRingSegmentKeys,
      showBorders: true,
      showDividers: true,
      styledSegmentIndices: !hasRingBackground && coreRingSegmentColors
        ? coreRingSegmentKeys.map((_, index) => index)
        : [coreRingActiveSegmentIndex],
      tone: "accent"
    }
  ];
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
  const publicUsername = getDisplayValue(shell?.dataset.profileUsername);
  const pageMode = getDisplayValue(shell?.dataset.profileMode) || (publicUsername ? "public" : "profile");
  const isPresentPage = pageMode === "present";
  const isEditableProfilePage = pageMode === "profile" && !publicUsername;
  const hasUserProfile = Boolean(publicUsername) || isEditableProfilePage;

  if (!shell || !canvas || !status || !list) return;

  let rows = [];
  let dynamicFractalElements = [];
  let dynamicFractals = [];
  let publicProfiles = [];
  let avatarImage = null;
  let ringBackgroundImage = null;
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
  const selectedCoreRingSegments = new Map([[CORE_RING_ID, String(DEFAULT_CORE_RING_NUMBER)]]);
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

    if (!cache) {
      syncCoreSquareWithCoreRingSegment();
      return;
    }

    if (Number.isFinite(Number(cache.selectedSpaceNumber))) {
      selectedSpaceNumber = Number(cache.selectedSpaceNumber);
    }

    const cachedCoreRingSegments = cache.selectedCoreRingSegments || cache.selectedTimeSegments;

    if (cachedCoreRingSegments && typeof cachedCoreRingSegments === "object") {
      Object.entries(cachedCoreRingSegments).forEach(([key, value]) => {
        const segment = getDisplayValue(value);

        if (key === CORE_RING_ID && segment) {
          selectedCoreRingSegments.set(key, segment);
        }
      });
    }

    syncCoreSquareWithCoreRingSegment();
  };

  const saveProfileViewState = () => {
    saveProfileViewCache(profileViewCacheKey, {
      selectedSpaceNumber,
      selectedCoreRingSegments: Object.fromEntries(selectedCoreRingSegments)
    });
  };

  const syncCoreSquareWithCoreRingSegment = () => {
    const coreRingSegment = Number(selectedCoreRingSegments.get(CORE_RING_ID));

    if (JAYCEE_ORDER.includes(coreRingSegment)) {
      selectedSpaceNumber = coreRingSegment;
    }
  };

  const setCoreRingSegmentSelection = (ringId, segmentKey) => {
    selectedCoreRingSegments.set(ringId, String(segmentKey));

    if (ringId === CORE_RING_ID) {
      syncCoreSquareWithCoreRingSegment();
    }
  };

  const setDynamicRingSegmentSelection = (ringId, segmentKey) => {
    const [, fractalId] = getDisplayValue(ringId).split(":");

    if (!fractalId) return;
    selectedDynamicRingSegments.set(fractalId, getDisplayValue(segmentKey));
  };

  const setPrimaryFractalSelection = (fractalId) => {
    const primarySkillId = getPrimarySkillId(dynamicFractals, { primary_fractal: fractalId });

    gameForm = {
      ...gameForm,
      primary_fractal: getDisplayValue(fractalId)
    };
    if (primarySkillId) {
      skillForms = skillForms.map((skill) => (
        getDisplayValue(skill.id) === primarySkillId
          ? { ...skill, parent: "", ratio: "1" }
          : skill
      ));
    }
    dashboardSaveStatus = "Unsaved changes";
    syncProfileView();
  };

  const updateDynamicFractalField = (fractalId, field, value) => {
    dynamicFractals = dynamicFractals.map((fractal) => (
      String(fractal.id) === String(fractalId)
        ? { ...fractal, [field]: getDisplayValue(value) }
        : fractal
    ));

    if (field === "skill" && String(gameForm.primary_fractal) === String(fractalId)) {
      skillForms = skillForms.map((skill) => (
        getDisplayValue(skill.id) === getDisplayValue(value)
          ? { ...skill, parent: "", ratio: "1" }
          : skill
      ));
    }
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
      const primarySkillId = getPrimarySkillId(dynamicFractals, gameForm);
      const skillPayloads = skillForms.map((skill) => {
        const payload = getSkillPayload(skill);

        return getDisplayValue(payload.id) === primarySkillId
          ? { ...payload, parent: null, ratio: 1 }
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
        skillForms = createSkillForms(skills).map((skill) => (
          getDisplayValue(skill.id) === primarySkillId
            ? { ...skill, parent: "", ratio: "1" }
            : skill
        ));
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
    const coreGodGroups = getGroupsWithSelectedResonanceValue(
      getResonanceGroupsForNumber(
        getRowsForType(rows, GOD_TYPE_VALUE),
        selectedSpaceNumber
      ).filter((group) => group.sourceType === "jaycee"),
      selectedSpaceNumber
    );
    const selectedCoreRingNumber = selectedCoreRingSegments.get(CORE_RING_ID) || DEFAULT_CORE_RING_NUMBER;
    const coreLoreGroups = getGroupsWithSelectedResonanceValue(
      getResonanceGroupsForNumber(
        getRowsForType(rows, LORE_TYPE_VALUE),
        selectedCoreRingNumber
      ).filter((group) => group.sourceType === "jaycee"),
      selectedCoreRingNumber
    );
    const columns = [
      {
        groups: coreGodGroups,
        meta: "",
        selectedNumber: selectedSpaceNumber,
        title: "God"
      },
      {
        groups: coreLoreGroups,
        meta: "",
        selectedNumber: selectedCoreRingNumber,
        title: "Lore"
      }
    ].filter((column) => column.groups.length);

    status.textContent = "";
    list.replaceChildren(
      ...columns.map((column) => createResonanceColumn(
        column.title,
        column.groups,
        column.selectedNumber,
        column.meta
      )),
      ...(isEditableProfilePage ? [
        createPrimaryFractalPanel({
          dynamicFractals,
          gameForm,
          onFieldChange: updatePrimaryFractalField,
          onSelect: setPrimaryFractalSelection
        }),
        createSkillsPanel({
          onFieldChange: updateSkillField,
          primarySkillId: getPrimarySkillId(dynamicFractals, gameForm),
          skillForms
        }),
        createSecondaryFractalPanel({
          dynamicFractals,
          gameForm,
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
    const panel = createDynamicRingParameterPanel({ ringModels });

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
    const ringModels = getDynamicRingModels({
      dynamicFractals,
      elementsByFractalId: getElementsByFractalId(),
      gameForm,
      selectedDynamicRingSegments,
      skillForms
    });

    coreState = createProfileCoreState({
      avatarImage,
      hasUserProfile,
      ringBackgroundImage,
      ringModels,
      rows,
      selectedSpaceNumber,
      selectedCoreRingSegments
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
      setCoreRingSegmentSelection(CORE_RING_ID, hit.number);
    } else if (hit.type === "ring" && hit.ringId) {
      if (getDisplayValue(hit.ringId).startsWith("dynamic-fractal:")) {
        setDynamicRingSegmentSelection(hit.ringId, hit.segmentKey);
      } else {
        setCoreRingSegmentSelection(hit.ringId, hit.segmentKey);
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

    const jayceeRows = await fetchJayceeResonances(client);
    const profileRows = !hasUserProfile
      ? []
      : await fetchUserResonances(client, profile, { publicOnly: Boolean(publicUsername) });
    dynamicFractals = isEditableProfilePage ? await fetchUserDynamicFractals(client, profile) : [];
    dynamicFractalElements = isEditableProfilePage
      ? await fetchDynamicFractalElements(client, dynamicFractals.map((fractal) => fractal.id))
      : [];
    skills = isEditableProfilePage
      ? await fetchSkillsByIds(client, dynamicFractals.map((fractal) => fractal.skill))
      : [];
    skillForms = createSkillForms(skills);
    gameSettings = isEditableProfilePage ? await fetchUserGameSettings(client, profile) : null;
    gameForm = createGameForm(gameSettings);

    profileViewCacheKey = getProfileViewCacheKey({ pageMode, profile, publicUsername });
    rows = [...jayceeRows, ...profileRows];
    restoreProfileViewCache(profileViewCacheKey);
    if (
      gameForm.primary_fractal
      && !dynamicFractals.some((fractal) => String(fractal.id) === String(gameForm.primary_fractal))
    ) {
      gameSettings = { ...gameSettings, primary_fractal: null };
      gameForm = { ...gameForm, primary_fractal: "" };
    }
    skillForms = skillForms.map((skill) => (
      getDisplayValue(skill.id) === getPrimarySkillId(dynamicFractals, gameForm)
        ? { ...skill, parent: "", ratio: "1" }
        : skill
    ));
    publicProfiles = isPresentPage ? await fetchPublicProfiles(client) : [];
    avatarImage = !hasUserProfile ? null : await loadOptionalImage(await getAvatarImageUrl(client, profile));
    ringBackgroundImage = !hasUserProfile ? null : await loadOptionalImage(await getBackgroundImageUrl(client, profile));
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
