// Local static server. Never serves database files, tests, tooling or Git metadata.
import { syncGame } from "./sync-game.ts";
await syncGame(true);
const root = new URL("../", import.meta.url);
const types: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  woff: "font/woff",
  woff2: "font/woff2",
  ico: "image/x-icon",
};
Deno.serve({ hostname: "127.0.0.1", port: 3000 }, async (request) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response(null, { status: 405 });
  }
  let path;
  try {
    path = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (path === "/") path = "/index.html";
  if (
    path.includes("\\") || path.split("/").some((p) =>
      p === ".." || p.startsWith(".")
    ) ||
    !/^\/(?:[a-z-]+\.html|src\/(?:assets|css|js)\/[^?]+)$/.test(path)
  ) {
    return new Response("Not found", { status: 404 });
  }
  const target = new URL(`.${path}`, root);
  try {
    const resolved = await Deno.realPath(target);
    const rootPath = await Deno.realPath(root);
    if (
      !resolved.startsWith(
        rootPath + (Deno.build.os === "windows" ? "\\" : "/"),
      )
    ) return new Response(null, { status: 404 });
    const body = await Deno.readFile(resolved);
    return new Response(request.method === "HEAD" ? null : body, {
      headers: {
        "Content-Type": types[path.split(".").pop()!] ||
          "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});
