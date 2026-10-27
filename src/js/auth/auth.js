(function () {
    const defaultLoginPath = "/login.html";
    const defaultAfterSignInPath = "/game.html";
    let supabaseClientPromise = null;
    let accessCheck = null;
    let accessTimer = null;
    let lockSignOut = null;

    async function signOutLockedAccount(redirect = true) {
        if (!lockSignOut) {
            lockSignOut = (async () => {
                window.clearTimeout(accessTimer);
                const client = await getSupabaseClient();
                // Sessions have already been revoked on the server. Clear local state too.
                await client.auth.signOut({ scope: "local" });
                if (redirect) window.location.replace("/");
            })().finally(() => { lockSignOut = null; });
        }
        return lockSignOut;
    }

    async function checkAccountAccess({ redirect = true } = {}) {
        if (accessCheck) return accessCheck;
        accessCheck = (async () => {
            const client = await getSupabaseClient();
            const { data: sessionData } = await client.auth.getSession();
            if (!sessionData.session) return true;
            const { data, error } = await client.rpc("check_account_access");
            if (error) throw error;
            if (data?.locked) {
                await signOutLockedAccount(redirect);
                return false;
            }
            window.clearTimeout(accessTimer);
            const deadline = Date.parse(data?.deadline || "");
            // Refresh periodically for admin locks and schedule a check at the quest deadline.
            const delay = Number.isFinite(deadline)
                ? Math.min(30000, Math.max(100, deadline - Date.now() + 50)) : 30000;
            accessTimer = window.setTimeout(() => {
                void checkAccountAccess().catch(() => {});
            }, delay);
            return true;
        })().catch((error) => {
            window.clearTimeout(accessTimer);
            accessTimer = window.setTimeout(() => { void checkAccountAccess().catch(() => {}); }, 5000);
            throw error;
        }).finally(() => { accessCheck = null; });
        return accessCheck;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existingScript = document.querySelector(`script[src="${src}"]`);

            if (existingScript) {
                existingScript.addEventListener("load", resolve, { once: true });
                existingScript.addEventListener("error", reject, { once: true });
                if (window.supabase) {
                    resolve();
                }
                return;
            }

            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.addEventListener("load", resolve, { once: true });
            script.addEventListener("error", reject, { once: true });
            document.head.append(script);
        });
    }

    async function getSupabaseClient() {
        if (!supabaseClientPromise) {
            const config = window.JayceeConfig;
            if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
                throw new Error("Missing app configuration. Load app-config.js before auth.js.");
            }
            supabaseClientPromise = loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0")
                .then(() => window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey));
        }

        return supabaseClientPromise;
    }

    function getCurrentUrl(path = window.location.pathname) {
        return new URL(path, window.location.origin).href;
    }

    // Resolve before checking the origin: browsers normalize backslashes and dot segments.
    function getReturnPath(value = new URLSearchParams(window.location.search).get("redirect")) {
        if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) return "";
        try {
            const url = new URL(value, window.location.origin);
            return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : "";
        } catch {
            return "";
        }
    }

    function withAuthRedirect(path) {
        const returnPath = getReturnPath();
        if (!returnPath) return path;
        const url = new URL(path, window.location.origin);
        url.searchParams.set("redirect", returnPath);
        return `${url.pathname}${url.search}${url.hash}`;
    }

    function isConnectionReturn(path = getReturnPath()) {
        if (!path) return false;
        const url = new URL(path, window.location.origin);
        return url.pathname === "/oauth-consent.html" && Boolean(url.searchParams.get("authorization_id"));
    }

    function getAfterSignInUrl(path = getReturnPath() || defaultAfterSignInPath) {
        return getCurrentUrl(path);
    }

    function getLoginUrl(path = defaultLoginPath) {
        return getCurrentUrl(withAuthRedirect(path));
    }

    async function signUp(email, password, options = {}) {
        const client = await getSupabaseClient();
        const result = await client.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: options.emailRedirectTo || getCurrentUrl(defaultLoginPath),
                data: { ...options.data, referral_username: window.JayceeReferral?.getUsername() || null },
            },
        });

        if (!result.error && result.data?.user && result.data.user.identities?.length !== 0) {
            window.JayceeReferral?.clear();
        }

        return result;
    }

    async function signIn(email, password) {
        const client = await getSupabaseClient();
        const result = await client.auth.signInWithPassword({ email, password });
        if (result.error?.code === "user_banned") {
            result.error.message = "This account is locked. Please contact the administrator.";
        }
        if (!result.error && result.data?.session) {
            try {
                if (await checkAccountAccess({ redirect: false })) {
                    window.JayceeReferral?.clear();
                    return result;
                }
            } catch (error) {
                await signOutLockedAccount(false);
                return { data: { user: null, session: null }, error };
            }
            return { data: { user: null, session: null }, error: {
                code: "account_locked", message: "This account is locked. Please contact the administrator."
            } };
        }
        return result;
    }

    async function getSession() {
        const client = await getSupabaseClient();
        const result = await client.auth.getSession();
        if (result.data?.session && !await checkAccountAccess()) {
            return { data: { session: null }, error: null };
        }
        return result;
    }

    async function signOut() {
        const client = await getSupabaseClient();
        return client.auth.signOut();
    }

    async function init() {
        if (isConnectionReturn()) {
            document.querySelectorAll('a[href="/login.html"], a[href="/signup.html"]').forEach((link) => {
                link.setAttribute("href", withAuthRedirect(link.getAttribute("href")));
            });
        }
        const client = await getSupabaseClient();
        try {
            await checkAccountAccess();
        } catch (error) {
            console.warn("Account access could not be checked", error);
        }

        client.auth.onAuthStateChange((_event, session) => {
            window.clearTimeout(accessTimer);
            if (session?.user) {
                window.JayceeReferral?.clear();
                // Auth callbacks must not await another Auth operation.
                window.setTimeout(() => { void checkAccountAccess().catch(() => {}); }, 0);
            }
        });
        window.addEventListener("online", () => { void checkAccountAccess().catch(() => {}); });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") void checkAccountAccess().catch(() => {});
        });
    }

    window.JayceeAuth = {
        checkAccountAccess,
        getSupabaseClient,
        getAfterSignInUrl,
        getLoginUrl,
        getReturnPath,
        getSession,
        isConnectionReturn,
        signIn,
        signOut,
        signOutLockedAccount,
        signUp,
        withAuthRedirect,
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
