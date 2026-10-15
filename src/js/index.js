(function () {
    const startGameButton = document.querySelector("[data-start-game]");

    startGameButton?.addEventListener("click", async () => {
        if (startGameButton.disabled) {
            return;
        }

        startGameButton.disabled = true;
        document.body.classList.add("is-game-launching");
        const launchTransition = new Promise((resolve) => window.setTimeout(resolve, 260));
        let destination = "/lore.html";
        try {
            const result = await window.JayceeAuth?.getSession();
            if (result?.data?.session) destination = "/game.html";
        } catch (error) {
            console.warn("Main menu session could not be checked", error);
        }
        await Promise.all([launchTransition, window.JayceeUI?.waitForSound()]);
        window.location.href = window.JayceeReferral?.withReferral(destination) || destination;
    });

    window.addEventListener("pageshow", () => {
        document.body.classList.remove("is-game-launching");
        if (startGameButton) {
            startGameButton.disabled = false;
        }
    });
})();
