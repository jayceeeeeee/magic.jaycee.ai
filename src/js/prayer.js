(function () {
    const isEmbedded = window.self !== window.top;
    const technoPrayerForm = document.querySelector(".techno-prayer-form");
    const technoPrayerStatus = document.querySelector("[data-techno-prayer-status]");
    const technoPrayerSubmit = technoPrayerForm?.querySelector("[type='submit']");
    const autogrowFields = document.querySelectorAll("[data-autogrow]");

    document.body.classList.toggle("is-embedded", isEmbedded);

    function notifyHeight() {
        if (!isEmbedded) {
            return;
        }

        const targetOrigin = window.location.origin === "null" ? "*" : window.location.origin;

        window.parent?.postMessage({
            type: "techno-prayer:height",
            height: document.documentElement.scrollHeight,
        }, targetOrigin);
    }

    function getTechnoPrayerPayload() {
        const formData = new FormData(technoPrayerForm);
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
        if (!technoPrayerStatus) {
            return;
        }

        technoPrayerStatus.textContent = message;
        technoPrayerStatus.dataset.type = type;
        notifyHeight();
    }

    async function getCurrentUserId() {
        if (!window.JayceeAuth) {
            return null;
        }

        try {
            const { data } = await window.JayceeAuth.getSession();

            return data?.session?.user?.id || null;
        } catch {
            return null;
        }
    }

    async function insertTechnoPrayer(payload) {
        if (!window.JayceeAuth) {
            throw new Error("The prayer service is not available yet.");
        }

        const client = await window.JayceeAuth.getSupabaseClient();
        const userId = await getCurrentUserId();
        const row = userId ? { ...payload, user_id: userId } : payload;

        return client.from("techno_prayers").insert(row);
    }

    function updateTechnoPrayerStatusLayout() {
        if (technoPrayerStatus) {
            technoPrayerStatus.textContent = "";
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

    technoPrayerForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!technoPrayerForm.reportValidity()) {
            notifyHeight();
            return;
        }

        const payload = getTechnoPrayerPayload();

        setStatus("Sending your Techno-Prayer...", "info");

        if (technoPrayerSubmit) {
            technoPrayerSubmit.disabled = true;
        }

        try {
            const { error } = await insertTechnoPrayer(payload);

            if (error) {
                setStatus(error.message || "Unable to send your Techno-Prayer.", "error");
                return;
            }

            technoPrayerForm.reset();
            requestAnimationFrame(resizeAutogrowFields);
            updateTechnoPrayerStatusLayout();
            setStatus("Techno-Prayer received.", "success");
            (isEmbedded ? window.top : window).location.href = "/profiles.html";
        } catch (error) {
            setStatus(error.message || "Unable to send your Techno-Prayer.", "error");
        } finally {
            if (technoPrayerSubmit) {
                technoPrayerSubmit.disabled = false;
            }
        }
    });

    window.addEventListener("load", notifyHeight);
    window.addEventListener("resize", notifyHeight);
    resizeAutogrowFields();
    updateTechnoPrayerStatusLayout();
})();
