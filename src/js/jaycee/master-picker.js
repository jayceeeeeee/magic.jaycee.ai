import { getFeaturedMasters, LOCKED_PREVIEW_MASTERS } from "../config/master-catalog.js";
import { getDisplayValue } from "../config/data.js";
import { renderSkillMarkdown } from "./markdown.js";
import { createSkillPanel, createLockedIcon, getPassiveSkillModel, getActiveSkillModels, getUltimateModel } from "./skill-panel.js";
const getMasterInitial = profile => (getDisplayValue(profile?.username) || getDisplayValue(profile?.full_name) || "?").slice(0, 1).toUpperCase();

export const createNoticeMasterBadge = (profile, fallbackUsername = "Unknown") => {
  const badge = document.createElement("span");
  const avatar = document.createElement("span");
  const name = document.createElement("span");
  const username = getDisplayValue(profile?.username) || getDisplayValue(profile?.full_name) || fallbackUsername;

  badge.className = "profile-notice-master-card";
  avatar.className = "profile-notice-master-avatar";
  name.className = "profile-notice-master-name";
  name.textContent = username;

  if (profile?.avatarUrl) {
    const image = document.createElement("img");

    image.alt = "";
    image.src = profile.avatarUrl;
    avatar.append(image);
  } else {
    avatar.textContent = username.slice(0, 1).toUpperCase();
  }

  badge.append(avatar, name);

  return badge;
};

const featuredMasters = () => getFeaturedMasters(typeof window === "undefined" ? {} : window.JayceeConfig?.masterAccountIds);

export const isMasterLinkLocked = (profile) => (
  profile?.linkLocked === true || featuredMasters().get(profile?.id)?.linkLocked === true
);

const openMasterCard = (profile, { onSelect = null, onLoadDetails = null, trigger = null } = {}) => {
  if (isMasterLinkLocked(profile) || document.querySelector('.profile-master-dialog')) return;

  const dialog = document.createElement('dialog');
  const close = document.createElement('button');
  const avatar = document.createElement('div');
  const username = document.createElement('h2');
  const fullName = document.createElement('p');
  const lore = document.createElement('div');
  const details = document.createElement('div');
  const action = document.createElement('button');
  dialog.className = 'profile-master-dialog';
  dialog.setAttribute('aria-labelledby', 'profile-master-card-name');
  close.className = 'profile-master-dialog-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close profile card');
  close.textContent = '×';
  avatar.className = 'profile-master-dialog-avatar';
  avatar.textContent = getMasterInitial(profile);
  if (profile.avatarUrl) {
    const image = document.createElement('img');
    image.src = profile.avatarUrl;
    image.alt = '';
    image.addEventListener('error', () => avatar.replaceChildren(getMasterInitial(profile)), { once: true });
    avatar.replaceChildren(image);
  }
  username.id = 'profile-master-card-name';
  username.textContent = getDisplayValue(profile.username) || 'Unknown';
  fullName.className = 'profile-master-dialog-full-name';
  fullName.textContent = getDisplayValue(profile.full_name);
  lore.className = 'profile-master-dialog-lore profile-skill-description';
  renderSkillMarkdown(lore, getDisplayValue(profile.lore) || (onLoadDetails ? '' : 'This story is still being written.'));
  details.className = 'profile-master-dialog-details';
  details.setAttribute('aria-live', 'polite');
  action.className = 'profile-master-dialog-action';
  action.type = 'button';
  action.textContent = onSelect ? 'Select' : 'OK';
  const renderDetails = ({ lore: profileLore = profile.lore, game = null, skills = [] } = {}) => {
    renderSkillMarkdown(lore, getDisplayValue(profileLore) || 'This story is still being written.');
    let selectedIndex = null;
    const renderAbilities = () => {
      const models = { gameForm: game, skillForms: skills };
      details.replaceChildren(createSkillPanel({
        passiveModel: getPassiveSkillModel({ ...models, hasLinkedMaster: true }),
        activeModels: getActiveSkillModels(models),
        ultimateModel: getUltimateModel(models),
        currentLevel: 0,
        selectedIndex,
        onSelect: (index) => {
          selectedIndex = selectedIndex === index ? null : index;
          renderAbilities();
          details.querySelector(`[data-skill-index="${index}"]`)?.focus({ preventScroll: true });
        }
      }));
    };
    renderAbilities();
  };
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    dialog.remove();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    // Restoring focus must not leave the carousel paused after a preview.
    trigger?.closest('.profile-masters-carousel')?.classList.add('is-resuming');
  };
  const dismiss = () => {
    dialog.close();
    cleanup();
  };
  close.addEventListener('click', dismiss);
  action.addEventListener('click', () => {
    action.disabled = true;
    dismiss();
    if (onSelect) void onSelect(profile);
  });
  dialog.addEventListener('close', cleanup, { once: true });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismiss();
  });
  dialog.append(close, avatar, username, fullName, lore, details, action);
  document.body.append(dialog);
  dialog.showModal();
  action.focus();
  if (onLoadDetails) {
    const load = async () => {
      details.textContent = 'Loading profile…';
      details.setAttribute('aria-busy', 'true');
      try {
        const data = await onLoadDetails(profile);
        if (dialog.isConnected) renderDetails(data || {});
      } catch {
        if (!dialog.isConnected) return;
        const message = document.createElement('p');
        const retry = document.createElement('button');
        message.textContent = 'The profile details could not be loaded.';
        retry.type = 'button';
        retry.className = 'profile-master-dialog-retry';
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => void load());
        details.replaceChildren(message, retry);
      } finally {
        details.removeAttribute('aria-busy');
      }
    };
    void load();
  } else renderDetails();
};

export const createMastersNoticeContent = (profiles, { onSelect = null, onLoadDetails = null, isSaving = false, referrerId = null } = {}) => {
  // Temporary slider lineup; keep other public profiles out of these cards.
  const visibleProfiles = profiles.filter((profile) => (
    featuredMasters().has(profile?.id) || profile?.id === referrerId
  ));
  const content = document.createDocumentFragment();

  const rows = [
    { profiles: visibleProfiles, reverse: false, label: "Masters in the game room" },
    { profiles: LOCKED_PREVIEW_MASTERS, reverse: true, label: "Locked Masters" }
  ];

  rows.forEach(({ profiles: rowProfiles, reverse, label }) => {
    if (!rowProfiles.length) return;
    const carousel = document.createElement("div");
    const track = document.createElement("div");

    carousel.className = `profile-masters-carousel${reverse ? " is-reversed" : ""}`;
    carousel.tabIndex = 0;
    carousel.setAttribute("role", "region");
    carousel.setAttribute("aria-label", label);
    const pauseOnInteraction = () => carousel.classList.remove('is-resuming');
    carousel.addEventListener('pointerenter', pauseOnInteraction);
    carousel.addEventListener('focusin', pauseOnInteraction);
    track.className = "profile-masters-track";

    for (let copy = 0; copy < 2; copy += 1) {
      const group = document.createElement("div");

      group.className = "profile-masters-group";
      if (copy === 0) {
        group.setAttribute("role", "group");
      } else {
        group.setAttribute("aria-hidden", "true");
      }
      const repetitions = Math.ceil(12 / rowProfiles.length);

      for (let repeat = 0; repeat < repetitions; repeat += 1) {
        rowProfiles.forEach((profile) => {
          const card = createNoticeMasterBadge(profile);

          if (repeat > 0) card.setAttribute("aria-hidden", "true");
          const choice = document.createElement("button");
          const isLocked = isMasterLinkLocked(profile);

          choice.className = `profile-master-choice${isLocked ? " is-locked" : ""}`;
          choice.type = "button";
          choice.disabled = isSaving || isLocked;
          choice.setAttribute("aria-label", isLocked
            ? `${getDisplayValue(profile.username)}'s game is locked`
            : `View ${getDisplayValue(profile.username)}'s profile`);
          choice.setAttribute('aria-haspopup', 'dialog');
          if (isLocked) {
            choice.title = "This Master's game is temporarily locked.";
            card.append(createLockedIcon("profile-master-lock-icon"));
          }
          if (copy > 0 || repeat > 0) {
            choice.tabIndex = -1;
            choice.setAttribute("aria-hidden", "true");
          }
          choice.addEventListener("click", () => {
            if (!choice.disabled) openMasterCard(profile, { onSelect, onLoadDetails, trigger: choice });
          });
          choice.append(card);
          group.append(choice);
        });
      }
      track.append(group);
    }
    carousel.append(track);
    content.append(carousel);
  });

  return content;
};
