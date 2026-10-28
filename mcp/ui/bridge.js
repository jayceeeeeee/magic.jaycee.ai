let sequence = 0;
const pending = new Map();
let ready = Promise.resolve();
export const notify = (method, params) =>
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
export const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("The chat did not respond. Try again."));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
export const callTool = async (name, args = {}) => {
  await ready;
  const r = await request("tools/call", { name, arguments: args });
  if (r.isError) {
    throw new Error(
      r.content?.find((c) => c.type === "text")?.text ||
        "The operation failed.",
    );
  }
  if (!r.structuredContent) throw new Error("The game returned no data.");
  return r.structuredContent;
};
export async function gameEvent(event) {
  // Context updates alone do not ask the assistant to take another turn.
  await request("ui/update-model-context", { structuredContent: event }).catch(
    () => {},
  );
  const text = `Game action completed in the interface: ${
    JSON.stringify(event)
  }. Briefly explain the new quest or progression using the saved game state. Do not repeat the action.`;
  try {
    await request("ui/message", {
      role: "user",
      content: [{ type: "text", text }],
    });
  } catch {
    if (window.openai?.sendFollowUpMessage) {
      await window.openai.sendFollowUpMessage({
        prompt: text,
        scrollToBottom: false,
      });
    }
  }
}
export function connect({ name, onResult, onError }) {
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    const p = pending.get(m.id);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message || "Request failed."));
      else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-result") {
      if (m.params?.isError) {
        onError(
          new Error(
            m.params.content?.find((c) => c.type === "text")?.text ||
              "Game unavailable.",
          ),
        );
      } else onResult(m.params?.structuredContent);
    }
    if (m.method === "ui/notifications/teardown") {
      window.dispatchEvent(new Event("pagehide"));
    }
  });
  new ResizeObserver(() =>
    notify("ui/notifications/size-changed", {
      height: document.body.scrollHeight,
    })
  ).observe(document.body);
  ready = request("ui/initialize", {
    appInfo: { name, version: "1.0.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26",
  })
    .then(() => notify("ui/notifications/initialized", {}));
  void ready.catch(onError);
  onResult(window.openai?.toolOutput);
  window.addEventListener(
    "openai:set_globals",
    (e) => onResult(e.detail?.globals?.toolOutput),
  );
}
