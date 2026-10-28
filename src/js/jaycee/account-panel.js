import {
  PROFILE_TABLE,
  USER_IMAGES_BUCKET,
  fetchProfileByUserId,
  fetchPlayersForUser,
  getAvatarImageUrl,
  getDisplayValue,
} from "../config/data.js";
import { createSkillsSection } from "./game-editor.js";

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

  section.className = ["jaycee-account-section", className].filter(Boolean).join(" ");
  heading.className = "profile-section-label";
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
  { label: "Day", value: "day" },
  { label: "Hour", value: "hour" }
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

const createReferralControls = (profile, createLink = (username) => window.JayceeReferral?.createLink(username)) => {
  const section = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");
  const actions = document.createElement("div");
  const copy = document.createElement("button");
  const share = document.createElement("button");
  const status = document.createElement("p");
  section.className = "profile-referral";
  label.textContent = "Invite a friend";
  input.type = "text";
  input.readOnly = true;
  input.setAttribute("aria-label", "Your referral link");
  input.dataset.referralLink = "";
  label.append(input);
  actions.className = "profile-referral-actions";
  copy.type = share.type = "button";
  copy.className = share.className = "account-button account-button-ghost";
  copy.textContent = "Copy link";
  share.textContent = "Share";
  share.hidden = typeof navigator.share !== "function";
  status.setAttribute("role", "status");
  actions.append(copy, share);
  section.append(label, actions, status);

  const refresh = () => {
    input.value = createLink(profile.username) || "";
    copy.disabled = share.disabled = !input.value;
    status.textContent = "";
  };
  const copyLink = async () => {
    refresh();
    if (!input.value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
      else {
        input.focus();
        input.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
      }
      status.textContent = "Link copied.";
    } catch {
      input.focus();
      input.select();
      status.textContent = "Select and copy the link above.";
    }
  };
  copy.addEventListener("click", () => { void copyLink(); });
  share.addEventListener("click", async () => {
    refresh();
    if (!input.value) return;
    try { await navigator.share({ title: "Join me on Jaycee.ai", url: input.value }); }
    catch (error) { if (error.name !== "AbortError") await copyLink(); }
  });
  refresh();
  return { section, refresh };
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
  usernameField.input.maxLength = 100;
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

const createMasterSection = ({ client, profile, skills, data, getUsername = () => profile.username }) => {
  const { section, content } = createSection("Master", "is-master");
  const identity = document.createElement("div");
  const avatar = document.createElement("span");
  const name = document.createElement("span");
  const visibilityField = document.createElement("label");
  const visibilityInput = document.createElement("input");
  const hint = document.createElement("p");
  const publicationControls = document.createElement("div");
  let masterId;
  let level = 0;
  identity.className = "account-master-identity";
  avatar.className = "account-master-avatar";
  identity.append(avatar, name);
  visibilityField.className = "profile-visibility-field";
  visibilityField.hidden = true;
  visibilityInput.type = "checkbox";
  visibilityInput.name = "visibility";
  visibilityInput.checked = Boolean(profile.visibility);
  visibilityInput.setAttribute("aria-describedby", "account-visibility-hint");
  visibilityField.append(visibilityInput, document.createTextNode("Make my account visible"));
  hint.id = "account-visibility-hint";
  hint.className = "account-visibility-hint";
  hint.setAttribute("role", "status");
  hint.hidden = true;
  publicationControls.className = "profile-publication-controls";
  publicationControls.append(visibilityField, hint);
  content.append(identity);

  const refresh = () => {
    const state = skills.getPublicationState();
    const missing = [...(getDisplayValue(getUsername()) ? [] : ["Username"]), ...state.missing];
    publicationControls.hidden = level < 4;
    section.hidden = level < 4 || !masterId;
    visibilityField.hidden = level < 4;
    const message = !state.ready ? "Loading your skills..." : missing.length
      ? `Choose a username and name all five skills before making your account visible. Missing: ${missing.join(", ")}.` : "";
    hint.textContent = message;
    hint.hidden = level < 4 || !message;
    // A visible account can always be made private, even if skills are incomplete.
    visibilityInput.disabled = !visibilityInput.checked && (!state.ready || missing.length > 0);
  };
  visibilityInput.addEventListener("change", refresh);
  const setMaster = async (id) => {
    section.hidden = level < 4 || !id;
    if (id === masterId) return;
    masterId = id;
    avatar.replaceChildren();
    name.textContent = id ? "Loading Master..." : "";
    if (!id) return;
    try {
      const master = await data.fetchProfileByUserId(client, id);
      if (masterId !== id) return;
      const username = getDisplayValue(master?.username) || getDisplayValue(master?.full_name) || "Master";
      name.textContent = username;
      avatar.textContent = username.slice(0, 1).toUpperCase();
      const avatarUrl = await data.getAvatarImageUrl(client, master).catch(() => "");
      if (masterId !== id || !avatarUrl) return;
      const image = document.createElement("img");
      image.src = avatarUrl;
      image.alt = "";
      avatar.replaceChildren(image);
    } catch {
      if (masterId === id) name.textContent = "Master unavailable";
    }
  };
  void setMaster(profile.master);
  return {
    section, content, refresh, setMaster, publicationControls,
    setAccessLevel: (value) => { level = value; refresh(); },
    getUpdates: () => {
      refresh();
      if (level < 4) return {};
      const state = skills.getPublicationState();
      if (visibilityInput.checked && (!state.ready || state.missing.length || !getDisplayValue(getUsername()))) return { error: hint.textContent };
      return { visibility: visibilityInput.checked };
    }
  };
};

const createMapsSection = ({ profile }) => {
  const { content, section } = createSection("Map", "is-maps");
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

const mountAccountPanel = () => {
  document.body.classList.add("has-account-panel");
  if (document.querySelector("[data-account-shell]")) return;

  const shell = document.createElement("aside");

  shell.className = "account-panel-shell is-account-panel-collapsed";
  shell.dataset.accountShell = "";
  shell.innerHTML = `
    <a class="account-hud-trigger donate-hud-trigger" href="https://buy.stripe.com/14A14o70HbZXdtr73FfQI01" target="_blank" rel="noopener noreferrer">Donate</a>
    <button class="account-hud-trigger" type="button" data-account-toggle aria-controls="account-panel" aria-expanded="false" aria-label="Open account">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path><path d="M4.5 20a7.5 7.5 0 0 1 15 0"></path></svg>
    </button>
    <section class="account-side-panel" id="account-panel" aria-labelledby="account-title" tabindex="-1">
      <div class="profile-settings-header"><p class="profile-kicker">jaycee.ai &gt; account</p><h1 id="account-title">Account</h1></div>
      <div class="profile-resonance-status" data-account-status aria-live="polite">Loading account...</div>
      <div class="jaycee-account-sections" data-account-sections></div>
      <div class="profile-settings-actions" data-account-actions hidden>
        <button class="account-panel-action" type="button" data-account-save>Save</button>
        <button class="account-panel-action" type="button" data-account-logout>Log out</button>
        <p data-account-save-status aria-live="polite"></p>
        <p class="account-help">Need help? <a href="mailto:jaubertcedric13@gmail.com">contact me</a>.</p>
      </div>
    </section>`;
  document.body.append(shell);
};

const createGuestLoginSection = () => {
  const { content, section } = createSection("Log in");
  const form = document.createElement("form");

  form.className = "profile-details-controls jaycee-account-form";
  form.innerHTML = `
    <label class="profile-field-wide"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
    <label class="profile-field-wide"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
    <button class="account-panel-action profile-field-wide" type="submit">Log in</button>
    <p class="profile-field-wide" role="status" data-panel-login-status></p>`;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector("button[type='submit']");
    const status = form.querySelector("[data-panel-login-status]");
    if (submit.disabled) return;
    submit.disabled = true;
    setStatus(status, "Logging in...");

    try {
      const { error } = await window.JayceeAuth.signIn(form.elements.email.value.trim(), form.elements.password.value);

      if (error) throw error;
      form.elements.password.value = "";
      window.location.assign(window.JayceeAuth.getAfterSignInUrl());
    } catch (error) {
      setStatus(status, error?.message || "Could not log in. Please try again.", true);
      submit.disabled = false;
    }
  });
  content.append(form);
  return section;
};

export const initJayceeAccountPage = async ({ auth = window.JayceeAuth, data = {}, expanded = false, collapsible = true, onSaved = () => {} } = {}) => {
  const api = {
    fetchProfileByUserId: (...args) => fetchProfileByUserId(...args),
    fetchPlayersForUser: (...args) => fetchPlayersForUser(...args),
    getAvatarImageUrl: (...args) => getAvatarImageUrl(...args),
    uploadAvatar: uploadProfileAvatar,
    saveProfile: async (client, id, updates) => {
      const { error } = await client.from(PROFILE_TABLE).update(updates).eq("id", id);
      if (error) throw error;
    },
    ...data
  };
  mountAccountPanel();
  const shell = document.querySelector("[data-account-shell]");
  const sections = document.querySelector("[data-account-sections]");
  const status = document.querySelector("[data-account-status]");
  const actions = document.querySelector("[data-account-actions]");
  const saveButton = document.querySelector("[data-account-save]");
  const logoutButton = document.querySelector("[data-account-logout]");
  const saveStatus = document.querySelector("[data-account-save-status]");
  const panel = document.querySelector("[data-account-shell] .account-side-panel");
  const toggleButton = document.querySelector("[data-account-toggle]");

  if (!shell || !sections || !saveButton) return;
  if (shell.dataset.accountInitialized) return;
  shell.dataset.accountInitialized = "true";
  shell.hidden = false;
  logoutButton.hidden = typeof auth?.signOut !== "function";
  panel.inert = true;
  sections.replaceChildren(createGuestLoginSection());

  const setPanelOpen = (isOpen) => {
    if (!collapsible) isOpen = true;
    shell.classList.toggle("is-account-panel-collapsed", !isOpen);
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    toggleButton.setAttribute("aria-label", isOpen ? "Close account" : "Open account");
    panel.inert = !isOpen;
    if (isOpen) {
      panel?.focus?.();
    } else {
      toggleButton.focus();
    }
  };
  toggleButton?.addEventListener("click", () => {
    setPanelOpen(shell.classList.contains("is-account-panel-collapsed"));
  });
  shell.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setPanelOpen(false);
  });
  if (expanded) setPanelOpen(true);

  logoutButton?.addEventListener("click", async () => {
    if (logoutButton.disabled || saveButton.disabled) return;

    logoutButton.disabled = true;
    saveButton.disabled = true;
    setStatus(saveStatus, "Logging out...");

    try {
      const { error } = await auth.signOut();

      if (error) throw error;

      window.location.replace("/");
    } catch (error) {
      console.error("Jaycee logout failed", error);
      setStatus(saveStatus, error?.message || "Could not log out. Please try again.", true);
      logoutButton.disabled = false;
      saveButton.disabled = false;
    }
  });

  try {
    const client = await auth.getSupabaseClient();
    const sessionResult = await auth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (!user) {
      setStatus(status, "");
      return;
    }

    sections.replaceChildren();
    const profile = await api.fetchProfileByUserId(client, user.id);

    if (!profile) {
      shell.hidden = false;
      saveButton.hidden = true;
      actions.hidden = false;
      setStatus(status, "Profile not found.", true);
      return;
    }

    let avatarUrl = "";

    try {
      avatarUrl = await api.getAvatarImageUrl(client, profile);
    } catch (error) {
      console.warn("Account avatar could not be loaded", error);
    }

    const character = createCharacterSection({ avatarUrl, profile });
    const maps = createMapsSection({ profile });
    let master;
    const skills = createSkillsSection({ client, profile, createSection, data: api, onChange: () => master?.refresh() });
    master = createMasterSection({ client, profile, skills, data: api, getUsername: () => character.getUpdates().username });
    character.section.querySelector('[name="username"]').addEventListener("input", () => master.refresh());
    const referral = createReferralControls(profile, api.createReferralLink);
    master.content.append(master.publicationControls, referral.section);
    const playerLevels = new Map();
    const updateMapAccess = (player) => {
      if (player?.id) playerLevels.set(player.id, Number(player.level) || 0);
      const highestLevel = Math.max(profile.permanent_account_at ? 4 : 0, ...playerLevels.values());
      const unlocked = highestLevel >= 2;
      maps.section.hidden = !unlocked;
      maps.section.inert = !unlocked;
      skills.setUnlocked(highestLevel >= 3, highestLevel);
      master.setAccessLevel(highestLevel);
    };
    updateMapAccess(null);
    window.addEventListener("jaycee:player-updated", (event) => {
      const player = event.detail?.player;
      if (player?.user_id === profile.id) {
        updateMapAccess(player);
        void master.setMaster(player.master);
      }
    });
    try {
      const players = await api.fetchPlayersForUser(client, profile);
      players.forEach((player) => {
        if (!playerLevels.has(player.id)) playerLevels.set(player.id, Number(player.level) || 0);
      });
      updateMapAccess(null);
    } catch (error) {
      console.warn("Account Map access could not be loaded", error);
    }

    sections.replaceChildren(character.section, maps.section, skills.section, master.section);
    shell.hidden = false;
    actions.hidden = false;
    setStatus(status, "");

    saveButton.addEventListener("click", async () => {
      const mapsResult = maps.section.hidden ? { updates: {} } : maps.getUpdates();

      if (mapsResult.error) {
        setStatus(saveStatus, mapsResult.error, true);
        return;
      }
      const masterResult = master.getUpdates();
      if (masterResult.error) {
        setStatus(saveStatus, masterResult.error, true);
        return;
      }
      const skillsResult = skills.getUpdates();
      if (skillsResult.error) {
        setStatus(saveStatus, skillsResult.error, true);
        return;
      }

      saveButton.disabled = true;
      skills.setSaving(true);
      setStatus(saveStatus, "Saving...");

      try {
        const characterUpdates = character.getUpdates();
        const profileUpdates = {
          full_name: characterUpdates.full_name,
          username: characterUpdates.username,
          ...skillsResult.updates,
          ...(masterResult.visibility === undefined ? {} : { visibility: masterResult.visibility }),
          ...mapsResult.updates
        };

        if (characterUpdates.avatarFile) {
          setStatus(saveStatus, "Uploading photo...");
          profileUpdates.avatar_path = await api.uploadAvatar({
            client,
            file: characterUpdates.avatarFile,
            profile
          });
          setStatus(saveStatus, "Saving...");
        }

        // Persist newly named skills before the server validates publication.
        if (profileUpdates.visibility === true) await skills.save(skillsResult.skills);
        await api.saveProfile(client, profile.id, profileUpdates);

        Object.assign(profile, profileUpdates);
        referral.refresh();
        if (profileUpdates.visibility !== true) await skills.save(skillsResult.skills);
        setStatus(saveStatus, "Saved.");
        window.dispatchEvent(new CustomEvent("jaycee:account-updated", {
          detail: {
            profile: { ...profile }
          }
        }));
        void Promise.resolve(onSaved({ profile: { ...profile } })).catch(console.warn);
      } catch (error) {
        console.error("Jaycee account save failed", error);
        const message = error?.code === "23505" && /profiles_username_ci_unique/.test(error.message || "")
          ? "That username is already in use."
          : error?.message || "Account could not be saved.";
        setStatus(saveStatus, message, true);
      } finally {
        saveButton.disabled = false;
        skills.setSaving(false);
      }
    });
  } catch (error) {
    console.error("Jaycee account load failed", error);
    shell.hidden = false;
    setStatus(status, error?.message || "Account could not be loaded.", true);
  }
};

