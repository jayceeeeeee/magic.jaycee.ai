(function () {
  const status = document.querySelector("[data-level-status]");
  const cells = Array.from(document.querySelectorAll("[data-required-level]"));
  const signUpUrl = "./auth.html?mode=signup";
  const accountUrl = "./account.html";

  function readLevelFromUser(user) {
    const metadata = user?.user_metadata || {};
    const candidates = [
      metadata.level,
      metadata.game_level,
      metadata.jaycee_level,
      user?.app_metadata?.level,
      user?.app_metadata?.game_level,
    ];
    const parsedLevel = candidates
      .map((value) => Number.parseInt(value, 10))
      .find((value) => Number.isFinite(value) && value > 0);

    return parsedLevel || 2;
  }

  function setBoardState(level, isSignedIn) {
    if (!status) {
      return;
    }

    status.textContent = isSignedIn ? `Level ${level}` : "Level 1 - free";

    cells.forEach((cell) => {
      const requiredLevel = Number.parseInt(cell.dataset.requiredLevel, 10);
      const isLocked = requiredLevel > level;

      cell.classList.toggle("is-locked", isLocked);
      cell.setAttribute("aria-disabled", String(isLocked));

      if (isLocked) {
        cell.href = isSignedIn ? accountUrl : signUpUrl;
        cell.setAttribute("aria-label", `${cell.querySelector(".level-cell-title").textContent}, locked. Create an account to continue.`);
      } else {
        cell.href = cell.dataset.unlockedHref || "./profile.html";
        cell.setAttribute("aria-label", `${cell.querySelector(".level-cell-title").textContent}, level ${requiredLevel}`);
      }
    });
  }

  async function init() {
    setBoardState(1, false);

    if (!window.JayceeAuth) {
      return;
    }

    try {
      const { data } = await window.JayceeAuth.getSession();
      const user = data.session?.user;

      if (user) {
        setBoardState(readLevelFromUser(user), true);
      }
    } catch (_error) {
      setBoardState(1, false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
