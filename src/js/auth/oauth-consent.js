import { t, message, setText } from '../i18n.js';
export async function initOAuthConsent({ win = window, doc = document } = {}) {
    const status = doc.querySelector("[data-consent-status]");
    const details = doc.querySelector("[data-consent-details]");
    const approve = doc.querySelector("[data-consent-approve]");
    const deny = doc.querySelector("[data-consent-deny]");
    const switchAccount = doc.querySelector("[data-consent-switch]");
    const accountChoice = doc.querySelector("[data-consent-account]");
    const continueAccount = doc.querySelector("[data-consent-continue]");
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
        let choosingAccount = true;
        switchAccount?.addEventListener("click", async () => {
            if (!choosingAccount || continueAccount.disabled) return;
            continueAccount.disabled = true;
            approve.disabled = deny.disabled = switchAccount.disabled = true;
            try {
                const { error } = await client.auth.signOut({ scope: "local" });
                if (error) throw error;
                win.location.assign(loginPath);
            } catch (error) {
                setText(status, error.message || "Could not switch accounts. Please try again.");
                approve.disabled = deny.disabled = switchAccount.disabled = false;
                continueAccount.disabled = false;
            }
        });
        // Loading authorization details can auto-approve an existing grant and
        // bind this request to the current user. Choose the account BEFORE that
        // call so switching accounts preserves a pending authorization request.
        setText(status, message('Signed in as {account}.', { account: user.email || t('your game account') }));
        accountChoice.hidden = false;
        await new Promise(resolve => {
            continueAccount.addEventListener("click", () => {
                if (!choosingAccount || continueAccount.disabled) return;
                choosingAccount = false;
                continueAccount.disabled = switchAccount.disabled = true;
                accountChoice.hidden = true;
                setText(status, "Loading the connection request…");
                resolve();
            });
        });
        const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
        if (error) throw error;
        if (data?.redirect_url && !("authorization_id" in data)) {
            const redirect = new URL(data.redirect_url);
            if (redirect.protocol !== "https:" && !(redirect.protocol === "http:"
                && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname))) {
                throw new Error("The authorization server returned an unexpected return address.");
            }
            // The Connect click already confirmed this account. A remembered
            // grant needs no second confirmation before returning to the app.
            win.location.assign(redirect.href);
            return;
        }
        if (!data || !("authorization_id" in data)) throw new Error("This connection request is no longer available.");
        if (data.client.name) doc.querySelector("[data-consent-client]").textContent = data.client.name;
        else setText(doc.querySelector("[data-consent-client]"), "This application");
        if (data.scope) doc.querySelector("[data-consent-scopes]").textContent = data.scope;
        else setText(doc.querySelector("[data-consent-scopes]"), "None");
        doc.querySelector("[data-consent-redirect]").textContent = data.redirect_uri;
        setText(status, message('Signed in as {account}.', { account: user.email || t('your game account') }));
        const decide = async (approved) => {
            if (approve.disabled || deny.disabled) return;
            approve.disabled = deny.disabled = true;
            if (switchAccount) switchAccount.disabled = true;
            setText(status, approved ? "Connecting your account…" : "Cancelling the connection…");
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
                details.hidden = false;
                setText(status, error.message || "The connection could not be completed.");
                approve.disabled = deny.disabled = false;
                if (switchAccount) switchAccount.disabled = false;
            }
        };
        approve.addEventListener("click", () => { void decide(true); });
        deny.addEventListener("click", () => { void decide(false); });
        // Connect consents to the identity and session permissions explained on
        // the first screen. ChatGPT requests all four, including on first signup.
        // Other permissions still need a separate review before approval.
        const scopes = String(data.scope || "").trim().split(/\s+/).filter(Boolean);
        const explainedScopes = new Set(["openid", "email", "offline_access", "profile"]);
        if (scopes.length > 0 && scopes.every(scope => explainedScopes.has(scope))) {
            await decide(true);
        } else {
            details.hidden = false;
        }
    } catch (error) {
        accountChoice.hidden = true;
        details.hidden = true;
        setText(status, error.message || "This connection request could not be loaded.");
        if (recovery) recovery.hidden = false;
    }
}

if (document.querySelector("[data-consent-status]")) void initOAuthConsent();
