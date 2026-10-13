(function () {
    const form = document.querySelector("[data-lore-access]");
    const usernameInput = form?.elements?.username;
    const guestUsername = "Guest";

    function continueToPrayer(username) {
        const name = String(username || guestUsername).trim() || guestUsername;

        window.localStorage.setItem("jaycee_username", name);
        document.body.classList.add("is-lore-launching");
        window.setTimeout(() => {
            window.location.href = "/prayer.html";
        }, 220);
    }

    form?.addEventListener("submit", (event) => {
        event.preventDefault();
        continueToPrayer(usernameInput?.value);
    });
})();
