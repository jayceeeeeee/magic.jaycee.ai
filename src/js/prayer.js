(function () {
    const isEmbedded = window.self !== window.top;
    const prayerForm = document.querySelector(".prayer-form");
    const prayerStatus = document.querySelector("[data-prayer-status]");
    const prayerUsername = document.querySelector("[data-prayer-username]");
    const autogrowFields = document.querySelectorAll("[data-autogrow]");
    const ACTIVE_TYPING_GAP_MS = 2000;
    let activeTypingMs = 0;
    let lastTypingAt = 0;

    document.body.classList.toggle("is-embedded", isEmbedded);
    if (prayerUsername) {
        prayerUsername.textContent = window.localStorage.getItem("player_full_name") || "Player";
    }

    function notifyHeight() {
        if (!isEmbedded) {
            return;
        }

        const targetOrigin = window.location.origin === "null" ? "*" : window.location.origin;

        window.parent?.postMessage({
            type: "prayer:height",
            height: document.documentElement.scrollHeight,
        }, targetOrigin);
    }

    function getPrayerPayload() {
        const formData = new FormData(prayerForm);
        const storedFullName = window.localStorage.getItem("player_full_name");

        return {
            problem: String(formData.get("problem") || "").trim(),
            prayer: String(formData.get("prayer") || "").trim(),
            username: String(storedFullName || "Unknown user").trim(),
        };
    }

    function setStatus(message, type = "info") {
        if (!prayerStatus) {
            return;
        }

        prayerStatus.textContent = message;
        prayerStatus.dataset.type = type;
        notifyHeight();
    }

    function updatePrayerStatusLayout() {
        if (prayerStatus) {
            prayerStatus.textContent = "";
        }

        requestAnimationFrame(notifyHeight);
    }

    function resizeAutogrowField(field) {
        if (!field.value.trim()) {
            field.style.height = "";
            return;
        }

        field.style.height = "auto";
        field.style.height = `${field.scrollHeight}px`;
    }

    function resizeAutogrowFields() {
        autogrowFields.forEach(resizeAutogrowField);
    }

    function trackActiveTyping() {
        const now = performance.now();

        if (lastTypingAt) {
            activeTypingMs += Math.min(now - lastTypingAt, ACTIVE_TYPING_GAP_MS);
        }

        lastTypingAt = now;
    }

    async function submitPrayerToDatabase(payload) {
        const client = await window.JayceeAuth.getSupabaseClient();
        const { data: sessionData } = await client.auth.getSession();
        const userId = sessionData?.session?.user?.id || null;
        const prayerRow = {
            problem: payload.problem,
            prayer: payload.prayer,
            username: payload.username,
        };

        if (userId) {
            prayerRow.user_id = userId;
        }

        const { error } = await client
            .from("prayers")
            .insert(prayerRow);

        if (error) {
            throw error;
        }
    }

    autogrowFields.forEach((field) => {
        field.addEventListener("input", () => {
            trackActiveTyping();
            resizeAutogrowField(field);
            notifyHeight();
        });
    });

    prayerForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!prayerForm.reportValidity()) {
            notifyHeight();
            return;
        }

        const payload = getPrayerPayload();
        const submitButton = prayerForm.querySelector("button[type='submit']");

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            await submitPrayerToDatabase(payload);
            window.localStorage.setItem("pending_prayer", JSON.stringify({
                ...payload,
                active_typing_ms: Math.round(activeTypingMs),
                created_at: new Date().toISOString(),
            }));
            await window.JayceeUI?.waitForSound();
            (isEmbedded ? window.top : window).location.href = window.JayceeReferral?.withReferral("/game.html") || "/game.html";
        } catch (error) {
            console.error("Jaycee prayer could not be saved", error);
            setStatus(error?.message || "Prayer could not be sent.", "error");
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });

    window.addEventListener("load", notifyHeight);
    window.addEventListener("resize", notifyHeight);
    resizeAutogrowFields();
    updatePrayerStatusLayout();
})();
