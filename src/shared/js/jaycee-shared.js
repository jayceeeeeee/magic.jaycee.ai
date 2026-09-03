(function () {
    const scriptElement = document.currentScript;
    const assetBase = new URL("../", scriptElement ? scriptElement.src : window.location.href);
    const defaultTheme = "lotus";
    const themeStorageKey = "jaycee-theme";
    const defaultHomeHref = "/";
    const defaultContactHref = "/profile.html";
    const defaultLightLogoSrc = new URL("assets/logo_trans_black.png", assetBase).href;
    const defaultDarkLogoSrc = new URL("assets/logo_trans_white.png", assetBase).href;

    document.documentElement.style.setProperty("--jaycee-logo-light", `url("${defaultLightLogoSrc}")`);
    document.documentElement.style.setProperty("--jaycee-logo-dark", `url("${defaultDarkLogoSrc}")`);

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;",
        }[character]));
    }

    function getStoredTheme(storageKey) {
        try {
            return localStorage.getItem(storageKey);
        } catch {
            return null;
        }
    }

    function storeTheme(storageKey, theme) {
        try {
            localStorage.setItem(storageKey, theme);
        } catch {
            return;
        }
    }

    function getKnownTheme(theme, themeButtons, fallbackTheme) {
        return Array.from(themeButtons).some((button) => button.dataset.themeChoice === theme)
            ? theme
            : fallbackTheme;
    }

    function setTheme(theme, options) {
        const nextTheme = getKnownTheme(theme, options.themeButtons, options.defaultTheme);

        document.body.dataset.theme = nextTheme;

        options.themeButtons.forEach((button) => {
            const isActive = button.dataset.themeChoice === nextTheme;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });

        storeTheme(options.themeStorageKey, nextTheme);
    }

    function initJayceeShared(userOptions = {}) {
        const options = {
            defaultTheme: userOptions.defaultTheme || defaultTheme,
            themeStorageKey: userOptions.themeStorageKey || themeStorageKey,
            themeButtons: document.querySelectorAll("[data-theme-choice]"),
        };

        options.themeButtons.forEach((button) => {
            button.addEventListener("click", () => {
                setTheme(button.dataset.themeChoice, options);
            });
        });

        if (options.themeButtons.length > 0) {
            setTheme(document.body.dataset.theme || getStoredTheme(options.themeStorageKey) || options.defaultTheme, options);
        } else if (!document.body.dataset.theme) {
            document.body.dataset.theme = options.defaultTheme;
        }
    }

    class JayceeBanner extends HTMLElement {
        connectedCallback() {
            const homeHref = escapeHtml(this.getAttribute("home-href") || defaultHomeHref);
            const brandLabel = escapeHtml(this.getAttribute("brand-label") || "jaycee.ai");
            const logoText = escapeHtml(this.getAttribute("logo-text") || "J");
            const logoSrc = this.getAttribute("logo-src");
            const logoMarkup = logoSrc
                ? `<img class="site-logo-image" src="${escapeHtml(logoSrc)}" alt="" aria-hidden="true">`
                : `<span class="site-logo-image site-logo-themed" aria-label="${logoText}"></span>`;
            const loginHref = escapeHtml(this.getAttribute("login-href") || "#login");
            const signupHref = escapeHtml(this.getAttribute("signup-href") || "#signup");
            const accountHref = escapeHtml(this.getAttribute("account-href") || "#account");
            const accountLabel = escapeHtml(this.getAttribute("account-label") || "Account");
            const userName = this.getAttribute("user-name") || "";
            const isSignedIn = this.getAttribute("auth-state") === "signed-in" || userName.length > 0;
            const accountText = escapeHtml(userName || accountLabel);

            this.innerHTML = `
                <header class="site-header">
                    <div class="site-header-inner">
                        <a class="site-brand" href="${homeHref}">
                            ${logoMarkup}
                            <span class="site-brand-name">${brandLabel}</span>
                        </a>
                        <nav class="account-nav" aria-label="Account">
                            ${isSignedIn
                                ? `<a class="account-button account-button-primary" href="${accountHref}">${accountText}</a>`
                                : `
                                    <a class="account-button account-button-ghost" href="${loginHref}">Log in</a>
                                    <a class="account-button account-button-primary" href="${signupHref}">Sign up</a>
                                `}
                        </nav>
                    </div>
                </header>
            `;
        }
    }

    class JayceeFooter extends HTMLElement {
        connectedCallback() {
            const brandLabel = escapeHtml(this.getAttribute("brand-label") || "jaycee.ai");
            const contactHref = escapeHtml(this.getAttribute("contact-href") || defaultContactHref);
            const year = escapeHtml(this.getAttribute("year") || new Date().getFullYear());

            this.innerHTML = `
                <footer class="site-footer">
                    <div class="site-footer-inner">
                        <span>&copy; ${brandLabel} ${year}</span>
                        <span>-</span>
                        <a href="${contactHref}">contact me</a>
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

    window.JayceeShared = {
        init: initJayceeShared,
        setTheme: (theme) => {
            setTheme(theme, {
                defaultTheme,
                themeStorageKey,
                themeButtons: document.querySelectorAll("[data-theme-choice]"),
            });
        },
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => initJayceeShared());
    } else {
        initJayceeShared();
    }
})();
