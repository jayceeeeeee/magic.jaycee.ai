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
    };
    const lightLogoSrc = new URL("assets/brand/logo_trans_black.png", assetBase).href;
    const darkLogoSrc = new URL("assets/brand/logo_trans_white.png", assetBase).href;

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
                        <a href="${routes.contact}">contact me</a>
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
