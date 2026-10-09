export const JAYCEE_DYNAMIC_FRACTALS_TABLE = "jaycee_dynamic_fractals";
export const JAYCEE_DYNAMIC_FRACTAL_ELEMENTS_TABLE = "jaycee_dynamic_fractal_elements";
export const JAYCEE_GAME_TABLE = "jaycee_game";
export const JAYCEE_SKILLS_TABLE = "jaycee_skills";
export const PROFILE_TABLE = "profiles";
export const USER_IMAGES_BUCKET = "users";
export const DEFAULT_SELECTED_NUMBER = 5;

const PROFILE_SELECT_COLUMNS = [
  "id",
  "username",
  "avatar_path",
  "theme",
  "primary_color",
  "secondary_color",
  "full_name",
  "birth_date",
  "birth_time",
  "birth_place",
  "birth_place_position",
  "birth_timezone",
  "sex"
].join(", ");
const SIGNED_IMAGE_URL_DURATION_SECONDS = 60 * 60;

export const getDisplayValue = (value) => (
  value === null || value === undefined ? "" : String(value).trim()
);

export const isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(getDisplayValue(value));

export const getProfileThemeValue = (profile) => (
  window.JayceeThemes?.normalizeTheme?.(getDisplayValue(profile?.theme)) || "aurora"
);

export const getProfileColorValue = (value) => (
  isHexColor(value) ? getDisplayValue(value) : ""
);

export const getThemeSettingsFromProfile = (profile) => ({
  primary_color: getProfileColorValue(profile?.primary_color),
  secondary_color: getProfileColorValue(profile?.secondary_color),
  theme: getProfileThemeValue(profile)
});

export const fetchProfileByUserId = async (client, userId) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select(PROFILE_SELECT_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const fetchProfileByUsername = async (client, username) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select(PROFILE_SELECT_COLUMNS)
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const fetchPublicProfiles = async (client, limit = 100) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username")
    .not("username", "is", null)
    .order("username", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data || []).filter((profile) => getDisplayValue(profile.username));
};

const getStoragePathFromImage = (image, bucketName) => {
  if (/^https?:\/\//i.test(image)) {
    const url = new URL(image);
    const bucketPrefix = `/storage/v1/object/public/${bucketName}/`;
    const prefixIndex = url.pathname.indexOf(bucketPrefix);

    if (prefixIndex === -1) return "";

    return url.pathname.slice(prefixIndex + bucketPrefix.length);
  }

  return image.replace(new RegExp(`^${bucketName}/`), "");
};

const getUserImageUrl = async (client, profile, path) => {
  const image = getDisplayValue(path);

  if (!profile?.id || !image) return "";

  const rawStoragePath = getStoragePathFromImage(image, USER_IMAGES_BUCKET)
    .replace(/^\/+/, "")
    .replace(/\+/g, " ");
  const storagePath = rawStoragePath.includes("/")
    ? rawStoragePath
    : `${profile.id}/${rawStoragePath}`;

  if (!storagePath) return "";

  const { data, error } = await client.storage
    .from(USER_IMAGES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_IMAGE_URL_DURATION_SECONDS);

  if (error) throw error;

  return data?.signedUrl || "";
};

export const fetchUserDynamicFractals = async (client, profile) => {
  if (!profile?.id) return [];

  const { data, error } = await client
    .from(JAYCEE_DYNAMIC_FRACTALS_TABLE)
    .select("id, label, user_id, image, created_at, skill, time")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data || [];
};

export const fetchDynamicFractalElements = async (client, fractalIds) => {
  const ids = [...new Set((fractalIds || []).map(getDisplayValue).filter(Boolean))];

  if (!ids.length) return [];

  const { data, error } = await client
    .from(JAYCEE_DYNAMIC_FRACTAL_ELEMENTS_TABLE)
    .select("*")
    .in("fractal_id", ids)
    .order("position", { ascending: true });

  if (error) throw error;

  return data || [];
};

export const fetchUserGameSettings = async (client, profile) => {
  if (!profile?.id) return null;

  const { data, error } = await client
    .from(JAYCEE_GAME_TABLE)
    .select("id, user_id, primary_fractal, primary_time, primary_distance, ultimate_fractal, ultimate_link, created_at")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const upsertUserGameSettings = async (client, profile, values) => {
  if (!profile?.id) return null;

  const { data, error } = await client
    .from(JAYCEE_GAME_TABLE)
    .upsert({
      ...values,
      user_id: profile.id
    }, { onConflict: "user_id" })
    .select("id, user_id, primary_fractal, primary_time, primary_distance, ultimate_fractal, ultimate_link, created_at")
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const fetchSkillsByIds = async (client, skillIds) => {
  const ids = [...new Set((skillIds || []).map(getDisplayValue).filter(Boolean))];

  if (!ids.length) return [];

  const { data, error } = await client
    .from(JAYCEE_SKILLS_TABLE)
    .select("id, label, parent, ratio, created_at")
    .in("id", ids)
    .order("label", { ascending: true });

  if (error) throw error;

  return data || [];
};

export const updateSkills = async (client, skillUpdates) => {
  const updates = (skillUpdates || []).filter((skill) => skill?.id);

  if (!updates.length) return [];

  const updatedRows = await Promise.all(updates.map(async ({ id, ...values }) => {
    const { data, error } = await client
      .from(JAYCEE_SKILLS_TABLE)
      .update(values)
      .eq("id", id)
      .select("id, label, parent, ratio, created_at")
      .maybeSingle();

    if (error) throw error;

    return data;
  }));

  return updatedRows.filter(Boolean);
};

export const updateUserDynamicFractals = async (client, fractalUpdates) => {
  const updates = (fractalUpdates || []).filter((fractal) => fractal?.id);

  if (!updates.length) return [];

  const updatedRows = await Promise.all(updates.map(async ({ id, ...values }) => {
    const { data, error } = await client
      .from(JAYCEE_DYNAMIC_FRACTALS_TABLE)
      .update(values)
      .eq("id", id)
      .select("id, label, user_id, image, created_at, skill, time")
      .maybeSingle();

    if (error) throw error;

    return data;
  }));

  return updatedRows.filter(Boolean);
};

export const getAvatarImageUrl = async (client, profile) => (
  getUserImageUrl(client, profile, profile?.avatar_path)
);

const loadImage = (imageUrl) => (
  new Promise((resolve, reject) => {
    if (!imageUrl) {
      resolve(null);
      return;
    }

    const image = new Image();

    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Jaycee image could not be loaded.")), { once: true });
    image.src = imageUrl;
  })
);

export const loadOptionalImage = async (imageUrl) => {
  try {
    return await loadImage(imageUrl);
  } catch (error) {
    console.warn("Optional Jaycee image could not be loaded", error);
    return null;
  }
};
