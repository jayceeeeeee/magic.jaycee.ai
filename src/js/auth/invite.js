import { setText } from '../i18n.js';
(function () {
    // Capture the callback type before supabase-js consumes the URL fragment.
    const key = "jaycee.invite_password_pending";
    const callback = new URLSearchParams(window.location.hash.slice(1));
    let pending = callback.get("type") === "invite";
    try {
        if (pending) window.sessionStorage.setItem(key, "pending");
        pending = pending || Boolean(window.sessionStorage.getItem(key));
    } catch { /* Keep the current invitation usable without browser storage. */ }
    if (!pending) return;

    async function init() {
        const dialog = document.createElement("dialog");
        dialog.className = "auth-game-page invite-password-dialog";
        dialog.setAttribute("aria-labelledby", "invite-password-title");
        dialog.innerHTML = `
          <section class="auth-panel">
            <h1 class="game-brand-title" id="invite-password-title">jaycee.ai</h1>
            <p class="auth-eyebrow"><span data-i18n>Welcome to Jaycee.ai!</span></p>
            <p><span data-i18n>Choose a password to finish setting up your account.</span></p>
            <form class="auth-form" data-invite-password-form>
              <label><span><span data-i18n>Password</span></span><input type="password" name="password" autocomplete="new-password" minlength="6" required></label>
              <label><span><span data-i18n>Confirm password</span></span><input type="password" name="confirmation" autocomplete="new-password" minlength="6" required></label>
              <button class="account-button account-button-primary auth-submit" type="submit" disabled><span data-i18n>Continue</span></button>
            </form>
            <p class="auth-status" role="status" aria-live="polite"><span data-i18n>Checking your invitation...</span></p>
            <button class="account-button" type="button" data-invite-exit hidden><span data-i18n>Back to log in</span></button>
          </section>`;
        document.body.append(dialog);
        dialog.addEventListener("cancel", (event) => event.preventDefault());
        dialog.showModal();
        const form = dialog.querySelector("form");
        const submit = form.querySelector('[type="submit"]');
        const status = dialog.querySelector('[role="status"]');
        const exit = dialog.querySelector("[data-invite-exit]");
        const password = form.elements.password;
        const confirmation = form.elements.confirmation;
        let client;
        let userId;
        let saving = false;
        const clearPending = () => {
            try { window.sessionStorage.removeItem(key); } catch { /* Optional storage. */ }
        };

        exit.addEventListener("click", async (event) => {
            if (saving || exit.hidden) return;
            const button = event.currentTarget;
            button.disabled = true;
            try {
                const authClient = client || await window.JayceeAuth.getSupabaseClient();
                const { error } = await authClient.auth.signOut();
                if (error) throw error;
                clearPending();
                await window.JayceeUI?.waitForSound();
                window.location.replace("/login.html");
            } catch (error) {
                setText(status, error?.message || "Could not log out. Please try again.");
                button.disabled = false;
            }
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (saving || submit.disabled || !client || !userId) return;
            if (password.value !== confirmation.value) {
                setText(status, "Passwords do not match.");
                confirmation.focus();
                return;
            }
            if (!form.reportValidity()) return;
            saving = true;
            submit.disabled = true;
            setText(status, "Saving your password...");
            try {
                const { data, error } = await client.auth.getUser();
                if (error || data.user?.id !== userId) throw new Error("Your session has changed. Please reopen your invitation.");
                const result = await client.auth.updateUser({ password: password.value });
                if (result.error) throw result.error;
                clearPending();
                form.reset();
                setText(status, "Password saved.");
                await window.JayceeUI?.waitForSound();
                window.location.replace("/game.html");
            } catch (error) {
                setText(status, error?.message || "Could not save your password. Please try again.");
                submit.disabled = false;
            } finally {
                saving = false;
            }
        });

        try {
            client = await window.JayceeAuth.getSupabaseClient();
            // getSession waits for Supabase to finish processing the invitation URL.
            const { data, error } = await client.auth.getSession();
            if (error || !data.session?.user) throw new Error("This invitation is invalid or has expired. Please request a new invitation.");
            userId = data.session.user.id;
            let owner;
            try { owner = window.sessionStorage.getItem(key); } catch { /* Optional storage. */ }
            if (owner && owner !== "pending" && owner !== userId) {
                clearPending();
                dialog.remove();
                return;
            }
            try { window.sessionStorage.setItem(key, userId); } catch { /* Optional storage. */ }
            setText(status, "");
            submit.disabled = false;
            password.focus();
        } catch (error) {
            setText(status, error?.message || "Could not check your invitation. Please reload to try again.");
            exit.hidden = false;
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else void init();
})();
