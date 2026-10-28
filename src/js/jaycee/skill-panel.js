import { GAME_RULES } from "../config/game-rules.js";
import { getDisplayValue } from "../config/data.js";
import { isQuestPending } from "./notifications.js";
import { renderSkillMarkdown } from "./markdown.js";
const ACTIVE_RING_LIMIT = 3;

export const formatDuration = (secondsValue, { compact = true } = {}) => {
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

export const getSelectedActiveLevel = (player, selectedAbilityIndex = 0) => {
  const level = Math.min(ACTIVE_RING_LIMIT, Math.max(1, Number(player?.level) || 1));

  return selectedAbilityIndex >= 1 && selectedAbilityIndex <= level
    ? selectedAbilityIndex
    : level;
};

export const getSkillById = (skills, skillId) => (
  (skills || []).find((skill) => getDisplayValue(skill.id) === getDisplayValue(skillId)) || null
);

export const getPassiveSkillModel = ({ gameForm, skillForms, hasLinkedMaster = false }) => ({
  cycleSeconds: GAME_RULES.skills[0].cycleSeconds,
  distanceMeters: GAME_RULES.skills[0].zoneMeters,
  label: GAME_RULES.skills[0].fractalLabel,
  skill: hasLinkedMaster ? getSkillById(skillForms, gameForm?.[GAME_RULES.skills[0].skillColumn]) : null
});

export const getActiveSkillModels = ({ gameForm, skillForms }) => {
  return GAME_RULES.skills.slice(1, 4).map((abilityConfig) => {
    const skill = getSkillById(skillForms, gameForm?.[abilityConfig.skillColumn]);
    const questSeconds = abilityConfig.practiceGoalSeconds;
    const distanceMeters = abilityConfig.zoneMeters;

    return {
      cycleSeconds: questSeconds,
      distanceMeters,
      label: abilityConfig.fractalLabel,
      passiveSeconds: abilityConfig.cycleSeconds,
      questSeconds,
      skill,
      skillLabel: getDisplayValue(skill?.label) || "No skill"
    };
  });
};

export const getUltimateModel = ({ gameForm, skillForms }) => {
  const skill = getSkillById(skillForms, gameForm?.[GAME_RULES.skills[4].skillColumn]);

  return {
    label: GAME_RULES.skills[4].fractalLabel,
    skillLabel: getDisplayValue(skill?.label),
    skillDescription: typeof skill?.description === "string" ? skill.description : ""
  };
};

export const getActiveQuestInfo = ({ activeModels = [], player = null, selectedAbilityIndex = 0 }) => {
  const level = getSelectedActiveLevel(player, selectedAbilityIndex);
  const activeModel = activeModels[Math.max(0, Math.min(level, activeModels.length) - 1)] || activeModels[0] || null;

  if (!activeModel) {
    return {
      activeTime: "0s",
      requiredTime: "0s",
      practiceTime: "0s",
      passiveTime: "0s",
      skillName: "your skill"
    };
  }

  const startedAt = level === Number(player?.level) && isQuestPending(player)
    ? NaN : Date.parse(player?.[`skill_${level}_start`] || "");
  const practiceSeconds = Math.max(0, Number(player?.[`skill_${level}_practice`]) || 0);
  const remainingPracticeSeconds = Math.max(0, Number(activeModel.questSeconds) - practiceSeconds);

  return {
    activeTime: formatDuration(Math.ceil(remainingPracticeSeconds), { compact: false }) || "0s",
    requiredTime: formatDuration(activeModel.questSeconds, { compact: false }) || "0s",
    practiceTime: formatDuration(Math.floor(practiceSeconds), { compact: false }) || "0s",
    deadline: Number.isFinite(startedAt) ? startedAt + activeModel.passiveSeconds * 1000 : null,
    passiveTime: formatDuration(activeModel.passiveSeconds, { compact: false }) || "0s",
    skillName: getDisplayValue(activeModel.skillLabel) || getDisplayValue(activeModel.label) || "your skill"
  };
};

export const updateQuestCountdown = (element, now = Date.now()) => {
  const remainingSeconds = Math.max(0, Math.ceil((Number(element.dataset.questDeadline) - now) / 1000));

  element.textContent = remainingSeconds > 0
    ? `Time remaining: ${formatDuration(remainingSeconds, { compact: false })}`
    : "Quest time expired.";
};

export const createQuestCountdown = (deadline) => {
  if (!Number.isFinite(deadline)) return null;

  const countdown = document.createElement("p");

  countdown.dataset.questDeadline = String(deadline);
  updateQuestCountdown(countdown);
  return countdown;
};

export const updatePracticeDetails = (element, questInfo) => {
  const countdown = element.querySelector("[data-practice-deadline]");
  if (Number.isFinite(questInfo.deadline)) {
    countdown.dataset.questDeadline = String(questInfo.deadline);
    updateQuestCountdown(countdown);
  } else {
    delete countdown.dataset.questDeadline;
    countdown.textContent = "Time remaining: —";
  }
  element.querySelector("[data-practice-progress]").textContent = `Practice: ${questInfo.practiceTime} / ${questInfo.activeTime}`;
};

export const createLockedIcon = (className = "profile-ability-lock-icon") => {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  icon.classList.add(className);
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  rect.setAttribute("x", "5");
  rect.setAttribute("y", "10");
  rect.setAttribute("width", "14");
  rect.setAttribute("height", "10");
  rect.setAttribute("rx", "2");
  path.setAttribute("d", "M8 10V7a4 4 0 0 1 8 0v3");
  icon.append(rect, path);

  return icon;
};

export const createSkillPanel = ({
  activeModels,
  currentLevel = 0,
  isDescriptionClosing = false,
  onSelect,
  onTogglePractice,
  passiveModel,
  player = null,
  practicingSkillIndex = null,
  selectedIndex = null,
  masterLineage = null,
  hasLineageMaster = false,
  ultimateModel
}) => {
  if (!passiveModel && !activeModels.length && !ultimateModel) return null;

  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const buttons = document.createElement("div");
  const description = document.createElement("article");
  const abilities = [];

  section.className = "profile-parameter-panel";
  section.dataset.profileParameters = "";
  heading.textContent = "Abilities";
  buttons.className = "profile-ability-bar";
  description.className = "profile-parameter-section";

  if (passiveModel) {
    abilities.push({
      label: getDisplayValue(passiveModel.skill?.label) || "No skill",
      description: passiveModel.skill?.description || "",
      type: "passive",
      unlockLevel: 0
    });
  }
  activeModels.forEach((skillModel, index) => {
    abilities.push({
      label: getDisplayValue(skillModel.skillLabel) || "No skill",
      description: skillModel.skill?.description || "",
      type: "active",
      unlockLevel: index + 1
    });
  });

  if (ultimateModel) {
    abilities.push({
      label: getDisplayValue(ultimateModel.skillLabel) || "No skill",
      description: ultimateModel.skillDescription || "",
      type: "ultimate",
      unlockLevel: 4
    });
  }

  const activeIndex = selectedIndex === null || selectedIndex === undefined
    ? null
    : Math.min(Math.max(0, selectedIndex), Math.max(0, abilities.length - 1));
  const activeAbility = activeIndex === null ? null : abilities[activeIndex];

  abilities.forEach((ability, index) => {
    const button = document.createElement("button");
    const isLocked = currentLevel < ability.unlockLevel;
    const isActive = !isLocked && !isDescriptionClosing && index === activeIndex;

    button.className = "profile-ability-button";
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-locked", isLocked);
    button.classList.toggle("is-practicing", index === practicingSkillIndex);
    button.classList.add(ability.type === "active" ? "is-active-skill" : `is-${ability.type}`);
    button.type = "button";
    button.dataset.skillIndex = String(index);
    button.dataset.skillLabel = ability.label;
    button.dataset.state = ability.type === "passive" ? "Passive" : isLocked ? "" : ability.type === "ultimate" ? "Ultimate" : "Ready";
    button.disabled = isLocked;
    button.textContent = ability.label;
    button.title = "View skill details";
    button.setAttribute("aria-pressed", String(isActive));
    if (isLocked) {
      const lockStatus = document.createElement("span");
      const lockText = document.createElement("span");

      lockStatus.className = "profile-ability-lock-status";
      lockText.textContent = "Locked";
      lockStatus.append(createLockedIcon(), lockText);
      button.append(lockStatus);
    } else {
      button.addEventListener("click", () => onSelect?.(index));
    }
    buttons.append(button);
  });

  if (activeAbility && currentLevel >= activeAbility.unlockLevel) {
    description.classList.toggle("is-closing", isDescriptionClosing);
    if (activeAbility.type === "active") {
      const details = document.createElement("div");
      const countdown = document.createElement("p");
      const progress = document.createElement("p");

      details.className = "profile-skill-practice-details";
      details.dataset.skillPracticeDetails = String(activeIndex);
      countdown.dataset.practiceDeadline = "";
      progress.dataset.practiceProgress = "";
      details.append(countdown, progress);
      updatePracticeDetails(details, getActiveQuestInfo({ activeModels, player, selectedAbilityIndex: activeIndex }));
      description.append(details);
      if (activeAbility.description.trim()) description.append(document.createElement("hr"));
    }
    if (activeAbility.description.trim()) {
      const text = document.createElement("div");

      text.className = "profile-skill-description";
      renderSkillMarkdown(text, activeAbility.description);
      description.append(text);
    }
    if (activeAbility.type === "ultimate") {
      const lineage = document.createElement("div");
      const label = document.createElement("span");
      const name = document.createElement("span");
      lineage.className = "account-master-identity profile-skill-practice-details profile-ultimate-master";
      label.textContent = "Linked to:";
      name.textContent = getDisplayValue(masterLineage?.username)
        || getDisplayValue(masterLineage?.full_name)
        || (hasLineageMaster ? "Master unavailable" : "God");
      lineage.append(label);
      if (masterLineage) {
        const avatar = document.createElement("span");
        avatar.className = "account-master-avatar";
        avatar.textContent = name.textContent.slice(0, 1).toUpperCase();
        if (masterLineage.avatarUrl) {
          const image = document.createElement("img");
          image.src = masterLineage.avatarUrl;
          image.alt = "";
          avatar.replaceChildren(image);
        }
        lineage.append(avatar);
      }
      lineage.append(name);
      description.append(document.createElement("hr"), lineage);
    }
    if (activeAbility.type === "active") {
      const toggle = document.createElement("button");

      toggle.type = "button";
      toggle.className = "profile-play-button";
      toggle.dataset.practiceToggle = String(activeIndex);
      if (practicingSkillIndex !== activeIndex) toggle.dataset.uiSound = "skillStart";
      toggle.disabled = isDescriptionClosing || !player?.id || !activeModels[activeIndex - 1]?.skill
        || (activeIndex === Number(player?.level) && isQuestPending(player));
      toggle.textContent = practicingSkillIndex === activeIndex ? "Stop" : "Start";
      toggle.addEventListener("click", () => onTogglePractice?.(activeIndex));
      description.append(toggle);
    }
  }

  section.append(heading, buttons);
  const practiceStatus = document.createElement("p");
  practiceStatus.className = "profile-practice-status";
  practiceStatus.setAttribute("role", "status");
  section.append(practiceStatus);

  if (description.childElementCount) {
    section.append(description);
  }

  return section;
};
