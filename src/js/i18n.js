import { FR } from "./locales/fr.js";

export const LANGUAGE_KEY = "jaycee:language";
const supported = (value) => value === "fr" ? "fr" : "en";
const readLanguage = () => {
  try {
    return supported(globalThis.localStorage?.getItem(LANGUAGE_KEY));
  } catch {
    return "en";
  }
};
let language = readLanguage();
export const getLanguage = () => language;
export const getLocale = () => language === "fr" ? "fr-FR" : "en-GB";
export const message = (key, values = {}) => ({ key, values });
export const t = (source, values = {}) => {
  const key = String(source ?? "");
  const template = language === "fr" ? (FR[key] ?? key) : key;
  return template.replace(/\{([a-zA-Z]+)\}/g, (token, name) => {
    if (!Object.hasOwn(values, name)) return token;
    const value = typeof values[name] === "function"
      ? values[name]()
      : values[name];
    return value && typeof value === "object" && "key" in value
      ? t(value.key, value.values)
      : String(value);
  });
};

// Bind only explicitly identified interface copy. Never inspect player content.
// Weak references let removed cards/panels be collected between game renders.
const bindings = new WeakMap();
const targets = new Set();
export const bindTranslation = (node, slot, render) => {
  let slots = bindings.get(node);
  if (!slots) {
    slots = new Map();
    bindings.set(node, slots);
    targets.add(new WeakRef(node));
  }
  slots.set(slot, render);
  render();
};
export const setText = (node, source, values = {}) => {
  if (!node) return;
  let previous;
  bindTranslation(node, "text", () => {
    // A later render may replace the contents with a form or a player value.
    if (previous !== undefined && node.textContent !== previous) return;
    const current = typeof source === "function" ? source() : source;
    const spec = current && typeof current === "object" && "key" in current
      ? current
      : message(current, values);
    previous = t(spec.key, spec.values);
    node.textContent = previous;
  });
};
export const setAttributeText = (node, attribute, source, values = {}) => {
  const spec = source && typeof source === "object" && "key" in source
    ? source
    : message(source, values);
  bindTranslation(
    node,
    attribute,
    () => node.setAttribute(attribute, t(spec.key, spec.values)),
  );
};
export const textNode = (source) => {
  const node = document.createTextNode("");
  setText(node, source);
  return node;
};

const marked = new WeakSet();
export const translateTree = (root = document) => {
  const nodes = [
    ...(root.matches?.("[data-i18n], [data-i18n-attrs]") ? [root] : []),
    ...root.querySelectorAll("[data-i18n], [data-i18n-attrs]"),
  ];
  for (const node of nodes) {
    if (node.closest("[data-player-content]")) continue;
    if (marked.has(node)) continue;
    marked.add(node);
    if (node.hasAttribute("data-i18n")) {
      setText(node, node.getAttribute("data-i18n") || node.textContent);
    }
    for (
      const attr of (node.getAttribute("data-i18n-attrs") || "").split(" ")
        .filter(Boolean)
    ) setAttributeText(node, attr, node.getAttribute(attr));
  }
};

export const setLanguage = (value, { persist = true } = {}) => {
  language = supported(value);
  if (persist) {
    try {
      globalThis.localStorage?.setItem(LANGUAGE_KEY, language);
    } catch { /* The current page still works without storage. */ }
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
    translateTree();
  }
  for (const ref of targets) {
    const node = ref.deref();
    if (!node) {
      targets.delete(ref);
      continue;
    }
    if (node.isConnected) {
      for (const render of bindings.get(node).values()) render();
    }
  }
  globalThis.dispatchEvent?.(
    new CustomEvent("jaycee:language-changed", { detail: { language } }),
  );
};

export const createLanguagePicker = () => {
  const label = document.createElement("label");
  label.className = "language-picker";
  const code = document.createElement("span");
  code.setAttribute("aria-hidden", "true");
  const select = document.createElement("select");
  select.dataset.languageSelect = "";
  setAttributeText(select, "aria-label", "Language");
  for (const [value, title] of [["en", "English"], ["fr", "Français"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = title;
    select.append(option);
  }
  const refresh = () => {
    select.value = language;
    code.textContent = language.toUpperCase();
  };
  bindTranslation(select, "language", refresh);
  select.addEventListener("change", () => setLanguage(select.value));
  label.append(code, select);
  return label;
};

if (typeof document !== "undefined") {
  document.documentElement.lang = language;
  const init = () => {
    translateTree();
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) translateTree(node);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else init();
  globalThis.addEventListener?.("storage", (event) => {
    if (event.key === LANGUAGE_KEY || event.key === null) {
      setLanguage(readLanguage(), { persist: false });
    }
  });
}
