(function () {
    const birthProfileKey = "birthProfile";
    const prayerAccountInviteKey = "jayceePrayerAccountInvite";

    function loadBirthProfile() {
        try {
            const savedProfile = localStorage.getItem(birthProfileKey);

            return savedProfile ? JSON.parse(savedProfile) : null;
        } catch {
            return null;
        }
    }

    function loadPrayerAccountInvite() {
        try {
            const savedInvite = localStorage.getItem(prayerAccountInviteKey);
            const invite = savedInvite ? JSON.parse(savedInvite) : null;

            if (!invite?.email) {
                return null;
            }

            return {
                ...invite,
                email: String(invite.email).trim().toLowerCase(),
            };
        } catch {
            return null;
        }
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
        const emailInput = form?.elements.email;

        if (!form || !title || !submit || !status || !switcher || !password || !emailInput || !window.JayceeAuth) {
            return;
        }

        function showExistingAccountMessage() {
            status.textContent = "An account with this email already exists.";
            switcher.innerHTML = 'Already have an account? <a href="?mode=login" data-auth-mode="login">Log in instead</a>.';
        }

        function renderMode() {
            const isSignup = mode === "signup";
            const prayerInvite = loadPrayerAccountInvite();
            const canCreateAccount = !isSignup || Boolean(prayerInvite);

            title.textContent = isSignup ? "Create account" : "Log in";
            submit.textContent = isSignup ? "Sign up" : "Log in";
            password.autocomplete = isSignup ? "new-password" : "current-password";
            if (isSignup && prayerInvite && !emailInput.value) {
                emailInput.value = prayerInvite.email;
            }
            form.hidden = !canCreateAccount;
            switcher.innerHTML = isSignup
                ? canCreateAccount
                    ? 'Already have an account? <a href="?mode=login" data-auth-mode="login">Log in</a>'
                    : 'Submit your first Techno-Prayer with an email first. <a href="/">Start here</a> or <a href="?mode=login" data-auth-mode="login">log in</a>.'
                : 'No account yet? <a href="/">Start here</a>';
            status.textContent = isSignup && !canCreateAccount
                ? "Accounts are created after your first Techno-Prayer so your prayer can be attached to your identity."
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
            const normalizedEmail = email.toLowerCase();
            const passwordValue = String(formData.get("password"));
            const birthProfile = loadBirthProfile();
            const prayerInvite = loadPrayerAccountInvite();

            if (mode === "signup" && !prayerInvite) {
                submit.disabled = false;
                renderMode();
                return;
            }

            if (mode === "signup" && prayerInvite.email !== normalizedEmail) {
                submit.disabled = false;
                status.textContent = "Use the same email you entered in your first Techno-Prayer.";
                return;
            }

            const result = mode === "signup"
                ? await window.JayceeAuth.signUp(email, passwordValue, {
                    data: {
                        full_name: prayerInvite.fullName || birthProfile?.fullName || "",
                        prayer_invite_email: prayerInvite.email,
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
