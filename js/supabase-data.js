(function () {
    const client = window.scholarlySupabase;
    if (!client) {
        return;
    }

    function normalizeScholarship(row) {
        const country = row.countries || {};
        return {
            id: `supabase-${row.id}`,
            databaseId: row.id,
            source: "supabase",
            name: row.name,
            country: country.name || "",
            countryCode: row.country_code,
            funding: row.funding || "",
            degree: row.degree || "",
            field: row.field || "",
            gender: row.gender || "",
            eligibleCountries: row.eligible_countries || "",
            languageRequirement: row.language_requirement || "",
            deadline: row.deadline || "",
            description: row.description || "",
            benefits: row.benefits || [],
            eligibility: row.eligibility || [],
            documents: row.documents || [],
            application: row.application || "",
            customSections: Array.isArray(row.custom_sections) ? row.custom_sections : [],
            summaryDetails: Array.isArray(row.summary_details) ? row.summary_details : [],
            isFeatured: row.is_featured === true,
            applicationUrl: row.application_url || "#",
            status: row.status,
            createdAt: row.created_at
        };
    }

    window.scholarlyData = {
        async getPublishedScholarships() {
            const { data, error } = await client
                .from("scholarships")
                .select("*, countries(code, name, flag_path)")
                .eq("status", "published")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return (data || []).map(normalizeScholarship);
        },

        async getScholarship(id) {
            const { data, error } = await client
                .from("scholarships")
                .select("*, countries(code, name, flag_path)")
                .eq("id", id)
                .eq("status", "published")
                .maybeSingle();

            if (error) throw error;
            return data ? normalizeScholarship(data) : null;
        },

        async getCountries() {
            const { data, error } = await client
                .from("countries")
                .select("code, name, flag_path, is_active")
                .eq("is_active", true)
                .order("name");

            if (error) throw error;
            return data || [];
        }
    };
})();
