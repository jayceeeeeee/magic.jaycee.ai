(function () {
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

        function renderMode() {
            const isSignup = mode === "signup";

            title.textContent = isSignup ? "Create account" : "Log in";
            submit.textContent = isSignup ? "Sign up" : "Log in";
            password.autocomplete = isSignup ? "new-password" : "current-password";
            switcher.innerHTML = isSignup
                ? 'Already have an account? <a href="?mode=login">Log in</a>'
                : 'No account yet? <a href="?mode=signup">Sign up</a>';
            status.textContent = "";
        }

        switcher.addEventListener("click", (event) => {
            const link = event.target.closest("a");

            if (!link) {
                return;
            }

            event.preventDefault();
            mode = mode === "signup" ? "login" : "signup";
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
            const result = mode === "signup"
                ? await window.JayceeAuth.signUp(email, passwordValue)
                : await window.JayceeAuth.signIn(email, passwordValue);

            submit.disabled = false;

            if (result.error) {
                status.textContent = result.error.message;
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
