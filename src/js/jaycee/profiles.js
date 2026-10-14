import {
  fetchPublicProfiles,
  getAvatarImageUrl,
  getDisplayValue
} from "../config/data.js";
import { startJayceeProfilePage } from "./profile-runtime.js";

const getRequestedUsername = () => (
  getDisplayValue(new URLSearchParams(window.location.search).get("username"))
);

const setPendingPrayerTarget = (profile) => {
  const rawPrayer = window.localStorage.getItem("jaycee_pending_prayer");

  if (!rawPrayer) return;

  try {
    const pendingPrayer = JSON.parse(rawPrayer);

    window.localStorage.setItem("jaycee_pending_prayer", JSON.stringify({
      ...pendingPrayer,
      target_profile_id: getDisplayValue(profile.id),
      target_profile_username: getDisplayValue(profile.username),
      target_profile_name: getDisplayValue(profile.full_name),
    }));
  } catch {
    window.localStorage.removeItem("jaycee_pending_prayer");
  }
};

const createProfileCard = ({ avatarUrl = "", profile }) => {
  const username = getDisplayValue(profile.username);
  const fullName = getDisplayValue(profile.full_name);
  const link = document.createElement("a");
  const avatar = document.createElement("span");
  const body = document.createElement("span");
  const name = document.createElement("strong");
  const meta = document.createElement("span");

  link.className = "profiles-card";
  link.href = `/profiles.html?username=${encodeURIComponent(username)}`;
  avatar.className = "profiles-card-avatar";
  if (avatarUrl) {
    const image = document.createElement("img");

    image.alt = "";
    image.src = avatarUrl;
    avatar.append(image);
  } else {
    avatar.textContent = username.slice(0, 1).toUpperCase();
  }
  body.className = "profiles-card-body";
  name.textContent = username;
  meta.textContent = fullName || "Manifestation target";
  body.append(name, meta);
  link.append(avatar, body);
  link.addEventListener("click", () => setPendingPrayerTarget(profile));

  return link;
};

const setStatus = (element, message, isError = false) => {
  if (!element) return;

  element.textContent = message;
  element.dataset.state = isError ? "error" : "ready";
};

const initProfilesList = async () => {
  const shell = document.querySelector("[data-profiles-list-shell]");
  const list = document.querySelector("[data-profiles-list]");
  const status = document.querySelector("[data-profiles-list-status]");

  if (!shell || !list) return;

  shell.hidden = false;

  try {
    const client = await window.JayceeAuth.getSupabaseClient();
    const profiles = await fetchPublicProfiles(client);

    if (!profiles.length) {
      setStatus(status, "No profiles are available yet.", true);
      return;
    }

    const cards = await Promise.all(profiles.map(async (profile) => {
      let avatarUrl = "";

      try {
        avatarUrl = await getAvatarImageUrl(client, profile);
      } catch {
        avatarUrl = "";
      }

      return createProfileCard({ avatarUrl, profile });
    }));

    list.replaceChildren(...cards);
    setStatus(status, "");
  } catch (error) {
    console.error("Jaycee profiles list failed", error);
    setStatus(status, error?.message || "Profiles could not be loaded.", true);
  }
};

if (getRequestedUsername()) {
  startJayceeProfilePage();
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProfilesList, { once: true });
} else {
  initProfilesList();
}
