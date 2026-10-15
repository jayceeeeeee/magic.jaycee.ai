import { fetchUserGameSettings, fetchSkillsByIds, saveOwnGame } from "../config/data.js";
import { JAYCEE_GAME_SKILL_COLUMNS } from "../config/game-config.js";

export const createSkillsSection = ({ client, profile, createSection }) => {
  const { section, content } = createSection("Skills", "is-skills");
  const form = document.createElement("form");
  const fields = document.createElement("fieldset");
  const intro = document.createElement("p");
  const status = document.createElement("p");
  const save = document.createElement("button");
  const retry = document.createElement("button");
  const inputs = [];
  let loaded = false;
  let loading = null;

  section.hidden = true;
  section.inert = true;
  form.className = "jaycee-game-editor";
  fields.className = "profile-game-skill-fields";
  fields.disabled = true;
  intro.textContent = "Create your own game and share your skills as a Master. Add instructions and resource links in Markdown.";
  ["Passive", "Skill 1", "Skill 2", "Skill 3", "Ultimate"].forEach((slot, index) => {
    const group = document.createElement("div");
    const label = document.createElement("label");
    const caption = document.createElement("span");
    const name = document.createElement("input");
    const descriptionLabel = document.createElement("label");
    const descriptionCaption = document.createElement("span");
    const description = document.createElement("textarea");
    group.className = "profile-game-skill";
    caption.textContent = `${slot} name`;
    name.name = `skill_${index}_label`;
    name.maxLength = 120;
    descriptionCaption.textContent = `${slot} description & resources`;
    description.name = `skill_${index}_description`;
    description.rows = 4;
    description.maxLength = 20000;
    label.append(caption, name);
    descriptionLabel.append(descriptionCaption, description);
    group.append(label, descriptionLabel);
    fields.append(group);
    inputs.push({ name, description });
  });
  save.type = "submit";
  save.className = "account-button account-button-primary";
  save.textContent = "Create game";
  retry.type = "button";
  retry.textContent = "Retry";
  retry.hidden = true;
  status.setAttribute("role", "status");
  fields.append(save);
  form.append(fields, status, retry);
  content.append(intro, form);

  const load = () => {
    if (loaded || loading) return loading;
    status.textContent = "Loading your game...";
    retry.hidden = true;
    loading = (async () => {
      const game = await fetchUserGameSettings(client, profile);
      const skills = await fetchSkillsByIds(client, JAYCEE_GAME_SKILL_COLUMNS.map((column) => game?.[column]));
      inputs.forEach(({ name, description }, index) => {
        const skill = skills.find((item) => item.id === game?.[JAYCEE_GAME_SKILL_COLUMNS[index]]);
        name.value = skill?.label || "";
        description.value = skill?.description || "";
      });
      save.textContent = game ? "Save game" : "Create game";
      fields.disabled = false;
      loaded = true;
      status.textContent = "";
    })().catch((error) => {
      status.textContent = error?.message || "Your game could not be loaded.";
      retry.hidden = false;
    }).finally(() => { loading = null; });
    return loading;
  };
  retry.addEventListener("click", load);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loaded || fields.disabled || section.hidden) return;
    const skills = inputs.map(({ name, description }) => ({ label: name.value.trim(), description: description.value.trim() }));
    if (skills.some((skill) => skill.description && !skill.label)) {
      status.textContent = "Add a name for each skill that has a description.";
      return;
    }
    fields.disabled = true;
    status.textContent = "Saving your game...";
    try {
      await saveOwnGame(client, skills);
      save.textContent = "Save game";
      status.textContent = "Game saved.";
      window.dispatchEvent(new CustomEvent("jaycee:account-updated", { detail: { profile: { ...profile } } }));
    } catch (error) {
      status.textContent = error?.message || "Your game could not be saved. Please try again.";
    } finally {
      fields.disabled = false;
    }
  });

  return { section, setUnlocked: (unlocked) => {
    section.hidden = !unlocked;
    section.inert = !unlocked;
    if (unlocked) void load();
  } };
};
