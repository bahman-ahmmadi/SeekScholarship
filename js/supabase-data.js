(function () {
    const client = window.scholarlySupabase;
    if (!client) {
        return;
    }

    function normalizeScholarship(row, includeDetails = false) {
        const country = row.countries || {};
        const scholarship = {
            id: `supabase-${row.id}`,
            databaseId: row.id,
            source: "supabase",
            name: row.name,
            country: country.name || "",
            funding: row.funding || "",
            degree: row.degree || "",
            field: row.field || "",
            deadline: row.deadline || "",
            description: row.description || "",
            isFeatured: row.is_featured === true,
            status: row.status || "published"
        };

        if (includeDetails) {
            Object.assign(scholarship, {
                countryCode: row.country_code,
                gender: row.gender || "",
                eligibleCountries: row.eligible_countries || "",
                languageRequirement: row.language_requirement || "",
                benefits: row.benefits || [],
                eligibility: row.eligibility || [],
                documents: row.documents || [],
                application: row.application || "",
                customSections: Array.isArray(row.custom_sections) ? row.custom_sections : [],
                summaryDetails: Array.isArray(row.summary_details) ? row.summary_details : [],
                applicationUrl: row.application_url || "#",
                createdAt: row.created_at
            });
        }

        return scholarship;
    }

    window.scholarlyData = {
        async getPublishedScholarships() {
            const { data, error } = await client
                .from("scholarships")
                .select("id, name, funding, degree, field, deadline, description, is_featured, countries(name)")
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
            return data ? normalizeScholarship(data, true) : null;
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
