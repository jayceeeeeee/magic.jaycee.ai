import { GAME_RULES } from "../config/game-rules.js";
﻿import { fetchUserGameSettings, fetchSkillsByIds, saveOwnGame } from "../config/data.js";

export const createSkillsSection = ({ client, profile, createSection, data = {}, onChange = () => {} }) => {
  const api = {
    fetchUserGameSettings: (...args) => fetchUserGameSettings(...args),
    fetchSkillsByIds: (...args) => fetchSkillsByIds(...args),
    saveOwnGame: (...args) => saveOwnGame(...args),
    ...data
  };
  const { section, content } = createSection("Skills", "is-skills");
  const editor = document.createElement("div");
  const fields = document.createElement("fieldset");
  const loreLabel = document.createElement("label");
  const loreCaption = document.createElement("span");
  const lore = document.createElement("textarea");
  const selectorLabel = document.createElement("label");
  const selectorCaption = document.createElement("span");
  const selector = document.createElement("select");
  const status = document.createElement("p");
  const retry = document.createElement("button");
  const inputs = [];
  const slots = ["Passive", "Skill 1", "Skill 2", "Skill 3", "Ultimate"];
  let savedSkills = [];
  let loaded = false;
  let loading = null;
  let accessLevel = 0;

  section.hidden = true;
  section.inert = true;
  editor.className = "jaycee-game-editor";
  fields.className = "profile-game-skill-fields";
  fields.disabled = true;
  loreCaption.textContent = "Lore";
  lore.name = "lore";
  lore.value = profile.lore || "";
  lore.rows = 2;
  lore.maxLength = 20000;
  lore.placeholder = "Write your own character's story in a markdwon format.";
  lore.addEventListener("input", onChange);
  loreLabel.append(loreCaption, lore);
  fields.append(loreLabel);
  selector.name = "skill_selector";
  selectorCaption.textContent = "Skill";
  slots.forEach((slot, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = index === 4 ? "Ultimate · Locked" : slot;
    option.disabled = index === 4;
    selector.append(option);
  });
  selectorLabel.append(selectorCaption, selector);
  fields.append(selectorLabel);

  const resizeDescription = (description) => {
    if (!description.getClientRects().length) return;
    const minHeight = parseFloat(window.getComputedStyle(description).minHeight) || 36;
    if (!description.value) {
      description.style.height = `${minHeight}px`;
      return;
    }
    description.style.height = "auto";
    const border = description.offsetHeight - description.clientHeight;
    description.style.height = `${Math.min(200, Math.max(minHeight, description.scrollHeight + border))}px`;
  };
  const resizeSelected = () => {
    resizeDescription(lore);
    const selected = inputs[Number(selector.value)];
    if (selected) resizeDescription(selected.description);
  };
  lore.addEventListener("input", () => resizeDescription(lore));
  const showSelected = () => {
    if (Number(selector.value) >= 4 && accessLevel < 4) selector.value = "0";
    inputs.forEach(({ group }, index) => { group.hidden = index !== Number(selector.value); });
    resizeSelected();
  };
  selector.addEventListener("change", showSelected);

  slots.forEach((_slot, index) => {
    const group = document.createElement("div");
    const label = document.createElement("label");
    const caption = document.createElement("span");
    const name = document.createElement("input");
    const descriptionLabel = document.createElement("label");
    const descriptionCaption = document.createElement("span");
    const description = document.createElement("textarea");
    group.className = "profile-game-skill";
    group.hidden = index !== 0;
    caption.textContent = "Name";
    name.name = `skill_${index}_label`;
    name.maxLength = 120;
    name.placeholder = "Put your skill name.";
    name.addEventListener("input", onChange);
    name.disabled = index === 4;
    descriptionCaption.textContent = "Description";
    description.name = `skill_${index}_description`;
    description.rows = 1;
    description.placeholder = "Put your skill description in markdown format.";
    description.maxLength = 20000;
    description.disabled = index === 4;
    description.addEventListener("input", () => resizeDescription(description));
    label.append(caption, name);
    descriptionLabel.append(descriptionCaption, description);
    group.append(label, descriptionLabel);
    fields.append(group);
    inputs.push({ name, description, group });
  });
  retry.type = "button";
  retry.textContent = "Retry";
  retry.hidden = true;
  status.setAttribute("role", "status");
  status.hidden = true;
  editor.append(fields, status, retry);
  content.append(editor);
  const setStatus = (message) => {
    status.textContent = message;
    status.hidden = !message;
  };

  const load = () => {
    if (loaded || loading) return loading;
    setStatus("Loading your game...");
    retry.hidden = true;
    loading = (async () => {
      const game = await api.fetchUserGameSettings(client, profile);
      const skills = await api.fetchSkillsByIds(client, GAME_RULES.skills.map((skill) => skill.skillColumn).map((column) => game?.[column]));
      savedSkills = GAME_RULES.skills.map((skill) => skill.skillColumn).map((column) => {
        const skill = skills.find((item) => item.id === game?.[column]);
        return { label: skill?.label || "", description: skill?.description || "" };
      });
      inputs.forEach(({ name, description }, index) => {
        name.value = savedSkills[index].label;
        description.value = savedSkills[index].description;
      });
      fields.disabled = false;
      loaded = true;
      onChange();
      setStatus("");
      window.requestAnimationFrame(resizeSelected);
    })().catch((error) => {
      setStatus(error?.message || "Your game could not be loaded.");
      retry.hidden = false;
    }).finally(() => { loading = null; });
    return loading;
  };
  retry.addEventListener("click", load);
  // Resize when the account panel opens or its available width changes.
  if (window.ResizeObserver) {
    let previousWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== previousWidth) {
        previousWidth = entry.contentRect.width;
        resizeSelected();
      }
    });
    observer.observe(fields);
  }

  return {
    section,
    getPublicationState: () => ({
      ready: loaded,
      missing: inputs.filter(({ name }) => !name.value.trim()).map(({ name }) => slots[Number(name.name.split("_")[1])])
    }),
    setUnlocked: (unlocked, highestLevel = 3) => {
      accessLevel = highestLevel;
      selector.options[4].disabled = accessLevel < 4;
      selector.options[4].textContent = accessLevel >= 4 ? "Ultimate" : "Ultimate · Locked";
      inputs[4].name.disabled = accessLevel < 4;
      inputs[4].description.disabled = accessLevel < 4;
      showSelected();
      section.hidden = !unlocked;
      section.inert = !unlocked;
      if (unlocked) void load();
    },
    getUpdates: () => {
      if (section.hidden) return { skills: null, updates: {} };
      if (!loaded) return { error: "Your skills have not loaded yet. Retry before saving." };
      const editable = accessLevel >= 4 ? inputs : inputs.slice(0, 4);
      const skills = editable.map(({ name, description }) => ({ label: name.value.trim(), description: description.value.trim() }));
      const invalid = skills.findIndex((skill) => skill.description && !skill.label);
      if (invalid !== -1) {
        selector.value = String(invalid);
        showSelected();
        inputs[invalid].name.focus();
        return { error: "Add a name for each skill that has a description." };
      }
      const changed = skills.some((skill, index) => skill.label !== savedSkills[index].label.trim()
        || skill.description !== savedSkills[index].description.trim());
      return {
        skills: changed ? (accessLevel >= 4 ? skills : [...skills, { ...savedSkills[4] }]) : null,
        updates: { lore: lore.value.trim() }
      };
    },
    setSaving: (saving) => { fields.disabled = saving || !loaded; },
    save: async (skills) => {
      if (!skills) return;
      await api.saveOwnGame(client, skills);
      savedSkills = skills.map((skill) => ({ ...skill }));
    }
  };
};
