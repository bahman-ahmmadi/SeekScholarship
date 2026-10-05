(function () {
    const projectUrl = "https://nrmfmvpjfmimiaemlmcd.supabase.co";
    const publishableKey = "sb_publishable_ip_vW1wIEqyiJtivtIyTsA_vXZLXcNI";

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        window.scholarlySupabase = null;
        window.scholarlySupabaseError = "The Supabase client could not be loaded. Check your internet connection and reload the page.";
        return;
    }

    window.scholarlySupabase = window.supabase.createClient(projectUrl, publishableKey);
})();
