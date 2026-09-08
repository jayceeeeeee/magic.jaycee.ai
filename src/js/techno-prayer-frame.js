(function () {
    window.addEventListener("message", (event) => {
        if (window.location.origin !== "null" && event.origin !== window.location.origin) {
            return;
        }

        if (event.data?.type !== "techno-prayer:height") {
            return;
        }

        const frame = document.querySelector("[data-techno-prayer-frame]");
        const height = Number(event.data.height);

        if (frame && Number.isFinite(height)) {
            frame.style.height = `${height}px`;
        }
    });
})();
