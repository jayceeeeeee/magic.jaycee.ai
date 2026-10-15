import { fetchUserGameSettings, fetchSkillsByIds, saveOwnGame } from "../config/data.js";
import { JAYCEE_GAME_SKILL_COLUMNS } from "../config/game-config.js";

export const createSkillsSection = ({ client, profile, createSection }) => {
  const { section, content } = createSection("Skills", "is-skills");
  const editor = document.createElement("div");
  const fields = document.createElement("fieldset");
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

  section.hidden = true;
  section.inert = true;
  editor.className = "jaycee-game-editor";
  fields.className = "profile-game-skill-fields";
  fields.disabled = true;
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
    if (!description.value) {
      description.style.height = "36px";
      return;
    }
    description.style.height = "auto";
    const border = description.offsetHeight - description.clientHeight;
    description.style.height = `${Math.min(200, Math.max(36, description.scrollHeight + border))}px`;
  };
  const resizeSelected = () => {
    const selected = inputs[Number(selector.value)];
    if (selected) resizeDescription(selected.description);
  };
  const showSelected = () => {
    if (Number(selector.value) >= 4) selector.value = "0";
    inputs.forEach(({ group }, index) => { group.hidden = index !== Number(selector.value); });
    resizeSelected();
  };
  selector.addEventListener("change", showSelected);

  // Ultimate is kept in the saved payload, with no editable controls.
  slots.slice(0, 4).forEach((_slot, index) => {
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
    descriptionCaption.textContent = "Description";
    description.name = `skill_${index}_description`;
    description.rows = 1;
    description.placeholder = "Put your skill description in markdown format.";
    description.maxLength = 20000;
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
      const game = await fetchUserGameSettings(client, profile);
      const skills = await fetchSkillsByIds(client, JAYCEE_GAME_SKILL_COLUMNS.map((column) => game?.[column]));
      savedSkills = JAYCEE_GAME_SKILL_COLUMNS.map((column) => {
        const skill = skills.find((item) => item.id === game?.[column]);
        return { label: skill?.label || "", description: skill?.description || "" };
      });
      inputs.forEach(({ name, description }, index) => {
        name.value = savedSkills[index].label;
        description.value = savedSkills[index].description;
      });
      fields.disabled = false;
      loaded = true;
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
    setUnlocked: (unlocked) => {
      section.hidden = !unlocked;
      section.inert = !unlocked;
      if (unlocked) void load();
    },
    getUpdates: () => {
      if (section.hidden) return { skills: null };
      if (!loaded) return { error: "Your skills have not loaded yet. Retry before saving." };
      const skills = inputs.map(({ name, description }) => ({ label: name.value.trim(), description: description.value.trim() }));
      const invalid = skills.findIndex((skill) => skill.description && !skill.label);
      if (invalid !== -1) {
        selector.value = String(invalid);
        showSelected();
        inputs[invalid].name.focus();
        return { error: "Add a name for each skill that has a description." };
      }
      const changed = skills.some((skill, index) => skill.label !== savedSkills[index].label.trim()
        || skill.description !== savedSkills[index].description.trim());
      return { skills: changed ? [...skills, { ...savedSkills[4] }] : null };
    },
    setSaving: (saving) => { fields.disabled = saving || !loaded; },
    save: async (skills) => {
      if (!skills) return;
      await saveOwnGame(client, skills);
      savedSkills = skills.map((skill) => ({ ...skill }));
    }
  };
};
