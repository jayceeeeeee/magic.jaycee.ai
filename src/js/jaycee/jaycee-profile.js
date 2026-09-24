import {
  MAIN_CORE_RING_LANGUAGE,
  MAIN_CORE_SQUARE_LANGUAGE,
  loadJayceeLanguage
} from "./jaycee-language.js";

const JAYCEE_ORDER = [1, 2, 4, 3, 5, 7, 6, 8, 9];
const JAYCEE_FRACTALS_TABLE = "jaycee_fractals";
const CODE_COLUMNS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DEFAULT_SELECTED_NUMBER = 5;

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
    const sessionResult = await window.JayceeAuth?.getSession?.();
    const user = sessionResult?.data?.session?.user;

    if (!user) {
      redirectToLogin();
      return;
    }

    shell.hidden = false;
    const client = await window.JayceeAuth.getSupabaseClient();
    const language = await loadJayceeLanguage({
      coreRingLanguage: MAIN_CORE_RING_LANGUAGE,
      coreSquareLanguage: MAIN_CORE_SQUARE_LANGUAGE,
      jayceeOrder: JAYCEE_ORDER
    });

    coreSquareLabels = language.coreSquareLabels || getEmptyLabels();
    rows = await fetchUserResonances(client, user.id);
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
