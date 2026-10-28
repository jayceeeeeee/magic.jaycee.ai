// Verify local references and module reachability without contacting Supabase.
import { syncGame } from "./sync-game.ts";
import { buildMasterPicker, buildGame } from "./build-master-picker.ts";
await syncGame(true);
await buildMasterPicker(true);
await buildGame(true);
const root = new URL("../", import.meta.url);
const modules = new Set<string>();
const visited = new Set<string>();
const assets = new Set<string>();
const referenced = new Set<string>();
const styles: string[] = [];

async function checkReference(
  reference: string,
  source: URL,
): Promise<URL | null> {
  if (!reference || /^(?:https?:|data:|mailto:|#)/.test(reference)) return null;
  const target = reference.startsWith("/")
    ? new URL(`.${reference}`, root)
    : new URL(reference, source);
  target.search = target.hash = "";
  if (target.href.endsWith("/")) target.pathname += "index.html";
  await Deno.stat(target).catch(() => {
    throw new Error(`Missing reference ${reference} in ${source.pathname}`);
  });
  referenced.add(target.href);
  return target;
}

async function visitModule(url: URL) {
  if (visited.has(url.href)) return;
  visited.add(url.href);
  const source = await Deno.readTextFile(url);
  for (const match of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
    if (!match[1].startsWith(".")) continue;
    const imported = await checkReference(match[1], url);
    if (imported) await visitModule(imported);
  }
  for (
    const match of source.matchAll(
      /new URL\(['"]([^'"]+)['"],\s*import\.meta\.url\)/g,
    )
  ) {
    await checkReference(match[1], url);
  }
  for (const match of source.matchAll(/["'](\/src\/assets\/[^"']+)["']/g)) {
    await checkReference(match[1], url);
  }
}

async function inventory(directory: URL) {
  for await (const entry of Deno.readDir(directory)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), directory);
    if (entry.isDirectory) await inventory(url);
    else if (url.pathname.includes("/src/assets/")) assets.add(url.href);
    else if (entry.name.endsWith(".js")) modules.add(url.href);
    else if (entry.name.endsWith(".css")) {
      styles.push(await Deno.readTextFile(url));
    }
  }
}

await inventory(new URL("src/", root));
for await (const entry of Deno.readDir(root)) {
  if (!entry.name.endsWith(".html")) continue;
  const url = new URL(entry.name, root);
  const html = await Deno.readTextFile(url);
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const target = await checkReference(match[1], url);
    if (target?.pathname.endsWith(".js")) await visitModule(target);
  }
}
for (const module of modules) {
  if (!visited.has(module)) {
    throw new Error(`Unreachable frontend module: ${module}`);
  }
}
for (const asset of assets) {
  if (!referenced.has(asset)) {
    throw new Error(`Unreferenced frontend asset: ${asset}`);
  }
}
const css = styles.join("\n");
const defined = new Set(
  [...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
);
for (const match of css.matchAll(/var\((--[\w-]+)\s*\)/g)) {
  if (!defined.has(match[1])) {
    throw new Error(`Undefined CSS token: ${match[1]}`);
  }
}
console.log(
  `PASS: local references, ${visited.size} reachable modules, ${assets.size} referenced assets and CSS tokens.`,
);
