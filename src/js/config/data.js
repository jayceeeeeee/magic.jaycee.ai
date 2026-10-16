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
  "years_burned",
  "birth_time",
  "master",
  "manna_target",
  "manna_unit",
  "manna_cycle",
  "role",
  "sex",
  "visibility",
  "permanent_account_at",
  "master_selection_started_at",
  "referrer_id",
  "locked"
].join(", ");
const GAME_SELECT_COLUMNS = ["id", "user_id", ...JAYCEE_GAME_SKILL_COLUMNS].join(", ");
const SIGNED_IMAGE_URL_DURATION_SECONDS = 60 * 60;
const PLAYER_SELECT_COLUMNS = "id, user_id, master, level, level_2_accepted_at, level_3_accepted_at, skill_1_practice, skill_2_practice, skill_3_practice, skill_1_start, skill_2_start, skill_3_start";

export const getDisplayValue = (value) => (
  value === null || value === undefined ? "" : String(value).trim()
);

const fetchProfile = async (client, column, value) => {
  const query = (columns) => client
    .from(PROFILE_TABLE)
    .select(columns)
    .eq(column, value)
    .maybeSingle();
  let { data, error } = await query(PROFILE_SELECT_COLUMNS);
  // Keep the current site working until the prepared referral migration is deployed.
  if (error && ["42703", "PGRST204"].includes(error.code) && /referrer_id/.test(error.message || "")) {
    ({ data, error } = await query(PROFILE_SELECT_COLUMNS.split(", ").filter((name) => name !== "referrer_id").join(", ")));
  }
  if (error) throw error;
  return data || null;
};

export const fetchProfileByUserId = (client, userId) => fetchProfile(client, "id", userId);
export const fetchProfileByUsername = (client, username) => fetchProfile(client, "username", username);

export const fetchPublicProfiles = async (client, limit = 100, { referrerId = null, referralUsername = "" } = {}) => {
  const { data, error } = await client.rpc("list_public_masters", { p_limit: limit });
  if (error) throw error;
  const profiles = data || [];
  if (!referrerId && !referralUsername) return profiles;
  const { data: referrers, error: referralError } = await client.rpc("get_public_referrer", {
    p_referrer_id: referrerId, p_username: referralUsername || null
  });
  if (referralError) {
    if (!["PGRST202", "42883"].includes(referralError.code)) console.warn("Public referrer could not be loaded", referralError);
    return profiles;
  }
  const referrer = referrers?.[0];
  return referrer && !profiles.some((profile) => profile.id === referrer.id) ? [...profiles, referrer] : profiles;
};

export const fetchAdminProfile = async (client) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username, full_name, avatar_path, role")
    .eq("role", "admin")
    .limit(1);

  if (error) throw error;

  return (data || [])[0] || null;
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
  if (session.practiceValue === undefined) {
    const player = await fetchPlayerById(client, session.playerId);
    if (!player || player.user_id !== profile.id) throw new Error("Player not found.");
    session.practiceValue = (Number(player[`skill_${session.skillNumber}_practice`]) || 0) + session.totalSeconds;
  }
  return syncSkillProgress(client, session.playerId, session);
};

export const syncSkillProgress = async (client, playerId, session = null) => {
  const { data, error } = await client.rpc("sync_skill_progress", {
    p_player_id: playerId,
    p_skill_number: session?.skillNumber || null,
    p_practice_seconds: session?.practiceValue ?? null,
    p_started_at: session?.questStart || null
  });
  if (error) throw error;
  if (data?.account_locked) {
    await window.JayceeAuth?.signOutLockedAccount();
    throw new Error("This account is locked because its quest expired.");
  }
  if (!data?.player?.id) throw new Error("Practice could not be saved.");
  return data;
};

export const acceptQuest = async (client, playerId, level) => {
  const { data, error } = await client.rpc("accept_player_quest", { p_player_id: playerId, p_level: level });
  if (error) throw error;
  if (!data?.player?.id) throw new Error("The quest could not be started. Please try again.");
  return data;
};

export const switchMaster = async (client, masterId) => {
  const { data, error } = await client.rpc("switch_player_master", { p_master_id: masterId });
  if (error) throw error;
  if (!data?.id) throw new Error("The Master link could not be saved.");
  return data;
};

export const saveOwnGame = async (client, skills) => {
  const { data, error } = await client.rpc("save_own_game", { p_skills: skills });
  if (error) throw error;
  return data;
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
