(function () {
    const cursorText = "_";
    const typingSpeed = 16;
    const linePause = 80;

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
        const text = document.createElement("span");

        line.className = "home-level-line is-entering";
        line.dataset.consoleLine = message;
        prompt.setAttribute("aria-hidden", "true");
        prompt.textContent = ">";
        text.className = "home-console-text";
        line.append(prompt, text);

        return { line, text };
    }

    function moveCursorTo(consoleEl, line) {
        consoleEl.querySelector(".cursor")?.remove();
        line.append(createCursor());
    }

    async function typeConsoleLine(consoleEl, message) {
        const { line, text } = createConsoleLine(message);

        consoleEl.append(line);
        moveCursorTo(consoleEl, line);

        requestAnimationFrame(() => {
            line.classList.remove("is-entering");
        });

        await wait(90);

        for (const character of message) {
            text.textContent += character;
            await wait(typingSpeed);
        }

        await wait(linePause);
    }

    async function bootConsole(playerName) {
        const consoleEl = document.querySelector("[data-signup-console]");

        if (!consoleEl) {
            return;
        }

        const messages = [
            "Player identified...",
            `${playerName} has entered the Techno-Temple and prayed...`,
            "Prayer has been granted according to the laws of the Universe...",
            "Going onto the next level...",
        ];

        consoleEl.querySelectorAll("[data-console-line], [data-console-player-line]").forEach((line) => {
            line.remove();
        });
        consoleEl.classList.remove("is-booting");

        for (const message of messages) {
            await typeConsoleLine(consoleEl, message);
        }
    }

    function isExistingAccountSignupResult(result) {
        const identities = result?.data?.user?.identities;

        return Array.isArray(identities) && identities.length === 0;
    }

    function isExistingAccountError(error) {
        return /already|registered|exists/i.test(error?.message || "");
    }

    function initSignupPage() {
        const params = new URLSearchParams(window.location.search);
        const invitedName = params.get("name") || params.get("full_name") || "";
        const invitedEmail = params.get("email") || "";
        const playerName = invitedName.trim() || "Player";
        const form = document.querySelector("[data-signup-form]");
        const status = document.querySelector("[data-auth-status]");
        const submit = form?.querySelector(".auth-submit");
        const nameInput = form?.querySelector('input[name="name"]');
        const emailInput = form?.querySelector('input[name="email"]');
        const startButton = document.querySelector("[data-reveal-signup]");
        const startPanel = document.querySelector("[data-signup-start-panel]");
        const formShell = document.querySelector("[data-signup-form-shell]");

        if (!form || !status || !submit || !nameInput || !emailInput || !window.JayceeAuth) {
            return;
        }

        nameInput.value = invitedName.trim();
        emailInput.value = invitedEmail.trim();

        function revealForm() {
            if (!formShell) {
                return;
            }

            formShell.hidden = false;

            requestAnimationFrame(() => {
                formShell.classList.add("is-revealed");
            });
        }

        startButton?.addEventListener("click", () => {
            if (startButton.disabled) {
                return;
            }

            startButton.disabled = true;
            startPanel?.setAttribute("hidden", "");
            revealForm();
            nameInput.focus();
        });

        bootConsole(playerName);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            status.textContent = "";
            submit.disabled = true;

            const formData = new FormData(form);
            const name = String(formData.get("name")).trim();
            const email = String(formData.get("email")).trim();
            const password = String(formData.get("password"));
            const result = await window.JayceeAuth.signUp(email, password, {
                data: {
                    full_name: name,
                    name,
                    invited_email: invitedEmail.trim(),
                    invited_name: invitedName.trim(),
                },
            });

            submit.disabled = false;

            if (result.error) {
                if (isExistingAccountError(result.error)) {
                    status.textContent = "An account with this email already exists. Try logging in instead.";
                    return;
                }

                status.textContent = result.error.message;
                return;
            }

            if (isExistingAccountSignupResult(result)) {
                status.textContent = "An account with this email already exists. Try logging in instead.";
                return;
            }

            if (!result.data.session) {
                status.textContent = "Check your email to confirm your account.";
                return;
            }

            status.textContent = "You are logged in.";
            window.JayceeAuth.refreshHeader();
            window.location.href = window.JayceeAuth.getAfterSignInUrl();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initSignupPage);
    } else {
        initSignupPage();
    }
})();
