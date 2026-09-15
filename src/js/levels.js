(function () {
  const cursorText = "_";
  const typingSpeed = 16;
  const linePause = 80;
  const consoleEl = document.querySelector("[data-levels-console]");
  const board = document.querySelector("[data-levels-board]");
  const cells = Array.from(document.querySelectorAll("[data-cell-action]"));
  const loginPath = "/login.html";
  const signupPath = "/signup.html";

  function wait(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  function hasAccountCreateParams() {
    const params = new URLSearchParams(window.location.search);

    return Boolean(params.get("name")?.trim() && params.get("email")?.trim());
  }

  function getPlayerName() {
    const params = new URLSearchParams(window.location.search);

    return params.get("name")?.trim() || "Player";
  }

  function getSignupUrl() {
    const url = new URL(signupPath, window.location.origin);
    const currentParams = new URLSearchParams(window.location.search);

    currentParams.forEach((value, key) => {
      url.searchParams.set(key, value);
    });

    return url.href;
  }

  function createCursor() {
    const cursor = document.createElement("span");

    cursor.className = "cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.textContent = cursorText;

    return cursor;
  }

  function normalizeConsoleLine(lineConfig) {
    if (lineConfig.segments) {
      return lineConfig.segments;
    }

    return [{ text: lineConfig.message, href: lineConfig.href }];
  }

  function createTextSegment(segment) {
    const text = segment.href ? document.createElement("a") : document.createElement("span");

    text.className = segment.href ? "home-console-link home-console-text" : "home-console-text";

    if (segment.href) {
      text.href = segment.href;
    }

    return text;
  }

  function createConsoleLine(message) {
    const line = document.createElement("p");
    const prompt = document.createElement("span");

    line.className = "home-level-line is-entering";
    line.dataset.consoleLine = message;
    prompt.setAttribute("aria-hidden", "true");
    prompt.textContent = ">";
    line.append(prompt);

    return line;
  }

  function moveCursorTo(line) {
    consoleEl?.querySelector(".cursor")?.remove();
    line.append(createCursor());
  }

  async function typeConsoleLine(line, lineConfig) {
    moveCursorTo(line);

    requestAnimationFrame(() => {
      line.classList.remove("is-entering");
    });

    await wait(90);

    for (const segment of normalizeConsoleLine(lineConfig)) {
      const text = createTextSegment(segment);

      line.insertBefore(text, line.querySelector(".cursor"));

      for (const character of segment.text) {
        text.textContent += character;
        await wait(typingSpeed);
      }
    }

    await wait(linePause);
  }

  async function renderConsole(lines) {
    if (!consoleEl) {
      return;
    }

    consoleEl.querySelectorAll("[data-console-line]").forEach((line) => {
      line.remove();
    });

    consoleEl.classList.remove("is-booting");

    for (const lineConfig of lines) {
      const line = createConsoleLine(lineConfig.message);

      consoleEl.append(line);
      await typeConsoleLine(line, lineConfig);
    }
  }

  function getConsoleLines(isSignedIn, shouldPromptAccount) {
    if (isSignedIn) {
      return [
        { message: "Player identified..." },
        { message: "You are at level 2..." },
        { message: "What do you want to do in the Techno-Temple?" },
      ];
    }

    if (shouldPromptAccount) {
      const playerName = getPlayerName();

      return [
        { message: "Player identified..." },
        { message: `${playerName} has entered the Techno-Temple and prayed...` },
        { message: "Prayer has been granted..." },
        {
          message: "Create an account to unlock level 2...",
          segments: [
            { text: "Create an account to unlock level 2", href: getSignupUrl() },
            { text: "..." },
          ],
        },
      ];
    }

    return [
      { message: "Unknown user..." },
      { message: "You are at level 1..." },
      { message: "What do you want to do in the Techno-Temple?" },
    ];
  }

  function setCellLocked(cell, requiredLevel, unlockLevel, shouldPromptAccount) {
    const isLocked = requiredLevel > unlockLevel;
    const title = cell.querySelector(".level-cell-title")?.textContent?.trim() || "Square";
    const requirement = cell.querySelector(".level-cell-requirement");

    cell.classList.toggle("is-locked", isLocked);
    cell.disabled = false;
    cell.setAttribute("aria-disabled", isLocked ? "true" : "false");
    cell.setAttribute("aria-label", isLocked ? `${title}, locked until level ${requiredLevel}` : title);

    if (requirement) {
      requirement.textContent = `Level ${requiredLevel}`;
    }

    if (isLocked && requiredLevel === 2 && shouldPromptAccount) {
      cell.dataset.lockedTargetUrl = getSignupUrl();
      return;
    }

    if (isLocked && requiredLevel === 2) {
      cell.dataset.lockedTargetUrl = loginPath;
      return;
    }

    delete cell.dataset.lockedTargetUrl;
  }

  function renderCells(isSignedIn, shouldPromptAccount) {
    const unlockLevel = isSignedIn ? 2 : 1;

    cells.forEach((cell) => {
      const requiredLevel = Number.parseInt(cell.dataset.requiredLevel || "1", 10);

      setCellLocked(cell, requiredLevel, unlockLevel, shouldPromptAccount);
    });
  }

  function bindCells() {
    cells.forEach((cell) => {
      cell.addEventListener("click", () => {
        const lockedTargetUrl = cell.dataset.lockedTargetUrl;
        const targetUrl = cell.dataset.targetUrl;

        if (cell.classList.contains("is-locked")) {
          if (lockedTargetUrl) {
            window.location.href = lockedTargetUrl;
          }
          return;
        }

        if (targetUrl) {
          window.location.href = targetUrl;
        }
      });
    });
  }

  function revealBoard() {
    if (!board) {
      return;
    }

    board.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      board.classList.add("is-revealed");
    });
  }

  async function getSignedInState() {
    if (!window.JayceeAuth) {
      return false;
    }

    try {
      const { data } = await window.JayceeAuth.getSession();

      return Boolean(data.session?.user);
    } catch (_error) {
      return false;
    }
  }

  async function init() {
    const shouldPromptAccount = hasAccountCreateParams();
    const isSignedIn = await getSignedInState();

    renderCells(isSignedIn, shouldPromptAccount);
    bindCells();
    await renderConsole(getConsoleLines(isSignedIn, shouldPromptAccount));
    revealBoard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
