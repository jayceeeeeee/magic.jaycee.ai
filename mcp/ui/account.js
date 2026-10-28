import { initJayceeAccountPage } from "../../src/js/jaycee/account-panel.js";
import "../../src/js/ui-sounds.js";
import { callTool, connect, request } from "./bridge.js";

let state;
let mounting = false;
let mounted = false;
const status = document.querySelector("#account-status");
const retry = document.querySelector("#account-retry");
const failed = (error) => {
  status.hidden = false;
  status.textContent = error?.message || "Account could not be loaded.";
  retry.hidden = false;
};
const remember = (value) => {
  state = value;
  return value;
};
const data = {
  fetchProfileByUserId: async (_client, id) => id === state.profile.id ? { ...state.profile } : state.master?.id === id ? state.master : null,
  fetchPlayersForUser: async () => state.players,
  getAvatarImageUrl: async (_client, profile) => profile?.avatar_url || "",
  fetchUserGameSettings: async () => state.game,
  fetchSkillsByIds: async () => state.skills,
  createReferralLink: () => state.referral_url || "",
  saveOwnGame: async (_client, skills) => remember(await callTool("save_account_skills", { skills })),
  saveProfile: async (_client, _id, updates) => remember(await callTool("update_account_profile", { updates })),
  uploadAvatar: async ({ file }) => {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("Choose a PNG, JPEG, WebP or GIF photo up to 5 MB.");
    const upload = await callTool("prepare_account_avatar_upload", { content_type: file.type, size: file.size });
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    const response = await fetch(upload.upload_url, { method: "PUT", headers: { "x-upsert": "false" }, body });
    if (!response.ok) throw new Error("Photo upload failed. Choose your photo and try again.");
    return upload.avatar_path;
  },
};
const show = async (result) => {
  if (mounted || mounting || result?.kind !== "account_state") return;
  mounting = true;
  retry.hidden = true;
  try {
    // A restored conversation can replay old settings. Always revalidate first.
    remember(await callTool("get_account_state"));
    await initJayceeAccountPage({
      data, expanded: true, collapsible: false,
      auth: { getSupabaseClient: async () => null, getSession: async () => ({ data: { session: { user: { id: state.profile.id } } } }) },
      onSaved: async () => {
        // Keep private account fields out of automatic conversation messages.
        await request("ui/update-model-context", { structuredContent: { event: "account_saved", account_id: state.profile.id, message: "Account settings were saved. Read get_account_state if needed." } }).catch(() => {});
      },
    });
    status.hidden = true;
    mounted = true;
  } catch (error) {
    failed(error);
  } finally {
    mounting = false;
  }
};
retry.addEventListener("click", () => void show({ kind: "account_state" }));
connect({ name: "Magic Account", onResult: (value) => void show(value), onError: failed });
