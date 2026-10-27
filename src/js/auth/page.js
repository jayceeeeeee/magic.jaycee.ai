(function () {
    function isExistingAccountSignupResult(result) {
        const identities = result?.data?.user?.identities;

        return Array.isArray(identities) && identities.length === 0;
    }

    function isExistingAccountError(error) {
        return /already|registered|exists/i.test(error?.message || "");
    }

    async function initAuthPage() {
        const params = new URLSearchParams(window.location.search);
        const form = document.querySelector("[data-auth-form]");
        const mode = form?.dataset.authMode || "login";
        const title = document.querySelector("#auth-title");
        const submit = document.querySelector(".auth-submit");
        const status = document.querySelector("[data-auth-status]");
        const switcher = document.querySelector("[data-auth-switch]");
        const password = form?.elements.password;
        const redirectPath = window.JayceeAuth?.getReturnPath();
        const isConnection = window.JayceeAuth?.isConnectionReturn(redirectPath);
        const fullNameParam = String(params.get("full_name") || params.get("username") || "").trim();

        if (!form || !title || !submit || !status || !switcher || !password || !window.JayceeAuth) {
            return;
        }

        const pendingKey = `jaycee:confirmation:${redirectPath}`;
        let awaitingConfirmation = false;
        try {
            const startedAt = Number(window.sessionStorage.getItem(pendingKey));
            awaitingConfirmation = Boolean(isConnection && mode === "signup" && startedAt > 0
                && Date.now() - startedAt < 24 * 60 * 60 * 1000);
        } catch { /* The email return URL works without browser storage. */ }
        function clearPendingConfirmation() {
            try { window.sessionStorage.removeItem(pendingKey); } catch {}
        }
        let navigating = false;
        async function resumeConnection() {
            if (!isConnection || navigating) return false;
            try {
                const { data, error } = await window.JayceeAuth.getSession();
                if (error || !data?.session) return false;
                navigating = true;
                clearPendingConfirmation();
                window.location.replace(window.JayceeAuth.getAfterSignInUrl(redirectPath));
                return true;
            } catch {
                return false;
            }
        }
        // Also handles the email confirmation link opening in a new tab.
        if (await resumeConnection()) return;

        window.addEventListener("pageshow", () => { void resumeConnection(); });

        function createAuthHref(path, nextMode) {
            const nextParams = new URLSearchParams();

            if (redirectPath) {
                nextParams.set("redirect", redirectPath);
            }
            if (nextMode === "signup" && fullNameParam) {
                nextParams.set("full_name", fullNameParam);
            }

            const query = nextParams.toString();

            const href = query ? `${path}?${query}` : path;
            return window.JayceeReferral?.withReferral(href) || href;
        }

        function showExistingAccountMessage() {
            status.textContent = "An account with this email already exists.";
            switcher.innerHTML = `Already have an account? <a href="${createAuthHref("/login.html", "login")}" data-auth-mode="login">Log in instead</a>.`;
        }

        function renderMode() {
            const isSignup = mode === "signup";

            submit.textContent = isSignup ? "Sign up" : "Log in";
            password.autocomplete = isSignup ? "new-password" : "current-password";
            form.hidden = false;
            switcher.hidden = false;
            switcher.innerHTML = isSignup
                ? `Already have an account? <a href="${createAuthHref("/login.html", "login")}" data-auth-mode="login">Log in</a>`
                : `No account yet? <a href="${createAuthHref("/signup.html", "signup")}">Sign up</a>`;
            status.textContent = "";
        }

        async function showConfirmation() {
            awaitingConfirmation = true;
            form.hidden = true;
            password.value = "";
            status.textContent = "Check your email to confirm your account.";
            if (!isConnection) return;
            try { window.sessionStorage.setItem(pendingKey, String(Date.now())); } catch {}
            try {
                const client = await window.JayceeAuth.getSupabaseClient();
                client.auth.onAuthStateChange((event) => {
                    if (event === "SIGNED_IN") window.setTimeout(() => { void resumeConnection(); }, 0);
                });
                void resumeConnection();
            } catch {
                // The confirmation link can still resume in its own tab.
            }
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (awaitingConfirmation) return;
            if (submit.disabled) return;
            status.textContent = "";
            submit.disabled = true;

            const formData = new FormData(form);
            const email = String(formData.get("email")).trim();
            const passwordValue = String(formData.get("password"));

            let result;
            try {
                result = mode === "signup"
                    ? await window.JayceeAuth.signUp(email, passwordValue, {
                        emailRedirectTo: new URL(createAuthHref("/login.html", "login"), window.location.origin).href,
                        data: {
                            full_name: fullNameParam,
                        },
                    })
                    : await window.JayceeAuth.signIn(email, passwordValue);
            } catch (error) {
                status.textContent = error?.message || "Could not connect. Please try again.";
                return;
            } finally {
                submit.disabled = false;
            }

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
                await showConfirmation();
                return;
            }

            status.textContent = "You are logged in.";
            clearPendingConfirmation();
            await window.JayceeUI?.waitForSound();
            window.location.href = redirectPath
                ? window.JayceeAuth.getAfterSignInUrl(redirectPath)
                : window.JayceeAuth.getAfterSignInUrl();
        });

        renderMode();
        if (awaitingConfirmation) await showConfirmation();
        const callbackParams = new URLSearchParams(window.location.hash.slice(1));
        if (callbackParams.has("error_description")) {
            status.textContent = callbackParams.get("error_description");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAuthPage);
    } else {
        initAuthPage();
    }
})();
