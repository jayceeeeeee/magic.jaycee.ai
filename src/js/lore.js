(function () {
    const form = document.querySelector("[data-lore-access]");
    const fullNameInput = form?.elements?.full_name;

    async function continueToPrayer(fullName) {
        const name = String(fullName || "").trim();

        if (!name) {
            return;
        }

        window.localStorage.setItem("player_full_name", name);
        window.localStorage.removeItem("pending_prayer");
        document.body.classList.add("is-lore-launching");
        await Promise.all([
            new Promise((resolve) => window.setTimeout(resolve, 220)),
            window.JayceeUI?.waitForSound()
        ]);
        window.location.href = "/prayer.html";
    }

    form?.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!form.reportValidity()) {
            return;
        }

        continueToPrayer(fullNameInput?.value);
    });

    window.addEventListener("pageshow", () => {
        document.body.classList.remove("is-lore-launching");
    });
})();
