(function () {
    const form = document.querySelector("[data-lore-access]");
    const usernameInput = form?.elements?.username;

    function continueToPrayer(username) {
        const name = String(username || "").trim();

        if (!name) {
            return;
        }

        window.localStorage.setItem("jaycee_username", name);
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

        continueToPrayer(usernameInput?.value);
    });

    window.addEventListener("pageshow", () => {
        document.body.classList.remove("is-lore-launching");
    });
})();
