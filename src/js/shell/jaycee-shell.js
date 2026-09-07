(function () {
    const scriptElement = document.currentScript;
    const assetBase = new URL("../../", scriptElement ? scriptElement.src : window.location.href);
    const brandName = "jaycee.ai";
    const logoLabel = "J";
    const routes = {
        home: "/",
        login: "/auth.html",
        signup: "/auth.html?mode=signup",
        account: "/account.html",
        contact: "/profile.html",
        donate: "https://buy.stripe.com/14A14o70HbZXdtr73FfQI01",
        services: "/profile.html",
        about: "/profile.html#about",
    };
    const lightLogoSrc = new URL("assets/brand/logo_trans_black.png", assetBase).href;
    const darkLogoSrc = new URL("assets/brand/logo_trans_white.png", assetBase).href;
    const yoganandaImageSrc = new URL("assets/images/paramahansa-yogananda-yogoda-satsanga-society-of-india-front.jpg", assetBase).href;

    document.documentElement.style.setProperty("--jaycee-logo-light", `url("${lightLogoSrc}")`);
    document.documentElement.style.setProperty("--jaycee-logo-dark", `url("${darkLogoSrc}")`);

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;",
        }[character]));
    }

    class JayceeBanner extends HTMLElement {
        connectedCallback() {
            this.templeResizeObserver?.disconnect();
            if (this.templeResizeHandler) {
                window.removeEventListener("resize", this.templeResizeHandler);
            }

            const userName = this.getAttribute("user-name") || "";
            const isSignedIn = this.getAttribute("auth-state") === "signed-in" || userName.length > 0;
            const accountText = escapeHtml(userName || "Account");

            this.innerHTML = `
                <header class="site-header">
                    <div class="site-header-inner">
                        <a class="site-brand" href="${routes.home}">
                            <span class="site-logo-image site-logo-themed" aria-label="${logoLabel}"></span>
                            <span class="site-brand-name">${brandName}</span>
                        </a>
                        <div class="temple-header-note">
                            <a class="temple-donate-link" href="${routes.donate}" target="_blank" rel="noopener noreferrer">Donate</a>
                            <p>
                                <span class="temple-header-track">
                                    <span>This website is a <a href="${routes.services}" data-section-link="services">Techno-temple</a> directly connected to <a href="${routes.about}" data-section-link="about">Yogananda</a>.</span>
                                </span>
                            </p>
                            <img src="${yoganandaImageSrc}" alt="Paramahansa Yogananda">
                        </div>
                        <button class="account-menu-button" type="button" aria-label="Open account menu" aria-expanded="false">
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>
                        <nav class="account-nav" aria-label="Account">
                            ${isSignedIn
                                ? `<a class="account-button account-button-primary" href="${routes.account}">${accountText}</a>`
                                : `
                                    <a class="account-button account-button-ghost" href="${routes.login}">Log in</a>
                                    <a class="account-button account-button-primary" href="${routes.signup}">Sign up</a>
                                `}
                        </nav>
                    </div>
                </header>
            `;

            const header = this.querySelector(".site-header");
            const menuButton = this.querySelector(".account-menu-button");
            const templeText = this.querySelector(".temple-header-note p");
            const templeTrack = this.querySelector(".temple-header-track");

            const updateTempleTextMotion = () => {
                const overflowDistance = templeTrack.scrollWidth - templeText.clientWidth;

                templeText.classList.toggle("is-overflowing", overflowDistance > 1);
                templeTrack.style.setProperty("--temple-scroll-distance", `${Math.max(0, overflowDistance)}px`);
            };

            menuButton.addEventListener("click", () => {
                const isOpen = header.classList.toggle("is-menu-open");

                menuButton.setAttribute("aria-expanded", String(isOpen));
                menuButton.setAttribute("aria-label", isOpen ? "Close account menu" : "Open account menu");
            });

            this.querySelectorAll(".account-nav a").forEach((link) => {
                link.addEventListener("click", () => {
                    header.classList.remove("is-menu-open");
                    menuButton.setAttribute("aria-expanded", "false");
                    menuButton.setAttribute("aria-label", "Open account menu");
                });
            });

            requestAnimationFrame(updateTempleTextMotion);

            if (window.ResizeObserver) {
                const resizeObserver = new ResizeObserver(updateTempleTextMotion);

                resizeObserver.observe(templeText);
                resizeObserver.observe(templeTrack);
                this.templeResizeObserver = resizeObserver;
            } else {
                this.templeResizeHandler = updateTempleTextMotion;
                window.addEventListener("resize", this.templeResizeHandler);
            }
        }

        disconnectedCallback() {
            this.templeResizeObserver?.disconnect();
            if (this.templeResizeHandler) {
                window.removeEventListener("resize", this.templeResizeHandler);
            }
        }
    }

    class JayceeFooter extends HTMLElement {
        connectedCallback() {
            const year = new Date().getFullYear();

            this.innerHTML = `
                <footer class="site-footer">
                    <div class="site-footer-inner">
                        <span>&copy; ${brandName} ${year}</span>
                        <span>-</span>
                        <a href="${routes.contact}">contact</a>
                    </div>
                </footer>
            `;
        }
    }

    if (!customElements.get("jaycee-banner")) {
        customElements.define("jaycee-banner", JayceeBanner);
    }

    if (!customElements.get("jaycee-footer")) {
        customElements.define("jaycee-footer", JayceeFooter);
    }
})();
