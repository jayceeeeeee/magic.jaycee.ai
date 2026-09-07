(function () {
    const isEmbedded = window.self !== window.top;
    const technoPrayerForm = document.querySelector(".techno-prayer-form");
    const technoPrayerLearning = document.querySelector("[data-techno-prayer-learning]");
    const technoPrayerContact = document.querySelector("[data-techno-prayer-contact]");
    const technoPrayerStatus = document.querySelector("[data-techno-prayer-status]");
    const technoPrayerSubmit = technoPrayerForm?.querySelector("[type='submit']");

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

    function needsTechnoPrayerContact() {
        return Number(technoPrayerLearning?.selectedIndex || 0) > 0;
    }

    function getTechnoPrayerContactValues() {
        if (!technoPrayerForm) {
            return [];
        }

        const formData = new FormData(technoPrayerForm);

        return ["email", "whatsapp", "line"].map((fieldName) => String(formData.get(fieldName) || "").trim());
    }

    function getTechnoPrayerPayload() {
        const formData = new FormData(technoPrayerForm);

        return {
            problem: String(formData.get("problem") || "").trim(),
            prayer: String(formData.get("prayer") || "").trim(),
            learning_type: getLearningTypeValue(String(formData.get("learning") || "").trim()),
            full_name: String(formData.get("name") || "").trim(),
            email: String(formData.get("email") || "").trim() || null,
            whatsapp: String(formData.get("whatsapp") || "").trim() || null,
            line: String(formData.get("line") || "").trim() || null,
        };
    }

    function getLearningTypeValue(learningChoice) {
        const optionIndex = Array.from(technoPrayerLearning?.options || [])
            .findIndex((option) => option.value === learningChoice || option.textContent.trim() === learningChoice);

        return ["manifestation", "advice", "initiation"][Math.max(0, optionIndex)] || "manifestation";
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
        const result = await client.from("techno_prayers").insert(row);

        if (!result.error) {
            return result;
        }

        if (userId && /user_id/i.test(result.error.message || "")) {
            return client.from("techno_prayers").insert(payload);
        }

        return result;
    }

    function updateTechnoPrayerContactVisibility() {
        if (!technoPrayerContact) {
            return;
        }

        technoPrayerContact.hidden = !needsTechnoPrayerContact();

        if (technoPrayerStatus) {
            technoPrayerStatus.textContent = "";
        }

        requestAnimationFrame(notifyHeight);
    }

    technoPrayerLearning?.addEventListener("change", updateTechnoPrayerContactVisibility);

    technoPrayerForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!technoPrayerForm.reportValidity()) {
            notifyHeight();
            return;
        }

        if (needsTechnoPrayerContact() && getTechnoPrayerContactValues().every((value) => !value)) {
            setStatus("Please add at least one contact method.", "error");
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
            updateTechnoPrayerContactVisibility();
            setStatus("Techno-Prayer received.", "success");
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
    updateTechnoPrayerContactVisibility();
})();
