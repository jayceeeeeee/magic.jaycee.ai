export const PROFILE_IMAGE_RESOURCE = "ui://magic/profile-image-v1.html";
export const PROFILE_IMAGE_MIME = "text/html;profile=mcp-app";

export const profileImageWidget = (origin: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;font:14px system-ui,sans-serif}
body{margin:0;padding:16px}figure{margin:0;display:grid;justify-items:center;gap:12px}
img{display:block;max-width:100%;max-height:360px;width:auto;height:auto;object-fit:contain;border-radius:12px}
img[hidden]{display:none}figcaption{font-weight:600;text-align:center}
#status{margin:8px 0;text-align:center;color:GrayText}
</style></head><body>
<figure><img id="image" hidden alt=""><figcaption id="caption"></figcaption></figure>
<p id="status" role="status">Loading image…</p>
<script>
const allowedOrigin = ${JSON.stringify(origin)};
const image = document.getElementById("image");
const caption = document.getElementById("caption");
const status = document.getElementById("status");
const notify = (method, params) => window.parent.postMessage({jsonrpc:"2.0",method,params}, "*");
const resize = () => notify("ui/notifications/size-changed", {height:document.body.scrollHeight});
const render = (data) => {
  if (!data || !data.image_url) return;
  try {
    const url = new URL(data.image_url);
    if (url.origin !== allowedOrigin || !url.pathname.startsWith("/storage/v1/object/sign/users/")) throw new Error();
    caption.textContent = data.owner_name || "Profile image";
    image.alt = (data.image_kind === "background" ? "Background of " : "Profile photo of ") + caption.textContent;
    image.hidden = true;
    status.textContent = "Loading image…";
    image.src = url.href;
  } catch {
    image.hidden = true;
    status.textContent = "This image address is unavailable.";
  }
};
image.addEventListener("load", () => {image.hidden=false;status.textContent="";resize();});
image.addEventListener("error", () => {image.hidden=true;status.textContent="Image unavailable. Ask to display it again for a fresh link.";resize();});
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const message=event.data;
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.id === 1) {
    if (message.error) {status.textContent="Image viewer could not connect to the chat.";return;}
    notify("ui/notifications/initialized", {});
    resize();
  }
  if (message.method === "ui/notifications/tool-result") {
    if (message.params?.isError) {
      image.hidden=true;
      status.textContent=message.params.content?.find((item) => item.type === "text")?.text || "Image unavailable.";
      resize();
    } else render(message.params?.structuredContent);
  }
});
window.parent.postMessage({jsonrpc:"2.0",id:1,method:"ui/initialize",params:{
  appInfo:{name:"magic-profile-image",version:"1.0.0"},appCapabilities:{},protocolVersion:"2026-01-26"
}}, "*");
// ChatGPT compatibility for hosts that already supplied the tool output on mount.
render(window.openai?.toolOutput);
window.addEventListener("openai:set_globals", (event) => render(event.detail?.globals?.toolOutput));
</script></body></html>`;
