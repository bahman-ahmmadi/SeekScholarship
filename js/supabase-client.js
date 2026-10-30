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
        const sessionKey = "scholarly-admin-auth-v2";
        const preferenceKey = "scholarly-admin-remember-v2";
        const memory = new Map();
        let remember = false;
        try { remember = window.localStorage.getItem(preferenceKey) === "true"; } catch (_) {}
        const checkbox = document.querySelector("#admin-remember-me");
        if (checkbox) checkbox.checked = remember;

        // Clear sessions from the previous remember-me implementation. New persistence requires opt-in.
        try { window.localStorage.removeItem("scholarly-admin-auth-v1"); } catch (_) {}
        try { window.sessionStorage.removeItem("scholarly-admin-auth-v1"); } catch (_) {}
        try { window.localStorage.removeItem("scholarly-admin-remember-v1"); } catch (_) {}

        const storage = {
            getItem(key) {
                if (memory.has(key)) return memory.get(key);
                if (!remember) return null;
                try { return window.localStorage.getItem(key); } catch (_) { return null; }
            },
            setItem(key, value) {
                if (!remember) {
                    memory.set(key, value);
                    return;
                }
                try {
                    window.localStorage.setItem(key, value);
                    memory.delete(key);
                } catch (_) {
                    memory.set(key, value);
                }
            },
            removeItem(key) {
                memory.delete(key);
                try { window.localStorage.removeItem(key); } catch (_) {}
                try { window.sessionStorage.removeItem(key); } catch (_) {}
            }
        };

        window.scholarlySetAdminRemember = function (enabled) {
            remember = enabled === true;
            try {
                if (remember) window.localStorage.setItem(preferenceKey, "true");
                else window.localStorage.removeItem(preferenceKey);
            } catch (_) {}
            // A previous persisted session must not silently survive an unchecked sign-in.
            if (!remember) storage.removeItem(sessionKey);
        };
        options = { auth: { storage, storageKey: sessionKey, persistSession: true } };
    }
    window.scholarlySupabase = window.supabase.createClient(projectUrl, publishableKey, options);
})();
