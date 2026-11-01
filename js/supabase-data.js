(function () {
    const client = window.scholarlySupabase;
    if (!client) {
        return;
    }

    function isDeadlineActive(value) {
        if (typeof window.scholarlyDeadline?.isActive === "function") return window.scholarlyDeadline.isActive(value);
        const text = String(value || "").trim();
        if (!text || text.toLowerCase() === "not specified") return true;
        const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
        let date = match?.[1] || "";
        if (!date) {
            const parsed = new Date(text);
            if (Number.isNaN(parsed.getTime())) return true;
            const parts = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
            }).formatToParts(parsed);
            const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
            date = `${values.year}-${values.month}-${values.day}`;
        }
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return date >= `${values.year}-${values.month}-${values.day}`;
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
        async getFeaturedScholarships() {
            const { data, error } = await client
                .from("scholarships")
                .select("id, name, funding, deadline, is_featured, countries(name)")
                .eq("status", "published")
                .eq("is_featured", true)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return (data || []).filter(row => isDeadlineActive(row.deadline)).slice(0, 3).map(normalizeScholarship);
        },

        async getPublishedScholarships() {
            const { data, error } = await client
                .from("scholarships")
                .select("id, name, funding, degree, field, deadline, description, is_featured, countries(name)")
                .eq("status", "published")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return (data || []).filter(row => isDeadlineActive(row.deadline)).map(normalizeScholarship);
        },

        async getScholarship(id) {
            const { data, error } = await client
                .from("scholarships")
                .select("*, countries(code, name, flag_path)")
                .eq("id", id)
                .eq("status", "published")
                .maybeSingle();

            if (error) throw error;
            return data && isDeadlineActive(data.deadline) ? normalizeScholarship(data, true) : null;
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
