const BIRTH_PROFILE_KEY = "birthProfile";
const BIRTH_DRAFT_KEY = "birthDraft";
const APP_STATE_KEY = "appState";

export const saveBirthProfile = (profile) => {
  localStorage.setItem(BIRTH_PROFILE_KEY, JSON.stringify(profile));
};

export const loadBirthProfile = () => {
  const savedProfile = localStorage.getItem(BIRTH_PROFILE_KEY);

  return savedProfile ? JSON.parse(savedProfile) : null;
};

export const saveBirthDraft = (draft) => {
  localStorage.setItem(BIRTH_DRAFT_KEY, JSON.stringify(draft));
};

export const loadBirthDraft = () => {
  const savedDraft = localStorage.getItem(BIRTH_DRAFT_KEY);

  return savedDraft ? JSON.parse(savedDraft) : null;
};

export const saveAppState = (state) => {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
};

export const loadAppState = () => {
  const savedState = localStorage.getItem(APP_STATE_KEY);

  return savedState ? JSON.parse(savedState) : null;
};
