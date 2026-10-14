(function () {
    const form = document.querySelector("[data-lore-access]");
    const fullNameInput = form?.elements?.full_name;

    function continueToPrayer(fullName) {
        const name = String(fullName || "").trim();

        if (!name) {
            return;
        }

        window.localStorage.setItem("player_full_name", name);
        document.body.classList.add("is-lore-launching");
        window.setTimeout(() => {
            window.location.href = "/prayer.html";
        }, 220);
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
