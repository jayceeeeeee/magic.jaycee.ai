export const JAYCEE_FRACTALS_TABLE = "jaycee_fractals";
export const JAYCEE_DYNAMIC_FRACTALS_TABLE = "jaycee_dynamic_fractals";
export const JAYCEE_DYNAMIC_FRACTAL_ELEMENTS_TABLE = "jaycee_dynamic_fractal_elements";
export const FRACTAL_VISIBILITY_COLUMN = "visibility";
export const PUBLIC_VISIBILITY_VALUE = "public";
export const SPACE_DIMENSION_VALUE = "space";
export const TIME_DIMENSION_VALUE = "time";
export const PROFILE_TABLE = "profiles";
export const USER_IMAGES_BUCKET = "users";
export const CODE_COLUMNS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
export const DEFAULT_SELECTED_NUMBER = 5;
export const DEFAULT_SUN_TIME_NUMBER = 9;
export const JAYCEE_RESONANCE_SOURCE = "Jaycee Core";

const FRACTAL_PARAMETER_COLUMNS = "start_at, length";
const PROFILE_SELECT_COLUMNS = [
  "id",
  "username",
  "avatar_path",
  "background_path",
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

export const getFractalKey = (row) => `${row.sourceType || "source"}:${row.id || row.sourceId || row.label || "fractal"}`;

export const getDynamicRingKey = (ring) => getFractalKey({
  id: ring.sourceId || ring.id,
  label: ring.label,
  sourceId: ring.sourceId,
  sourceType: ring.sourceType
});

export const getDynamicSquareKey = (square) => getFractalKey({
  id: square.sourceId || square.id,
  label: square.label,
  sourceId: square.sourceId,
  sourceType: square.sourceType
});

export const getDisplayValue = (value) => (
  value === null || value === undefined ? "" : String(value).trim()
);

export const parseBrowserGregorianDate = (value) => {
  const text = getDisplayValue(value);
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?/
  );

  if (match) {
    const [, year, month, day, hours = "0", minutes = "0", seconds = "0", milliseconds = "0"] = match;

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
      Number(milliseconds.padEnd(3, "0"))
    ).getTime();
  }

  return Date.parse(text);
};

export const hasTimeCycle = (fractal) => {
  const startAt = parseBrowserGregorianDate(fractal?.start_at);
  const length = Number(fractal?.length);

  return Number.isFinite(startAt) && Number.isFinite(length) && length > 0;
};

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

export const fetchJayceeResonances = async (client) => {
  const { data, error } = await client
    .from(JAYCEE_FRACTALS_TABLE)
    .select(`id, label, user_id, dimension, image, ${FRACTAL_PARAMETER_COLUMNS}, ${CODE_COLUMNS.map((column) => `"${column}"`).join(", ")}`)
    .is("user_id", null)
    .eq(FRACTAL_VISIBILITY_COLUMN, PUBLIC_VISIBILITY_VALUE)
    .order("label", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    sourceName: JAYCEE_RESONANCE_SOURCE,
    sourceType: "jaycee"
  }));
};

export const fetchUserResonances = async (client, profile, { publicOnly = false } = {}) => {
  let query = client
    .from(JAYCEE_FRACTALS_TABLE)
    .select(`id, label, user_id, dimension, image, ${FRACTAL_PARAMETER_COLUMNS}, ${CODE_COLUMNS.map((column) => `"${column}"`).join(", ")}`)
    .eq("user_id", profile.id);

  if (publicOnly) {
    query = query.eq(FRACTAL_VISIBILITY_COLUMN, PUBLIC_VISIBILITY_VALUE);
  }

  const { data, error } = await query.order("label", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    sourceName: profile.username || "User",
    sourceType: "user"
  }));
};

export const fetchDynamicTimeRings = async (client, profile) => {
  let query = client
    .from(JAYCEE_DYNAMIC_FRACTALS_TABLE)
    .select(`id, label, description, dimension, user_id, image, created_at, ${FRACTAL_PARAMETER_COLUMNS}`)
    .eq("dimension", TIME_DIMENSION_VALUE)
    .order("created_at", { ascending: true });

  if (profile?.id) {
    query = query.or(`user_id.is.null,user_id.eq.${profile.id}`);
  } else {
    query = query.is("user_id", null);
  }

  const { data: fractals, error: fractalsError } = await query;

  if (fractalsError) throw fractalsError;
  if (!fractals?.length) return [];

  const { data: elements, error: elementsError } = await client
    .from(JAYCEE_DYNAMIC_FRACTAL_ELEMENTS_TABLE)
    .select("id, fractal_id, position, value, description, created_at")
    .in("fractal_id", fractals.map((fractal) => fractal.id))
    .order("position", { ascending: true });

  if (elementsError) throw elementsError;

  return fractals
    .map((fractal) => {
      const ringElements = (elements || [])
        .filter((element) => element.fractal_id === fractal.id)
        .sort((first, second) => Number(first.position) - Number(second.position));
      const positions = ringElements
        .map((element) => Number(element.position))
        .filter((position) => Number.isFinite(position) && position > 0);
      const hasValidSegmentCount = positions.length === 9;

      if (!positions.length) return null;

      return {
        ...fractal,
        elements: ringElements,
        id: `dynamic-${fractal.id}`,
        sourceName: fractal.user_id ? (profile?.username || "User") : JAYCEE_RESONANCE_SOURCE,
        sourceType: fractal.user_id ? "user" : "jaycee",
        sourceId: fractal.id,
        invalidReason: hasValidSegmentCount
          ? ""
          : `${fractal.label || "Dynamic portal"} must have exactly 9 positions.`,
        segmentKeys: positions.map(String),
        defaultSegment: String(positions[0])
      };
    })
    .filter(Boolean);
};

export const fetchDynamicSpaceSquares = async (client, profile) => {
  let query = client
    .from(JAYCEE_DYNAMIC_FRACTALS_TABLE)
    .select(`id, label, description, dimension, user_id, image, created_at, ${FRACTAL_PARAMETER_COLUMNS}`)
    .eq("dimension", SPACE_DIMENSION_VALUE)
    .order("created_at", { ascending: true });

  if (profile?.id) {
    query = query.or(`user_id.is.null,user_id.eq.${profile.id}`);
  } else {
    query = query.is("user_id", null);
  }

  const { data: fractals, error: fractalsError } = await query;

  if (fractalsError) throw fractalsError;
  if (!fractals?.length) return [];

  const { data: elements, error: elementsError } = await client
    .from(JAYCEE_DYNAMIC_FRACTAL_ELEMENTS_TABLE)
    .select("id, fractal_id, position, value, description, created_at")
    .in("fractal_id", fractals.map((fractal) => fractal.id))
    .order("position", { ascending: true });

  if (elementsError) throw elementsError;

  return fractals
    .map((fractal) => {
      const squareElements = (elements || [])
        .filter((element) => element.fractal_id === fractal.id)
        .sort((first, second) => Number(first.position) - Number(second.position));
      const gridSize = Math.sqrt(squareElements.length);
      const isValidGrid = squareElements.length === 9 && Number.isInteger(gridSize);

      return {
        ...fractal,
        elements: squareElements,
        id: `dynamic-${fractal.id}`,
        invalidReason: isValidGrid
          ? ""
          : `${fractal.label || "Dynamic map"} must have exactly 9 positions.`,
        gridSize: isValidGrid ? gridSize : 0,
        sourceName: fractal.user_id ? (profile?.username || "User") : JAYCEE_RESONANCE_SOURCE,
        sourceType: fractal.user_id ? "user" : "jaycee",
        sourceId: fractal.id
      };
    });
};

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

export const fetchPublicProfiles = async (client, limit = 10) => {
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

export const getAvatarImageUrl = async (client, profile) => (
  getUserImageUrl(client, profile, profile?.avatar_path)
);

export const getBackgroundImageUrl = async (client, profile) => (
  getUserImageUrl(client, profile, profile?.background_path)
);

export const getFractalImageUrl = async (client, fractal) => {
  const image = getDisplayValue(fractal?.image);

  if (!fractal?.user_id || !image) return "";

  return getUserImageUrl(client, { id: fractal.user_id }, image);
};

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
