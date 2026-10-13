(function () {
    const startGameButton = document.querySelector("[data-start-game]");

    startGameButton?.addEventListener("click", () => {
        if (startGameButton.disabled) {
            return;
        }

        startGameButton.disabled = true;
        document.body.classList.add("is-game-launching");
        window.setTimeout(() => {
            window.location.href = "/lore.html";
        }, 260);
    });

    window.addEventListener("pageshow", () => {
        document.body.classList.remove("is-game-launching");
        if (startGameButton) {
            startGameButton.disabled = false;
        }
    });
})();
