const BIRTH_PROFILE_KEY = "birthProfile";

export const saveBirthProfile = (profile) => {
  localStorage.setItem(BIRTH_PROFILE_KEY, JSON.stringify(profile));
};

export const loadBirthProfile = () => {
  const savedProfile = localStorage.getItem(BIRTH_PROFILE_KEY);

  return savedProfile ? JSON.parse(savedProfile) : null;
};
