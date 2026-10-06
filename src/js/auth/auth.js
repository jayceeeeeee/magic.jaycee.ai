(function () {
    const supabaseUrl = "https://ndtnfwyfdfdcxljvvjfd.supabase.co";
    const supabasePublishableKey = "sb_publishable_lMEHC2xjlGGmTnkI5G-okg_0AVRhiDd";
    const defaultLoginPath = "/src/html/auth/login.html";
    const defaultAccountPath = "/src/html/jaycee-dashboard.html";
    const defaultAfterSignInPath = "/src/html/jaycee-dashboard.html";
    const themeConfig = window.JayceeThemes || {
        normalizeTheme: () => "aurora",
    };
    let supabaseClientPromise = null;

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
            supabaseClientPromise = loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2")
                .then(() => window.supabase.createClient(supabaseUrl, supabasePublishableKey));
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

    function getAuthUrl(mode = "login", path = defaultLoginPath) {
        const url = new URL(path, window.location.origin);
        if (mode !== "login") {
            url.searchParams.set("mode", mode);
        }
        return url.href;
    }

    function getAccountUrl(path = defaultAccountPath) {
        return getCurrentUrl(path);
    }

    function getDisplayName(user) {
        return user?.user_metadata?.name || user?.email || "Account";
    }

    function getPublicProfileUrl(username) {
        const value = getDisplayValue(username);

        return value ? `/src/html/jaycee-${encodeURIComponent(value)}.html` : "";
    }

    function getDisplayValue(value) {
        return value === null || value === undefined ? "" : String(value).trim();
    }

    function getProfileThemeValue(profile) {
        return themeConfig.normalizeTheme(getDisplayValue(profile?.theme));
    }

    function applyTheme(profile) {
        const theme = getProfileThemeValue(profile);

        document.body.dataset.theme = theme;
    }

    async function getProfileSettings(user) {
        if (!user?.id) {
            return null;
        }

        try {
            const client = await getSupabaseClient();
            const { data, error } = await client
                .from("profiles")
                .select("username, theme")
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
            const profile = await getProfileSettings(data.session.user);

            applyTheme(profile);
            setBannerSignedIn(
                data.session.user,
                profile?.username || getDisplayName(data.session.user),
                getPublicProfileUrl(profile?.username)
            );
        } else {
            applyTheme(null);
            setBannerSignedOut();
        }
    }

    async function signUp(email, password, options = {}) {
        const client = await getSupabaseClient();
        return client.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: options.emailRedirectTo || getCurrentUrl(defaultLoginPath),
                data: options.data || {},
            },
        });
    }

    async function signIn(email, password) {
        const client = await getSupabaseClient();
        return client.auth.signInWithPassword({ email, password });
    }

    async function getSession() {
        const client = await getSupabaseClient();
        return client.auth.getSession();
    }

    async function signOut() {
        const client = await getSupabaseClient();
        const result = await client.auth.signOut();
        await refreshHeader();
        return result;
    }

    async function init() {
        const client = await getSupabaseClient();
        await refreshHeader();

        client.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                getProfileSettings(session.user)
                    .then((profile) => {
                        applyTheme(profile);
                        setBannerSignedIn(
                            session.user,
                            profile?.username || getDisplayName(session.user),
                            getPublicProfileUrl(profile?.username)
                        );
                    });
            } else {
                applyTheme(null);
                setBannerSignedOut();
            }
        });
    }

    window.JayceeAuth = {
        applyTheme,
        getSupabaseClient,
        getAfterSignInUrl,
        getAccountUrl,
        getAuthUrl,
        getLoginUrl,
        getSession,
        refreshHeader,
        signIn,
        signOut,
        signUp,
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
