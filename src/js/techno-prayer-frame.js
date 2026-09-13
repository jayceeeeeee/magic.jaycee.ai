(function () {
    const startGameButton = document.querySelector("[data-start-game]");
    const frame = document.querySelector("[data-techno-prayer-frame]");

    startGameButton?.addEventListener("click", () => {
        if (!frame) {
            return;
        }

        frame.hidden = false;
        startGameButton.closest(".home-start-panel")?.setAttribute("hidden", "");
        frame.contentWindow?.focus();
        frame.addEventListener("load", () => frame.contentWindow?.focus(), { once: true });
    });

    window.addEventListener("message", (event) => {
        if (window.location.origin !== "null" && event.origin !== window.location.origin) {
            return;
        }

        if (event.data?.type !== "techno-prayer:height") {
            return;
        }

        const height = Number(event.data.height);

        if (frame && Number.isFinite(height)) {
            frame.style.height = `${height}px`;
        }
    });
})();
