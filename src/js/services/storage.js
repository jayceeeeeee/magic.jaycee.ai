const BIRTH_PROFILE_KEY = "birthProfile";
const BIRTH_DRAFT_KEY = "birthDraft";
const APP_STATE_KEY = "appState";

const getBirthProfileKey = (accountId = "") =>
  accountId ? `${BIRTH_PROFILE_KEY}:${accountId}` : BIRTH_PROFILE_KEY;

export const saveBirthProfile = (profile, accountId = "") => {
  localStorage.setItem(getBirthProfileKey(accountId), JSON.stringify(profile));
};

export const loadBirthProfile = (accountId = "") => {
  const savedProfile = localStorage.getItem(getBirthProfileKey(accountId));

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
