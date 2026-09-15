(function () {
  const cursorText = "_";
  const typingSpeed = 16;
  const linePause = 80;
  const consoleEl = document.querySelector("[data-levels-console]");
  const board = document.querySelector("[data-levels-board]");
  const cells = Array.from(document.querySelectorAll("[data-cell-action]"));

  function wait(duration) {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
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

  function getConsoleLines(isSignedIn) {
    return [
      {
        message: isSignedIn
          ? "You are logged in."
          : "You are not logged in.",
      },
    ];
  }

  function unlockCell(cell) {
    const title = cell.querySelector(".level-cell-title")?.textContent?.trim() || "Square";

    cell.classList.remove("is-locked");
    cell.disabled = false;
    cell.setAttribute("aria-disabled", "false");
    cell.setAttribute("aria-label", title);
    delete cell.dataset.lockedTargetUrl;
  }

  function renderCells() {
    cells.forEach(unlockCell);
  }

  function bindCells() {
    cells.forEach((cell) => {
      cell.addEventListener("click", () => {
        const targetUrl = cell.dataset.targetUrl;

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
    const isSignedIn = await getSignedInState();

    renderCells();
    bindCells();
    await renderConsole(getConsoleLines(isSignedIn));
    revealBoard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
