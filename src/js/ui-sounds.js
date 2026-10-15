import { SoundEffects } from "./jaycee/sounds.js";

const sounds = new SoundEffects();
sounds.preload(["menuPlay", "buttonClick"]);
let pendingSound = Promise.resolve();
let navigationSequence = 0;

// Classic page scripts use the same completion promise before their redirects.
window.JayceeUI = { waitForSound: () => pendingSound };

const getControl = (event) => event.target instanceof Element
  ? event.target.closest('button, a[href], input[type="submit"], input[type="button"], input[type="reset"], input[type="checkbox"], input[type="radio"], [role="button"], [role="switch"], summary')
  : null;

// Capture runs before page handlers disable or replace the clicked control.
// Delegation also covers buttons inserted later by the account/game UI.
document.addEventListener("click", (event) => {
  const control = getControl(event);
  if (!control || control.matches(":disabled") || control.closest('[aria-disabled="true"], [inert]')) return;
  pendingSound = Promise.resolve(sounds.play(control.matches("[data-start-game]") ? "menuPlay" : "buttonClick", { waitForEnd: true }));
}, true);

// Let the click sound finish before ordinary same-tab navigation unloads it.
// Modified clicks, downloads, fragments and page-owned interactions stay native.
document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = getControl(event);
  if (!link?.matches("a[href]") || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  if (link.closest('[aria-disabled="true"], [inert]')) return;
  const destination = new URL(link.getAttribute("href"), window.location.href);
  const current = new URL(window.location.href);
  if (destination.origin !== current.origin || !["http:", "https:"].includes(destination.protocol)) return;
  if (destination.pathname === current.pathname && destination.search === current.search && destination.hash) return;
  event.preventDefault();
  const sequence = ++navigationSequence;
  void pendingSound.then(() => {
    if (sequence === navigationSequence) window.location.assign(window.JayceeReferral?.withReferral(destination.href) || destination.href);
  });
});
