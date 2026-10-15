import { JAYCEE_GAME_SKILL_COLUMNS } from "./game-config.js";

export const JAYCEE_GAME_TABLE = "game";
export const JAYCEE_PLAYER_TABLE = "player";
export const JAYCEE_SKILLS_TABLE = "skills";
export const PROFILE_TABLE = "profiles";
export const USER_IMAGES_BUCKET = "users";

const PROFILE_SELECT_COLUMNS = [
  "id",
  "username",
  "avatar_path",
  "full_name",
  "birth_date",
  "birth_time",
  "master",
  "manna_target",
  "manna_unit",
  "manna_cycle",
  "role",
  "sex"
].join(", ");
const GAME_SELECT_COLUMNS = ["id", "user_id", ...JAYCEE_GAME_SKILL_COLUMNS].join(", ");
const SIGNED_IMAGE_URL_DURATION_SECONDS = 60 * 60;
const PLAYER_SELECT_COLUMNS = "id, user_id, master, level, skill_1_practice, skill_2_practice, skill_3_practice, skill_1_start, skill_2_start, skill_3_start";

export const getDisplayValue = (value) => (
  value === null || value === undefined ? "" : String(value).trim()
);

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
    .select("id, username, full_name, avatar_path, role")
    .not("username", "is", null)
    .eq("visibility", true)
    .order("username", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return (data || []).filter((profile) => getDisplayValue(profile.username));
};

export const fetchAdminProfile = async (client) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username, full_name, avatar_path, role")
    .eq("role", "admin")
    .not("username", "is", null)
    .limit(1);

  if (error) throw error;

  return (data || []).find((profile) => getDisplayValue(profile.username)) || null;
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

export const fetchUserGameSettings = async (client, profile) => {
  if (!profile?.id) return null;

  const { data, error } = await client
    .from(JAYCEE_GAME_TABLE)
    .select(GAME_SELECT_COLUMNS)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const updateUserGameSettings = async (client, profile, values) => {
  if (!profile?.id) return null;

  const { data, error } = await client
    .from(JAYCEE_GAME_TABLE)
    .update(values)
    .eq("user_id", profile.id)
    .select(GAME_SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const fetchPlayersForUser = async (client, userProfile) => {
  if (!userProfile?.id) return [];

  const { data, error } = await client
    .from(JAYCEE_PLAYER_TABLE)
    .select(PLAYER_SELECT_COLUMNS)
    .eq("user_id", userProfile.id);

  if (error) throw error;

  return data || [];
};

export const fetchPlayerById = async (client, playerId) => {
  if (!playerId) return null;

  const { data, error } = await client
    .from(JAYCEE_PLAYER_TABLE)
    .select(PLAYER_SELECT_COLUMNS)
    .eq("id", playerId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const fetchPlayerForGame = async (client, userProfile, masterProfile) => {
  if (!userProfile?.id || !masterProfile?.id) return null;

  const { data, error } = await client
    .from(JAYCEE_PLAYER_TABLE)
    .select(PLAYER_SELECT_COLUMNS)
    .eq("user_id", userProfile.id)
    .eq("master", masterProfile.id)
    .limit(1);

  if (error) throw error;

  return data?.[0] || null;
};

export const createPlayerForGame = async (client, userProfile, masterProfile, values = {}) => {
  if (!userProfile?.id || !masterProfile?.id) return null;

  const { data, error } = await client
    .from(JAYCEE_PLAYER_TABLE)
    .insert({
      master: masterProfile.id,
      level: 1,
      skill_1_practice: 0,
      skill_2_practice: 0,
      skill_3_practice: 0,
      skill_1_start: new Date().toISOString(),
      ...values,
      user_id: userProfile.id
    })
    .select(PLAYER_SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const updateProfileMaster = async (client, profile, masterId) => {
  if (!profile?.id) return null;

  const { data, error } = await client
    .from(PROFILE_TABLE)
    .update({ master: masterId || null })
    .eq("id", profile.id)
    .select(PROFILE_SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

export const startPlayerFirstQuest = async (client, userProfile, player) => {
  if (!userProfile?.id || !player?.id || player.skill_1_start || Number(player.level) !== 1) return player;

  const { data, error } = await client
    .from(JAYCEE_PLAYER_TABLE)
    .update({ skill_1_start: new Date().toISOString() })
    .eq("id", player.id)
    .eq("user_id", userProfile.id)
    .eq("level", 1)
    .is("skill_1_start", null)
    .select(PLAYER_SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw error;

  // Another request may already have started this quest.
  return data || await fetchPlayerById(client, player.id);
};

export const fetchSkillsByIds = async (client, skillIds) => {
  const ids = [...new Set((skillIds || []).map(getDisplayValue).filter(Boolean))];

  if (!ids.length) return [];

  const { data, error } = await client
    .from(JAYCEE_SKILLS_TABLE)
    .select("id, label, description")
    .in("id", ids)
    .order("label", { ascending: true });

  if (error) throw error;

  return data || [];
};

export const recordSkillPractice = async (client, profile, session) => {
  if (!profile?.id || ![1, 2, 3].includes(session.skillNumber)
    || !Number.isFinite(session.totalSeconds) || session.totalSeconds <= 0) {
    throw new Error("Invalid practice duration.");
  }
  const column = `skill_${session.skillNumber}_practice`;
  if (session.practiceValue === undefined) {
    const player = await fetchPlayerById(client, session.playerId);
    if (!player || player.user_id !== profile.id) throw new Error("Player not found.");
    session.practiceValue = (Number(player[column]) || 0) + session.totalSeconds;
  }
  const { data, error } = await client
    .from(JAYCEE_PLAYER_TABLE)
    .update({ [column]: session.practiceValue })
    .eq("id", session.playerId)
    .eq("user_id", profile.id)
    .select(PLAYER_SELECT_COLUMNS)
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Practice could not be saved.");
  return data;
};

export const updateSkills = async (client, skillUpdates) => {
  const updates = (skillUpdates || []).filter((skill) => skill?.id);

  if (!updates.length) return [];

  const updatedRows = await Promise.all(updates.map(async ({ id, ...values }) => {
    const { data, error } = await client
      .from(JAYCEE_SKILLS_TABLE)
      .update(values)
      .eq("id", id)
      .select("id, label, description")
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
