(function () {
    const isEmbedded = window.self !== window.top;
    const technoPrayerForm = document.querySelector(".techno-prayer-form");
    const technoPrayerLearning = document.querySelector("[data-techno-prayer-learning]");
    const technoPrayerContact = document.querySelector("[data-techno-prayer-contact]");
    const technoPrayerStatus = document.querySelector("[data-techno-prayer-status]");

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

    technoPrayerForm?.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!technoPrayerForm.reportValidity()) {
            notifyHeight();
            return;
        }

        if (needsTechnoPrayerContact() && getTechnoPrayerContactValues().every((value) => !value)) {
            if (technoPrayerStatus) {
                technoPrayerStatus.textContent = "Please add at least one contact method.";
            }

            notifyHeight();
            return;
        }

        if (technoPrayerStatus) {
            technoPrayerStatus.textContent = "Techno-Prayer received.";
        }

        notifyHeight();
    });

    window.addEventListener("load", notifyHeight);
    window.addEventListener("resize", notifyHeight);
    updateTechnoPrayerContactVisibility();
})();
