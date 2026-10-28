// Thin MCP adapter. Cards, dialog, Markdown and ability previews belong to the site UI.
import { createMastersNoticeContent } from "../../src/js/jaycee/master-picker.js";
import { formatDuration } from "../../src/js/jaycee/skill-panel.js";
import { DEV_MASTER_ACCOUNT_IDS } from "../../src/js/config/master-catalog.js";

window.JayceeConfig = { masterAccountIds: DEV_MASTER_ACCOUNT_IDS };
const root = document.getElementById("master-picker");
const status = document.getElementById("status");
const countdown = document.getElementById("countdown");
const retry = document.getElementById("retry");
const pending = new Map();
let requestId = 0;
let current = null;
let saving = false;
const notify = (method, params) =>
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("The chat did not respond. Try again."));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
const callTool = async (name, args = {}) => {
  const response = await request("tools/call", { name, arguments: args });
  if (response.isError) {
    throw new Error(
      response.content?.find((item) => item.type === "text")?.text ||
        "The operation failed.",
    );
  }
  if (!response.structuredContent) {
    throw new Error("The game returned no data. Try again.");
  }
  return response.structuredContent;
};
const showError = (error) => {
  status.textContent = error.message || "The game could not be loaded.";
  retry.hidden = false;
};
const updateCountdown = () => {
  const deadline = current?.selection_deadline;
  if (!deadline || !current.requires_master_selection) {
    countdown.textContent = "";
    return;
  }
  const remaining = Math.ceil((Date.parse(deadline) - Date.now()) / 1000);
  countdown.textContent = remaining > 0
    ? `Time remaining to choose: ${
      formatDuration(remaining, { compact: false })
    }`
    : "The time to choose a Master has expired.";
  if (remaining <= 0 && !current.selection_expired) {
    render({ ...current, selection_expired: true });
  }
};
function render(data) {
  if (!data || typeof data.requires_master_selection !== "boolean" || saving) {
    return;
  }
  current = data;
  retry.hidden = true;
  root.replaceChildren();
  if (!data.requires_master_selection) {
    status.textContent = data.master_name
      ? `You are linked to ${data.master_name}. Your Level 1 quest has started.`
      : "Your Master is already selected. You can continue your game.";
  } else if (data.selection_expired) {
    status.textContent =
      "The selection period has expired. Check your account on the website.";
  } else {
    status.textContent = data.masters?.some((master) => !master.linkLocked)
      ? "Open a Master's profile to discover their path, then select your Master. Selecting starts your first quest."
      : "No Masters are available yet. Try again shortly.";
    retry.hidden = !!data.masters?.some((master) => !master.linkLocked);
    root.append(createMastersNoticeContent(data.masters || [], {
      referrerId: data.referrer_id,
      onLoadDetails: (master) =>
        callTool("get_master_details", { master_id: master.id }),
      onSelect: async (master) => {
        if (saving) return;
        saving = true;
        root.querySelectorAll("button").forEach((button) =>
          button.disabled = true
        );
        status.textContent = "Linking your Master…";
        retry.hidden = true;
        try {
          const selected = await callTool("select_master", {
            master_id: master.id,
          });
          saving = false;
          render(selected);
          notify("ui/update-model-context", { structuredContent: selected });
        } catch (error) {
          saving = false;
          render(current);
          showError(error);
        }
      },
    }));
  }
  updateCountdown();
}
retry.addEventListener("click", async () => {
  retry.disabled = true;
  status.textContent = "Loading Masters…";
  try {
    render(await callTool("show_master_picker"));
  } catch (error) {
    showError(error);
  } finally {
    retry.disabled = false;
  }
});
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0") return;
  const operation = pending.get(message.id);
  if (operation) {
    clearTimeout(operation.timer);
    pending.delete(message.id);
    if (message.error) {
      operation.reject(
        new Error(message.error.message || "The request failed."),
      );
    } else operation.resolve(message.result);
    return;
  }
  if (message.method === "ui/notifications/tool-result") {
    if (message.params?.isError) {
      showError(
        new Error(
          message.params.content?.find((item) => item.type === "text")?.text ||
            "Masters unavailable.",
        ),
      );
    } else render(message.params?.structuredContent);
  }
});
new ResizeObserver(() =>
  notify("ui/notifications/size-changed", {
    height: document.body.scrollHeight,
  })
).observe(document.body);
setInterval(updateCountdown, 1000);
request("ui/initialize", {
  appInfo: { name: "magic-master-picker", version: "1.0.0" },
  appCapabilities: {},
  protocolVersion: "2026-01-26",
}).then(() => notify("ui/notifications/initialized", {})).catch(showError);
render(window.openai?.toolOutput);
window.addEventListener(
  "openai:set_globals",
  (event) => render(event.detail?.globals?.toolOutput),
);
