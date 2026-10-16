(function () {
    const projectUrl = "https://nrmfmvpjfmimiaemlmcd.supabase.co";
    const publishableKey = "sb_publishable_ip_vW1wIEqyiJtivtIyTsA_vXZLXcNI";

    window.scholarlyPublicConfig = { projectUrl, publishableKey };
    if (document.currentScript?.dataset.restOnly === "true") return;

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        window.scholarlySupabase = null;
        window.scholarlySupabaseError = "The Supabase client could not be loaded. Check your internet connection and reload the page.";
        return;
    }

    let options;
    if (document.currentScript?.dataset.adminAuth === "true") {
        const sessionKey = "scholarly-admin-auth-v1";
        const preferenceKey = "scholarly-admin-remember-v1";
        const memory = new Map();
        let remember = false;
        try { remember = window.localStorage.getItem(preferenceKey) === "true"; } catch (_) {}
        const checkbox = document.querySelector("#admin-remember-me");
        if (checkbox) checkbox.checked = remember;

        function selectedStorage() {
            return remember ? window.localStorage : window.sessionStorage;
        }
        const storage = {
            getItem(key) {
                if (memory.has(key)) return memory.get(key);
                try { return selectedStorage().getItem(key); } catch (_) { return null; }
            },
            setItem(key, value) {
                try {
                    selectedStorage().setItem(key, value);
                    memory.delete(key);
                } catch (_) {
                    // Blocked/full browser storage falls back to this page's memory.
                    memory.set(key, value);
                }
            },
            removeItem(key) {
                memory.delete(key);
                // Explicit sign-out removes both remembered and tab-only sessions.
                try { window.localStorage.removeItem(key); } catch (_) {}
                try { window.sessionStorage.removeItem(key); } catch (_) {}
            }
        };
        window.scholarlySetAdminRemember = function (enabled) {
            storage.removeItem(sessionKey);
            remember = enabled === true;
            try {
                if (remember) window.localStorage.setItem(preferenceKey, "true");
                else window.localStorage.removeItem(preferenceKey);
            } catch (_) {}
        };
        options = { auth: { storage, storageKey: sessionKey, persistSession: true } };
    }
    window.scholarlySupabase = window.supabase.createClient(projectUrl, publishableKey, options);
})();
