export async function initOAuthConsent({ win = window, doc = document } = {}) {
    const status = doc.querySelector("[data-consent-status]");
    const details = doc.querySelector("[data-consent-details]");
    const approve = doc.querySelector("[data-consent-approve]");
    const deny = doc.querySelector("[data-consent-deny]");
    const switchAccount = doc.querySelector("[data-consent-switch]");
    const recovery = doc.querySelector("[data-consent-recovery]");
    doc.querySelector("[data-consent-retry]")?.addEventListener("click", () => win.location.reload());
    const authorizationId = new URLSearchParams(win.location.search).get("authorization_id");
    const returnPath = `/oauth-consent.html?authorization_id=${encodeURIComponent(authorizationId || "")}`;
    const loginPath = `/login.html?redirect=${encodeURIComponent(returnPath)}`;
    try {
        if (!authorizationId) throw new Error("This connection request is missing its authorization ID.");
        const client = await win.JayceeAuth.getSupabaseClient();
        const { data: { user }, error: userError } = await client.auth.getUser();
        // A network/server failure does not mean the user needs to log in.
        // Keep this request on screen so it can be retried without a redirect loop.
        if (userError && userError.name !== "AuthSessionMissingError"
            && (!userError.status || userError.status >= 500)) throw userError;
        if (userError || !user) {
            win.location.replace(loginPath);
            return;
        }
        switchAccount?.addEventListener("click", async () => {
            if (approve.disabled || deny.disabled) return;
            approve.disabled = deny.disabled = switchAccount.disabled = true;
            try {
                const { error } = await client.auth.signOut({ scope: "local" });
                if (error) throw error;
                win.location.assign(loginPath);
            } catch (error) {
                status.textContent = error.message || "Could not switch accounts. Please try again.";
                approve.disabled = deny.disabled = switchAccount.disabled = false;
            }
        });
        const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
        if (error) throw error;
        if (data?.redirect_url && !("authorization_id" in data)) {
            const redirect = new URL(data.redirect_url);
            if (redirect.protocol !== "https:" && !(redirect.protocol === "http:"
                && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname))) {
                throw new Error("The authorization server returned an unexpected return address.");
            }
            doc.querySelector("[data-consent-client]").textContent = "Your application";
            doc.querySelector("[data-consent-scopes]").textContent = "Same permissions as your previous connection";
            doc.querySelector("[data-consent-redirect]").textContent = redirect.origin + redirect.pathname;
            status.textContent = `Signed in as ${user.email || "your game account"}. Ready to reconnect. Continue to finish connecting your account.`;
            approve.textContent = "Reconnect account";
            details.hidden = false;
            approve.addEventListener("click", () => win.location.assign(redirect.href));
            deny.addEventListener("click", () => win.location.assign("/"));
            return;
        }
        if (!data || !("authorization_id" in data)) throw new Error("This connection request is no longer available.");
        doc.querySelector("[data-consent-client]").textContent = data.client.name || "This application";
        doc.querySelector("[data-consent-scopes]").textContent = data.scope || "None";
        doc.querySelector("[data-consent-redirect]").textContent = data.redirect_uri;
        status.textContent = `Signed in as ${user.email || "your game account"}.`;
        details.hidden = false;
        const decide = async (approved) => {
            if (approve.disabled || deny.disabled) return;
            approve.disabled = deny.disabled = true;
            if (switchAccount) switchAccount.disabled = true;
            status.textContent = approved ? "Connecting your account…" : "Cancelling the connection…";
            try {
                const response = approved
                    ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
                    : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
                if (response.error) throw response.error;
                const redirect = new URL(response.data.redirect_url);
                const registered = new URL(data.redirect_uri);
                if (redirect.origin !== registered.origin || redirect.pathname !== registered.pathname
                    || !["https:", "http:"].includes(redirect.protocol)
                    || (redirect.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname))) {
                    throw new Error("The authorization server returned an unexpected return address.");
                }
                win.location.assign(redirect.href);
            } catch (error) {
                status.textContent = error.message || "The connection could not be completed.";
                approve.disabled = deny.disabled = false;
                if (switchAccount) switchAccount.disabled = false;
            }
        };
        approve.addEventListener("click", () => { void decide(true); });
        deny.addEventListener("click", () => { void decide(false); });
    } catch (error) {
        details.hidden = true;
        status.textContent = error.message || "This connection request could not be loaded.";
        if (recovery) recovery.hidden = false;
    }
}

if (document.querySelector("[data-consent-status]")) void initOAuthConsent();
