(function () {
    // Public browser settings only. Secrets belong on the backend.
    const production = {
        environment: "production",
        supabaseUrl: "https://ndtnfwyfdfdcxljvvjfd.supabase.co",
        supabasePublishableKey: "sb_publishable_lMEHC2xjlGGmTnkI5G-okg_0AVRhiDd"
    };
    const development = {
        environment: "development",
        supabaseUrl: "https://mylnagvqngsgcmlvwttu.supabase.co",
        supabasePublishableKey: "sb_publishable_JeP4VhIhDG1e9Qegxhk5AA_lGuA7uAb"
    };
    // Local servers and preview deployments always use the isolated dev project.
    const config = window.location.hostname === "magic.jaycee.ai" ? production : development;
    window.JayceeConfig = Object.freeze(config);
})();
