(function () {
    const birthProfileKey = "birthProfile";

    function loadBirthProfile() {
        try {
            const savedProfile = localStorage.getItem(birthProfileKey);

            return savedProfile ? JSON.parse(savedProfile) : null;
        } catch {
            return null;
        }
    }

    function hasCompletedGameProfile(profile) {
        return Boolean(profile?.birthDate && profile?.gender && profile?.pillars);
    }

    function isExistingAccountSignupResult(result) {
        const identities = result?.data?.user?.identities;

        return Array.isArray(identities) && identities.length === 0;
    }

    function isExistingAccountError(error) {
        return /already|registered|exists/i.test(error?.message || "");
    }

    function initAuthPage() {
        const params = new URLSearchParams(window.location.search);
        let mode = params.get("mode") === "signup" ? "signup" : "login";
        const form = document.querySelector("[data-auth-form]");
        const title = document.querySelector("#auth-title");
        const submit = document.querySelector(".auth-submit");
        const status = document.querySelector("[data-auth-status]");
        const switcher = document.querySelector("[data-auth-switch]");
        const password = form?.elements.password;

        if (!form || !title || !submit || !status || !switcher || !password || !window.JayceeAuth) {
            return;
        }

        function showExistingAccountMessage() {
            status.textContent = "An account with this email already exists.";
            switcher.innerHTML = 'Already have an account? <a href="?mode=login" data-auth-mode="login">Log in instead</a>.';
        }

        function renderMode() {
            const isSignup = mode === "signup";
            const birthProfile = loadBirthProfile();
            const canCreateAccount = !isSignup || hasCompletedGameProfile(birthProfile);

            title.textContent = isSignup ? "Create account" : "Log in";
            submit.textContent = isSignup ? "Sign up" : "Log in";
            password.autocomplete = isSignup ? "new-password" : "current-password";
            form.hidden = !canCreateAccount;
            switcher.innerHTML = isSignup
                ? canCreateAccount
                    ? 'Already have an account? <a href="?mode=login" data-auth-mode="login">Log in</a>'
                    : 'Create your character first. <a href="/game.html">Start the game</a> or <a href="?mode=login" data-auth-mode="login">log in</a>.'
                : 'No account yet? <a href="/">Start here</a>';
            status.textContent = isSignup && !canCreateAccount
                ? "Accounts are created after the game so your character data can be attached to your identity."
                : "";
        }

        switcher.addEventListener("click", (event) => {
            const link = event.target.closest("a[data-auth-mode]");

            if (!link) {
                return;
            }

            event.preventDefault();
            mode = link.dataset.authMode === "signup" ? "signup" : "login";
            window.history.replaceState({}, "", `?mode=${mode}`);
            renderMode();
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            status.textContent = "";
            submit.disabled = true;

            const formData = new FormData(form);
            const email = String(formData.get("email")).trim();
            const passwordValue = String(formData.get("password"));
            const birthProfile = loadBirthProfile();

            if (mode === "signup" && !hasCompletedGameProfile(birthProfile)) {
                submit.disabled = false;
                renderMode();
                return;
            }

            const result = mode === "signup"
                ? await window.JayceeAuth.signUp(email, passwordValue, {
                    data: {
                        full_name: birthProfile.fullName || "",
                        birth_profile: birthProfile,
                    },
                })
                : await window.JayceeAuth.signIn(email, passwordValue);

            submit.disabled = false;

            if (result.error) {
                if (mode === "signup" && isExistingAccountError(result.error)) {
                    showExistingAccountMessage();
                    return;
                }

                status.textContent = result.error.message;
                return;
            }

            if (mode === "signup" && isExistingAccountSignupResult(result)) {
                showExistingAccountMessage();
                return;
            }

            if (mode === "signup" && !result.data.session) {
                status.textContent = "Check your email to confirm your account.";
                return;
            }

            status.textContent = "You are logged in.";
            window.JayceeAuth.refreshHeader();
            window.location.href = window.JayceeAuth.getAfterSignInUrl();
        });

        renderMode();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAuthPage);
    } else {
        initAuthPage();
    }
})();
