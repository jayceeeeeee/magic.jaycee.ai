(function () {
    const birthProfileKey = "birthProfile";
    const userImagesBucket = "users";

    function loadBirthProfile() {
        try {
            const savedProfile = localStorage.getItem(birthProfileKey);

            return savedProfile ? JSON.parse(savedProfile) : null;
        } catch {
            return null;
        }
    }

    function isExistingAccountSignupResult(result) {
        const identities = result?.data?.user?.identities;

        return Array.isArray(identities) && identities.length === 0;
    }

    function isExistingAccountError(error) {
        return /already|registered|exists/i.test(error?.message || "");
    }

    function getDisplayValue(value) {
        return value === null || value === undefined ? "" : String(value).trim();
    }

    function getStoragePathFromImage(image, bucketName) {
        if (/^https?:\/\//i.test(image)) {
            const url = new URL(image);
            const bucketPrefix = `/storage/v1/object/public/${bucketName}/`;
            const prefixIndex = url.pathname.indexOf(bucketPrefix);

            if (prefixIndex === -1) return "";

            return url.pathname.slice(prefixIndex + bucketPrefix.length);
        }

        return getDisplayValue(image).replace(new RegExp(`^${bucketName}/`), "");
    }

    async function getAvatarImageUrl(client, profile) {
        const image = getDisplayValue(profile?.avatar_path);

        if (!profile?.id || !image) return "";

        const rawStoragePath = getStoragePathFromImage(image, userImagesBucket)
            .replace(/^\/+/, "")
            .replace(/\+/g, " ");
        const storagePath = rawStoragePath.includes("/")
            ? rawStoragePath
            : `${profile.id}/${rawStoragePath}`;

        if (!storagePath) return "";

        const { data, error } = await client.storage
            .from(userImagesBucket)
            .createSignedUrl(storagePath, 60 * 60);

        if (error) throw error;

        return data?.signedUrl || "";
    }

    async function fetchAdminProfile(client) {
        const { data, error } = await client
            .from("profiles")
            .select("id, username, avatar_path, role")
            .eq("role", "admin")
            .not("username", "is", null)
            .limit(1);

        if (error) throw error;

        return (data || []).find((profile) => getDisplayValue(profile.username)) || null;
    }

    function createAdminCard(profile, avatarUrl = "") {
        const card = document.createElement("span");
        const avatar = document.createElement("span");
        const name = document.createElement("span");
        const username = getDisplayValue(profile?.username) || "Cedricjbt";

        card.className = "auth-admin-card";
        avatar.className = "auth-admin-card-avatar";
        name.className = "auth-admin-card-name";
        name.textContent = username;

        if (avatarUrl) {
            const image = document.createElement("img");

            image.alt = "";
            image.src = avatarUrl;
            avatar.append(image);
        } else {
            avatar.textContent = username.slice(0, 1).toUpperCase();
        }

        card.append(avatar, name);

        return card;
    }

    async function renderSignupAdminConsole() {
        const usernameElement = document.querySelector("[data-signup-admin-username]");
        const cardTarget = document.querySelector("[data-signup-admin-card]");

        if (!cardTarget || !window.JayceeAuth) return;

        try {
            const client = await window.JayceeAuth.getSupabaseClient();
            const profile = await fetchAdminProfile(client);
            const username = getDisplayValue(profile?.username) || "Cedricjbt";
            const avatarUrl = profile ? await getAvatarImageUrl(client, profile) : "";

            if (usernameElement) {
                usernameElement.textContent = username;
            }
            cardTarget.replaceWith(createAdminCard(profile, avatarUrl));
        } catch (error) {
            console.warn("Jaycee signup admin profile could not be loaded", error);
            cardTarget.replaceWith(createAdminCard(null));
        }
    }

    function initAuthPage() {
        const params = new URLSearchParams(window.location.search);
        const form = document.querySelector("[data-auth-form]");
        let mode = form?.dataset.authMode || (params.get("mode") === "signup" ? "signup" : "login");
        const title = document.querySelector("#auth-title");
        const submit = document.querySelector(".auth-submit");
        const status = document.querySelector("[data-auth-status]");
        const switcher = document.querySelector("[data-auth-switch]");
        const password = form?.elements.password;
        const fullName = form?.elements.full_name;
        const signupFields = [...document.querySelectorAll("[data-auth-signup-field]")];
        const redirectPath = params.get("redirect");
        const fullNameParam = String(params.get("full_name") || params.get("username") || "").trim();

        if (!form || !title || !submit || !status || !switcher || !password || !fullName || !window.JayceeAuth) {
            return;
        }

        function guardSignup() {
            if (mode === "signup" && !window.JayceeAuth.canAccessSignup()) {
                window.location.replace("/");
                return false;
            }
            return true;
        }

        if (!guardSignup()) return;
        const signupGate = document.querySelector("[data-signup-gate]");
        if (signupGate) signupGate.hidden = false;
        window.addEventListener("pageshow", guardSignup);

        if (fullNameParam) {
            fullName.value = fullNameParam;
        }

        function createAuthHref(path, nextMode) {
            const nextParams = new URLSearchParams();

            if (redirectPath?.startsWith("/") && !redirectPath.startsWith("//")) {
                nextParams.set("redirect", redirectPath);
            }
            if (nextMode === "signup" && fullName.value.trim()) {
                nextParams.set("full_name", fullName.value.trim());
            }

            const query = nextParams.toString();

            return query ? `${path}?${query}` : path;
        }

        function showExistingAccountMessage() {
            status.textContent = "An account with this email already exists.";
            switcher.innerHTML = `Already have an account? <a href="${createAuthHref("/login.html", "login")}" data-auth-mode="login">Log in instead</a>.`;
        }

        function renderMode() {
            const isSignup = mode === "signup";

            submit.textContent = isSignup ? "Sign up" : "Log in";
            password.autocomplete = isSignup ? "new-password" : "current-password";
            fullName.required = isSignup;
            signupFields.forEach((field) => {
                field.hidden = !isSignup;
            });
            form.hidden = false;
            switcher.hidden = false;
            switcher.innerHTML = isSignup
                ? `Already have an account? <a href="${createAuthHref("/login.html", "login")}" data-auth-mode="login">Log in</a>`
                : 'No account yet? <a href="/">Sign up</a>';
            status.textContent = "";
        }

        switcher.addEventListener("click", (event) => {
            const link = event.target.closest("a[data-auth-mode]");

            if (!link) {
                return;
            }

            event.preventDefault();
            mode = link.dataset.authMode === "signup" ? "signup" : "login";
            if (link.pathname !== window.location.pathname) {
                window.location.href = link.href;
                return;
            }
            const nextParams = new URLSearchParams(window.location.search);

            if (mode === "signup") {
                nextParams.set("mode", mode);
            } else {
                nextParams.delete("mode");
            }
            const nextQuery = nextParams.toString();

            window.history.replaceState({}, "", nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname);
            renderMode();
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!guardSignup()) return;
            if (submit.disabled) return;
            status.textContent = "";
            submit.disabled = true;

            const formData = new FormData(form);
            const fullNameValue = String(formData.get("full_name") || "").trim();
            const email = String(formData.get("email")).trim();
            const passwordValue = String(formData.get("password"));
            const birthProfile = loadBirthProfile();

            let result;
            try {
                result = mode === "signup"
                    ? await window.JayceeAuth.signUp(email, passwordValue, {
                        data: {
                            full_name: fullNameValue || birthProfile?.fullName || "",
                            birth_profile: birthProfile,
                        },
                    })
                    : await window.JayceeAuth.signIn(email, passwordValue);
            } catch (error) {
                status.textContent = error?.message || "Could not connect. Please try again.";
                return;
            } finally {
                submit.disabled = false;
            }

            if (result.error) {
                if (result.error.code === "prayer_required") {
                    window.location.replace("/");
                    return;
                }
                if (mode === "signup" && isExistingAccountError(result.error)) {
                    showExistingAccountMessage();
                    return;
                }

                status.textContent = result.error.message;
                return;
            }

            if (mode === "signup" && isExistingAccountSignupResult(result)) {
                showExistingAccountMessage();
                return;
            }

            if (mode === "signup" && !result.data.session) {
                status.textContent = "Check your email to confirm your account.";
                return;
            }

            status.textContent = "You are logged in.";
            window.JayceeAuth.refreshHeader();
            window.location.href = redirectPath?.startsWith("/") && !redirectPath.startsWith("//")
                ? window.JayceeAuth.getAfterSignInUrl(redirectPath)
                : window.JayceeAuth.getAfterSignInUrl();
        });

        renderMode();
        if (mode === "signup") {
            renderSignupAdminConsole();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAuthPage);
    } else {
        initAuthPage();
    }
})();
