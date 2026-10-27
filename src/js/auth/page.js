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
        const callbackParams = new URLSearchParams(window.location.hash.slice(1));
        const isEmailConfirmation = params.get("confirmation") === "mcp"
            || (isConnection && callbackParams.get("type") === "signup");
        const fullNameParam = String(params.get("full_name") || params.get("username") || "").trim();

        if (!form || !title || !submit || !status || !switcher || !password || !window.JayceeAuth) {
            return;
        }

        // The mail tab has no initiating OAuth window context. It only confirms
        // the shared session; the original connection window resumes consent.
        if (isEmailConfirmation) {
            form.hidden = switcher.hidden = true;
            try {
                if (callbackParams.has("error_description")) throw new Error(callbackParams.get("error_description"));
                const { data, error } = await window.JayceeAuth.getSession();
                if (error) throw error;
                if (data?.session) {
                    const client = await window.JayceeAuth.getSupabaseClient();
                    const { data: verified, error: userError } = await client.auth.getUser();
                    if (userError) throw userError;
                    if (!verified?.user) throw new Error("Your session could not be verified. Return to the original connection window and log in.");
                }
                status.textContent = data?.session
                    ? "Email confirmed. Return to the original connection window to continue."
                    : "Return to the original connection window and log in to continue.";
            } catch (error) {
                status.textContent = error?.message || "The email confirmation could not be completed.";
            }
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
        let resuming = false;
        let resumeError = "";
        async function resumeConnection() {
            if (!isConnection || navigating || resuming) return false;
            resuming = true;
            try {
                const { data, error } = await window.JayceeAuth.getSession();
                if (error) throw error;
                if (!data?.session) return false;
                // Consent verifies the user with Auth, not just browser storage.
                // Use the same check here so a rejected saved session cannot bounce back.
                const client = await window.JayceeAuth.getSupabaseClient();
                const { data: verified, error: userError } = await client.auth.getUser();
                if (userError) throw userError;
                if (!verified?.user || verified.user.id !== data.session.user?.id) {
                    throw new Error("Your saved session could not be verified. Please log in again.");
                }
                resumeError = "";
                navigating = true;
                clearPendingConfirmation();
                window.location.replace(window.JayceeAuth.getAfterSignInUrl(redirectPath));
                return true;
            } catch (error) {
                if (error?.code === "user_not_found"
                    || /^User from sub claim in JWT does not exist\.?$/i.test(error?.message || "")) {
                    // Account deletion leaves a saved browser session behind.
                    // Forget it so focus/pageshow cannot keep retrying this user.
                    try {
                        const client = await window.JayceeAuth.getSupabaseClient();
                        const { error: signOutError } = await client.auth.signOut({ scope: "local" });
                        if (signOutError) throw signOutError;
                        clearPendingConfirmation();
                        awaitingConfirmation = false;
                        resumeError = "Your previous account is no longer available. Log in with another account or sign up.";
                    } catch {
                        resumeError = "Your previous session could not be cleared. Please try again.";
                    }
                    status.textContent = resumeError;
                    return false;
                }
                resumeError = error?.message || "Your session could not be verified. Please log in again.";
                status.textContent = resumeError;
                return false;
            } finally {
                resuming = false;
            }
        }
        // Another tab may have confirmed the email and established the session.
        if (await resumeConnection()) return;

        window.addEventListener("pageshow", () => { void resumeConnection(); });
        window.addEventListener("focus", () => { void resumeConnection(); });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") void resumeConnection();
        });

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
            status.textContent = resumeError;
        }

        async function showConfirmation() {
            awaitingConfirmation = true;
            form.hidden = true;
            password.value = "";
            status.textContent = isConnection
                ? "Check your email to confirm your account, then return to this window."
                : "Check your email to confirm your account.";
            if (!isConnection) return;
            try { window.sessionStorage.setItem(pendingKey, String(Date.now())); } catch {}
            try {
                const client = await window.JayceeAuth.getSupabaseClient();
                client.auth.onAuthStateChange((event) => {
                    if (event === "SIGNED_IN") window.setTimeout(() => { void resumeConnection(); }, 0);
                });
                void resumeConnection();
            } catch {
                // Returning to this window checks the shared session again.
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
                        emailRedirectTo: new URL(isConnection ? "/login.html?confirmation=mcp"
                            : createAuthHref("/login.html", "login"), window.location.origin).href,
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
