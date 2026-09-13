(function () {
    const cursorText = "_";
    const typingSpeed = 18;
    const linePause = 90;
    const startGameButton = document.querySelector("[data-start-game]");
    const homeConsole = document.querySelector("[data-home-console]");
    const formShell = document.querySelector("[data-home-form-shell]");
    const frame = document.querySelector("[data-techno-prayer-frame]");
    const gameStartLines = [
        [
            "Welcome to the ",
            {
                text: "Techno-Temple",
                href: "./profile.html",
            },
            "!...",
        ],
        "Start with a Techno-Prayer...",
    ];
    let consoleQueue = Promise.resolve();

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

    function createConsoleLine(message) {
        const line = document.createElement("p");
        const prompt = document.createElement("span");

        line.className = "home-level-line is-entering";
        prompt.setAttribute("aria-hidden", "true");
        prompt.textContent = ">";
        line.append(prompt);

        return line;
    }

    function normalizeConsoleLine(message) {
        if (Array.isArray(message)) {
            return message.map((segment) => {
                if (typeof segment === "string") {
                    return { text: segment };
                }

                return segment;
            });
        }

        return [{ text: message }];
    }

    function createTextSegment(segment) {
        if (!segment.href) {
            const text = document.createElement("span");

            text.className = "home-console-text";

            return text;
        }

        const link = document.createElement("a");

        link.className = "home-console-link home-console-text";
        link.href = segment.href;

        return link;
    }

    function moveCursorTo(line) {
        homeConsole?.querySelector(".cursor")?.remove();
        line?.append(createCursor());
    }

    async function typeConsoleLine(line, message) {
        moveCursorTo(line);

        requestAnimationFrame(() => {
            line.classList.remove("is-entering");
        });

        await wait(90);

        for (const segment of normalizeConsoleLine(message)) {
            const text = createTextSegment(segment);

            line.insertBefore(text, line.querySelector(".cursor"));

            for (const character of segment.text) {
                text.textContent += character;
                await wait(typingSpeed);
            }
        }

        await wait(linePause);
    }

    async function appendConsoleLinesNow(messages) {
        if (!homeConsole) {
            return;
        }

        for (const message of messages) {
            const line = createConsoleLine(message);

            homeConsole.append(line);
            await typeConsoleLine(line, message);
        }
    }

    function appendConsoleLines(messages) {
        consoleQueue = consoleQueue.then(() => appendConsoleLinesNow(messages));

        return consoleQueue;
    }

    function getFallbackConsoleLines() {
        if (!homeConsole) {
            return [];
        }

        const lines = Array.from(homeConsole.querySelectorAll("[data-console-line]")).map((line) => {
            line.remove();

            return line.dataset.consoleLine || "";
        }).filter(Boolean);

        homeConsole.classList.remove("is-booting");

        return lines;
    }

    function revealForm() {
        if (!formShell) {
            return;
        }

        formShell.hidden = false;

        requestAnimationFrame(() => {
            formShell.classList.add("is-revealed");
        });
    }

    startGameButton?.addEventListener("click", () => {
        if (!frame || startGameButton.disabled) {
            return;
        }

        startGameButton.disabled = true;
        startGameButton.closest(".home-start-panel")?.setAttribute("hidden", "");
        appendConsoleLines(gameStartLines).then(() => {
            revealForm();
            frame.contentWindow?.focus();
            frame.addEventListener("load", () => frame.contentWindow?.focus(), { once: true });
        });
    });

    window.addEventListener("message", (event) => {
        if (window.location.origin !== "null" && event.origin !== window.location.origin) {
            return;
        }

        if (event.data?.type !== "techno-prayer:height") {
            return;
        }

        const height = Number(event.data.height);

        if (frame && Number.isFinite(height)) {
            frame.style.height = `${height}px`;
            formShell?.style.setProperty("--home-frame-height", `${height}px`);
        }
    });

    appendConsoleLines(getFallbackConsoleLines());
})();
