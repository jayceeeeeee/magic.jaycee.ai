(function () {
    function goToAuth(logout) {
        const redirectHref = logout?.dataset.authRedirect;

        if (redirectHref) {
            window.location.href = redirectHref;
            return;
        }

        window.location.href = window.JayceeAuth?.getAuthUrl?.("login") || "/auth.html?mode=login";
    }

    async function initAccountPage() {
        const email = document.querySelector("[data-account-email]");
        const accountStatus = document.querySelector("[data-account-status]");
        const pageStatus = document.querySelector("[data-auth-status]");
        const logout = document.querySelector("[data-logout]");

        if (!email || !accountStatus || !pageStatus || !logout || !window.JayceeAuth) {
            return;
        }

        const { data } = await window.JayceeAuth.getSession();
        const user = data.session?.user;

        if (!user) {
            goToAuth(logout);
            return;
        }

        email.textContent = user.email || "No email";
        accountStatus.textContent = user.email_confirmed_at ? "Confirmed" : "Waiting for email confirmation";

        logout.addEventListener("click", async () => {
            logout.disabled = true;
            pageStatus.textContent = "";

            const result = await window.JayceeAuth.signOut();

            if (result.error) {
                logout.disabled = false;
                pageStatus.textContent = result.error.message;
                return;
            }

            goToAuth(logout);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAccountPage);
    } else {
        initAccountPage();
    }
})();
