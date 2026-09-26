import {
  MAIN_CORE_RING_LANGUAGE,
  MAIN_CORE_SQUARE_LANGUAGE,
  loadJayceeLanguage
} from "./jaycee-language.js";

const JAYCEE_ORDER = [1, 2, 4, 3, 5, 7, 6, 8, 9];
const JAYCEE_FRACTALS_TABLE = "jaycee_fractals";
const PROFILE_TABLE = "profiles";
const AVATAR_BUCKET = "avatars";
const CODE_COLUMNS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DEFAULT_SELECTED_NUMBER = 5;
const SIGNED_IMAGE_URL_DURATION_SECONDS = 60 * 60;

const getEmptyLabels = () => Array.from({ length: JAYCEE_ORDER.length }, () => "");

const getDisplayValue = (value) => (
  value === null || value === undefined ? "" : String(value).trim()
);
const getLoginUrl = () => (
  new URL(
    window.JayceeAuth?.getLoginUrl
      ? window.JayceeAuth.getLoginUrl()
      : "/src/html/auth/login.html",
    window.location.origin
  )
);

const redirectToLogin = () => {
  const loginUrl = getLoginUrl();

  loginUrl.searchParams.set("redirect", window.location.pathname);
  window.location.href = loginUrl.href;
};

const setText = (element, value) => {
  if (element) element.textContent = value;
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

const createResonanceItem = (row, selectedNumber) => {
  const item = document.createElement("article");
  const label = document.createElement("div");
  const value = document.createElement("div");

  item.className = "profile-resonance-item";
  label.className = "profile-resonance-label";
  value.className = "profile-resonance-value";
  label.textContent = row.label || "Resonance";
  value.textContent = getDisplayValue(row[String(selectedNumber)]);
  item.append(label, value);

  return item;
};

const fetchUserResonances = async (client, userId) => {
  const { data, error } = await client
    .from(JAYCEE_FRACTALS_TABLE)
    .select(`label, user_id, ${CODE_COLUMNS.map((column) => `"${column}"`).join(", ")}`)
    .eq("user_id", userId)
    .order("label", { ascending: true });

  if (error) throw error;

  return data || [];
};

const fetchProfileByUserId = async (client, userId) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username, avatar_path")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

const fetchProfileByUsername = async (client, username) => {
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id, username, avatar_path")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;

  return data || null;
};

const getAvatarImageUrl = async (client, profile) => {
  const image = getDisplayValue(profile?.avatar_path);

  if (!profile?.id || !image) return "";

  const rawStoragePath = getStoragePathFromImage(image, AVATAR_BUCKET)
    .replace(/^\/+/, "")
    .replace(/\+/g, " ");
  const storagePath = rawStoragePath.includes("/")
    ? rawStoragePath
    : `${profile.id}/${rawStoragePath}`;

  if (!storagePath) return "";

  const { data, error } = await client.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(storagePath, SIGNED_IMAGE_URL_DURATION_SECONDS);

  if (error) throw error;

  return data?.signedUrl || "";
};

const applySquareImage = (square, imageUrl) => {
  if (!imageUrl) return;

  square.style.setProperty("--profile-square-image", `url("${imageUrl}")`);
  square.classList.add("has-square-image");
};

const getResonancesForNumber = (rows, selectedNumber) => (
  rows.filter((row) => getDisplayValue(row[String(selectedNumber)]))
);

const initJayceeProfile = async () => {
  const shell = document.querySelector("[data-profile-shell]");
  const square = document.querySelector("[data-profile-square]");
  const status = document.querySelector("[data-profile-status]");
  const list = document.querySelector("[data-profile-resonances]");
  const selectedNumberEl = document.querySelector("[data-selected-number]");
  const selectedLabelEl = document.querySelector("[data-selected-label]");
  const publicUsername = getDisplayValue(shell?.dataset.profileUsername);

  if (!shell || !square || !status || !list) return;

  let coreSquareLabels = getEmptyLabels();
  let rows = [];
  let selectedNumber = DEFAULT_SELECTED_NUMBER;

  const renderResonances = () => {
    const selectedIndex = JAYCEE_ORDER.indexOf(selectedNumber);
    const selectedLabel = coreSquareLabels[selectedIndex] || "";
    const resonances = getResonancesForNumber(rows, selectedNumber);

    setText(selectedNumberEl, selectedNumber);
    setText(selectedLabelEl, selectedLabel);
    list.replaceChildren(...resonances.map((row) => createResonanceItem(row, selectedNumber)));

    if (resonances.length) {
      status.textContent = `${resonances.length} resonance${resonances.length === 1 ? "" : "s"} for square ${selectedNumber}.`;
    } else {
      status.textContent = `No resonances yet for square ${selectedNumber}.`;
    }
  };

  const renderSquare = () => {
    square.replaceChildren(...JAYCEE_ORDER.map((number, index) => {
      const button = document.createElement("button");
      const label = coreSquareLabels[index] || number;

      button.className = "profile-square-cell";
      button.type = "button";
      button.dataset.squareNumber = String(number);
      button.textContent = label;
      button.setAttribute("aria-label", `Square ${number}`);
      button.addEventListener("click", () => {
        selectedNumber = number;
        square.querySelector(".is-selected")?.classList.remove("is-selected");
        button.classList.add("is-selected");
        renderResonances();
      });

      if (number === selectedNumber) {
        button.classList.add("is-selected");
      }

      return button;
    }));
  };

  try {
    const client = await window.JayceeAuth.getSupabaseClient();
    const sessionResult = await window.JayceeAuth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (!publicUsername && !user) {
      redirectToLogin();
      return;
    }

    const profile = publicUsername
      ? await fetchProfileByUsername(client, publicUsername)
      : await fetchProfileByUserId(client, user.id);

    if (!profile) {
      shell.hidden = false;
      status.textContent = "Profile not found.";
      return;
    }

    shell.hidden = false;
    const language = await loadJayceeLanguage({
      coreRingLanguage: MAIN_CORE_RING_LANGUAGE,
      coreSquareLanguage: MAIN_CORE_SQUARE_LANGUAGE,
      jayceeOrder: JAYCEE_ORDER
    });

    coreSquareLabels = language.coreSquareLabels || getEmptyLabels();
    rows = await fetchUserResonances(client, profile.id);
    applySquareImage(square, await getAvatarImageUrl(client, profile));
    renderSquare();
    renderResonances();
  } catch (error) {
    console.error("Jaycee profile load failed", error);
    shell.hidden = false;
    status.textContent = error?.message || "Profile could not be loaded.";
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initJayceeProfile, { once: true });
} else {
  initJayceeProfile();
}
