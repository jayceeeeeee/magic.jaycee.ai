(function () {
    const storageKey = "jaycee.pending_referral";
    const normalize = (value) => typeof value === "string" && value.trim().length <= 100 ? value.trim() : "";
    let pending = "";
    try { pending = normalize(window.localStorage.getItem(storageKey)); } catch { /* URL fallback below. */ }

    function capture() {
        const username = normalize(new URL(window.location.href).searchParams.get("ref"));
        if (username) {
            pending = username;
            try { window.localStorage.setItem(storageKey, username); } catch { /* Keep it in the workflow URLs. */ }
        }
        return pending;
    }

    function withReferral(path) {
        const url = new URL(path, window.location.href);
        if (pending && url.origin === window.location.origin && !url.searchParams.has("ref")) {
            url.searchParams.set("ref", pending);
        }
        return url.href;
    }

    function createLink(username) {
        const value = normalize(username);
        if (!value) return "";
        const url = new URL("/", window.location.origin);
        url.searchParams.set("ref", value);
        return url.href;
    }

    function clear() {
        pending = "";
        try { window.localStorage.removeItem(storageKey); } catch { /* Optional storage. */ }
    }

    window.JayceeReferral = { capture, getUsername: () => pending, withReferral, createLink, clear };
    capture();
})();
