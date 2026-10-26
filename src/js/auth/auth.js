(function () {
    const defaultLoginPath = "/login.html";
    const defaultSignupPath = "/signup.html";
    const defaultAccountPath = "/game.html";
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
                setBannerSignedOut();
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

    function canAccessSignup(now = Date.now()) {
        try {
            const prayer = JSON.parse(window.localStorage.getItem("pending_prayer") || "null");
            const name = window.localStorage.getItem("player_full_name")?.trim();
            const submittedAt = Date.parse(prayer?.created_at || "");

            return Boolean(name && prayer && !prayer.signup_consumed_at
                && typeof prayer.problem === "string" && prayer.problem.trim()
                && typeof prayer.prayer === "string" && prayer.prayer.trim()
                && prayer.username === name && Number.isFinite(submittedAt)
                && submittedAt <= now && now - submittedAt <= 24 * 60 * 60 * 1000);
        } catch {
            return false;
        }
    }

    function consumeSignupEligibility() {
        try {
            const prayer = JSON.parse(window.localStorage.getItem("pending_prayer") || "null");

            if (prayer) {
                prayer.signup_consumed_at = new Date().toISOString();
                window.localStorage.setItem("pending_prayer", JSON.stringify(prayer));
            }
        } catch {
            // Account creation has succeeded even if browser storage is unavailable.
        }
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

    function getAfterSignInUrl(path = defaultAfterSignInPath) {
        return getCurrentUrl(path);
    }

    function getLoginUrl(path = defaultLoginPath) {
        return getCurrentUrl(path);
    }

    function getAuthUrl(mode = "login", path = mode === "signup" ? defaultSignupPath : defaultLoginPath) {
        const url = new URL(path, window.location.origin);
        if (mode !== "login" && path === defaultLoginPath) {
            url.searchParams.set("mode", mode);
        }
        return url.href;
    }

    function getAccountUrl(path = defaultAccountPath) {
        return getCurrentUrl(path);
    }

    function getDisplayName(user) {
        return user?.user_metadata?.full_name || user?.email || "Account";
    }

    function getPublicProfileUrl(username) {
        const value = getDisplayValue(username);

        return value ? `/game.html?username=${encodeURIComponent(value)}` : "";
    }

    function getDisplayValue(value) {
        return value === null || value === undefined ? "" : String(value).trim();
    }

    async function getProfileSettings(user) {
        if (!user?.id) {
            return null;
        }

        try {
            const client = await getSupabaseClient();
            const { data, error } = await client
                .from("profiles")
                .select("username")
                .eq("id", user.id)
                .maybeSingle();

            if (error) {
                return null;
            }

            return data || null;
        } catch {
            return null;
        }
    }

    function setBannerSignedOut() {
        document.querySelectorAll("jaycee-banner").forEach((banner) => {
            banner.removeAttribute("auth-state");
            banner.removeAttribute("public-profile-url");
            banner.removeAttribute("user-name");
            banner.connectedCallback();
        });
    }

    function setBannerSignedIn(user, displayName = getDisplayName(user), publicProfileUrl = "") {
        document.querySelectorAll("jaycee-banner").forEach((banner) => {
            banner.setAttribute("auth-state", "signed-in");
            if (publicProfileUrl) {
                banner.setAttribute("public-profile-url", publicProfileUrl);
            } else {
                banner.removeAttribute("public-profile-url");
            }
            banner.setAttribute("user-name", displayName);
            banner.connectedCallback();
        });
    }

    async function refreshHeader() {
        const client = await getSupabaseClient();
        const { data } = await client.auth.getSession();

        if (data.session?.user) {
            window.JayceeReferral?.clear();
            const profile = await getProfileSettings(data.session.user);

            setBannerSignedIn(
                data.session.user,
                profile?.username || getDisplayName(data.session.user),
                getPublicProfileUrl(profile?.username)
            );
        } else {
            setBannerSignedOut();
        }
    }

    async function signUp(email, password, options = {}) {
        if (!canAccessSignup()) {
            return { data: { user: null, session: null }, error: { message: "Please complete the prayer first.", code: "prayer_required" } };
        }
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
            consumeSignupEligibility();
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
        const result = await client.auth.signOut();
        await refreshHeader();
        return result;
    }

    async function init() {
        const client = await getSupabaseClient();
        try {
            await checkAccountAccess();
        } catch (error) {
            console.warn("Account access could not be checked", error);
        }
        await refreshHeader();

        client.auth.onAuthStateChange((_event, session) => {
            window.clearTimeout(accessTimer);
            if (session?.user) {
                // Auth callbacks must not await another Auth operation.
                window.setTimeout(() => { void checkAccountAccess().catch(() => {}); }, 0);
                getProfileSettings(session.user)
                    .then((profile) => {
                        setBannerSignedIn(
                            session.user,
                            profile?.username || getDisplayName(session.user),
                            getPublicProfileUrl(profile?.username)
                        );
                    });
            } else {
                setBannerSignedOut();
            }
        });
        window.addEventListener("online", () => { void checkAccountAccess().catch(() => {}); });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") void checkAccountAccess().catch(() => {});
        });
    }

    window.JayceeAuth = {
        canAccessSignup,
        checkAccountAccess,
        getSupabaseClient,
        getAfterSignInUrl,
        getAccountUrl,
        getAuthUrl,
        getLoginUrl,
        getSession,
        refreshHeader,
        signIn,
        signOut,
        signOutLockedAccount,
        signUp,
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
