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

    function isExistingAccountSignupResult(result) {
        const identities = result?.data?.user?.identities;

        return Array.isArray(identities) && identities.length === 0;
    }

    function isExistingAccountError(error) {
        return /already|registered|exists/i.test(error?.message || "");
    }

    async function saveSignupProfile(userId, username) {
        if (!userId || !username) {
            return;
        }

        const client = await window.JayceeAuth.getSupabaseClient();
        const { error } = await client
            .from("profiles")
            .upsert({
                id: userId,
                username,
            }, {
                onConflict: "id",
            });

        if (error) {
            throw error;
        }
    }

    function initAuthPage() {
        const params = new URLSearchParams(window.location.search);
        const form = document.querySelector("[data-auth-form]");
        let mode = params.get("mode") === "signup" ? "signup" : form?.dataset.authMode || "login";
        const title = document.querySelector("#auth-title");
        const submit = document.querySelector(".auth-submit");
        const status = document.querySelector("[data-auth-status]");
        const switcher = document.querySelector("[data-auth-switch]");
        const password = form?.elements.password;
        const username = form?.elements.username;
        const signupFields = [...document.querySelectorAll("[data-auth-signup-field]")];
        const redirectPath = params.get("redirect");

        if (!form || !title || !submit || !status || !switcher || !password || !username || !window.JayceeAuth) {
            return;
        }

        function showExistingAccountMessage() {
            status.textContent = "An account with this email already exists.";
            switcher.innerHTML = 'Already have an account? <a href="/src/html/auth/auth.html" data-auth-mode="login">Log in instead</a>.';
        }

        function renderMode() {
            const isSignup = mode === "signup";

            title.textContent = isSignup ? "Create an account" : "Log in";
            submit.textContent = isSignup ? "Sign up" : "Log in";
            password.autocomplete = isSignup ? "new-password" : "current-password";
            username.required = isSignup;
            signupFields.forEach((field) => {
                field.hidden = !isSignup;
            });
            form.hidden = false;
            switcher.hidden = false;
            switcher.innerHTML = isSignup
                ? 'Already have an account? <a href="/src/html/auth/auth.html" data-auth-mode="login">Log in</a>'
                : 'No account yet? <a href="/src/html/auth/auth.html?mode=signup" data-auth-mode="signup">Sign up</a>';
            status.textContent = "";
        }

        switcher.addEventListener("click", (event) => {
            const link = event.target.closest("a[data-auth-mode]");

            if (!link) {
                return;
            }

            event.preventDefault();
            mode = link.dataset.authMode === "signup" ? "signup" : "login";
            const nextParams = new URLSearchParams(window.location.search);

            if (mode === "signup") {
                nextParams.set("mode", mode);
            } else {
                nextParams.delete("mode");
            }
            const nextQuery = nextParams.toString();

            window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
            renderMode();
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            status.textContent = "";
            submit.disabled = true;

            const formData = new FormData(form);
            const usernameValue = String(formData.get("username") || "").trim();
            const email = String(formData.get("email")).trim();
            const passwordValue = String(formData.get("password"));
            const birthProfile = loadBirthProfile();

            const result = mode === "signup"
                ? await window.JayceeAuth.signUp(email, passwordValue, {
                    data: {
                        full_name: birthProfile?.fullName || "",
                        username: usernameValue,
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

            if (mode === "signup") {
                try {
                    await saveSignupProfile(result.data.user?.id, usernameValue);
                } catch (error) {
                    status.textContent = error?.message || "Your account was created, but the username could not be saved.";
                    return;
                }
            }

            status.textContent = "You are logged in.";
            window.JayceeAuth.refreshHeader();
            window.location.href = redirectPath?.startsWith("/") && !redirectPath.startsWith("//")
                ? window.JayceeAuth.getAfterSignInUrl(redirectPath)
                : window.JayceeAuth.getAfterSignInUrl();
        });

        renderMode();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAuthPage);
    } else {
        initAuthPage();
    }
})();
