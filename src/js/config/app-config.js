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
        supabasePublishableKey: "sb_publishable_JeP4VhIhDG1e9Qegxhk5AA_lGuA7uAb",
        masterAccountIds: Object.freeze({
            "d70b5c69-daae-4a77-9955-4385439ae292": "89cf977d-ecc0-4dbb-8f4f-fe6b9d7067c5",
            "b7a38b31-100f-4e03-b3e8-9357c635ecf8": "0ad611ab-73ad-4ece-a11c-09b13bf5db5d",
            "7abd58ec-1289-403d-932c-dc2df233d079": "50edc493-a776-41f6-b5e3-0e2d78eff070",
            "5dd4e584-2f03-4a94-b442-528ca19492e1": "59008ad4-5675-4d25-bdad-ebeea9cd8419"
        })
    };
    // Local servers and preview deployments always use the isolated dev project.
    const config = window.location.hostname === "magic.jaycee.ai" ? production : development;
    window.JayceeConfig = Object.freeze(config);
})();
