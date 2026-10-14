(function () {
    const isEmbedded = window.self !== window.top;
    const prayerForm = document.querySelector(".prayer-form");
    const prayerStatus = document.querySelector("[data-prayer-status]");
    const prayerUsername = document.querySelector("[data-prayer-username]");
    const autogrowFields = document.querySelectorAll("[data-autogrow]");

    document.body.classList.toggle("is-embedded", isEmbedded);
    if (prayerUsername) {
        prayerUsername.textContent = window.localStorage.getItem("jaycee_username") || "Player";
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
        const storedUsername = window.localStorage.getItem("jaycee_username");

        return {
            problem: String(formData.get("problem") || "").trim(),
            prayer: String(formData.get("prayer") || "").trim(),
            learning_type: "manifestation",
            full_name: String(formData.get("name") || storedUsername || "Unknown user").trim(),
            email: String(formData.get("email") || "").trim() || null,
            whatsapp: String(formData.get("whatsapp") || "").trim() || null,
            line: String(formData.get("line") || "").trim() || null,
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

    autogrowFields.forEach((field) => {
        field.addEventListener("input", () => {
            resizeAutogrowField(field);
            notifyHeight();
        });
    });

    prayerForm?.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!prayerForm.reportValidity()) {
            notifyHeight();
            return;
        }

        const payload = getPrayerPayload();

        window.localStorage.setItem("jaycee_pending_prayer", JSON.stringify({
            ...payload,
            created_at: new Date().toISOString(),
        }));
        (isEmbedded ? window.top : window).location.href = "/profiles.html";
    });

    window.addEventListener("load", notifyHeight);
    window.addEventListener("resize", notifyHeight);
    resizeAutogrowFields();
    updatePrayerStatusLayout();
})();
