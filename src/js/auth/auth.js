(function () {
    const supabaseUrl = "https://ndtnfwyfdfdcxljvvjfd.supabase.co";
    const supabasePublishableKey = "sb_publishable_lMEHC2xjlGGmTnkI5G-okg_0AVRhiDd";
    const defaultAuthPath = "/auth.html";
    const defaultAccountPath = "/account.html";
    const defaultAfterSignInPath = "/";
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

    function getAuthUrl(mode = "login", path = defaultAuthPath) {
        const url = new URL(path, window.location.origin);
        url.searchParams.set("mode", mode);
        return url.href;
    }

    function getAccountUrl(path = defaultAccountPath) {
        return getCurrentUrl(path);
    }

    function getDisplayName(user) {
        return user?.user_metadata?.name || user?.email || "Account";
    }

    function setBannerSignedOut() {
        document.querySelectorAll("jaycee-banner").forEach((banner) => {
            const loginHref = banner.getAttribute("login-href") || getAuthUrl("login");
            const signupHref = banner.getAttribute("signup-href") || getAuthUrl("signup");

            banner.setAttribute("login-href", loginHref);
            banner.setAttribute("signup-href", signupHref);
            banner.removeAttribute("auth-state");
            banner.removeAttribute("user-name");
            banner.connectedCallback();
        });
    }

    function setBannerSignedIn(user) {
        document.querySelectorAll("jaycee-banner").forEach((banner) => {
            const accountHref = banner.getAttribute("account-href") || getAccountUrl();

            banner.setAttribute("auth-state", "signed-in");
            banner.setAttribute("account-href", accountHref);
            banner.setAttribute("user-name", getDisplayName(user));
            banner.connectedCallback();
        });
    }

    async function refreshHeader() {
        const client = await getSupabaseClient();
        const { data } = await client.auth.getSession();

        if (data.session?.user) {
            setBannerSignedIn(data.session.user);
        } else {
            setBannerSignedOut();
        }
    }

    async function signUp(email, password, options = {}) {
        const client = await getSupabaseClient();
        return client.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: options.emailRedirectTo || getCurrentUrl(defaultAuthPath),
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
                setBannerSignedIn(session.user);
            } else {
                setBannerSignedOut();
            }
        });
    }

    window.JayceeAuth = {
        getSupabaseClient,
        getAfterSignInUrl,
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
