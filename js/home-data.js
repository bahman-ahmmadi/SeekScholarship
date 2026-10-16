(function () {
    // Public homepage reads do not need the authentication/realtime SDK.
    const { projectUrl, publishableKey } = window.scholarlyPublicConfig;
    const cacheKey = `scholarly-featured-v1:${projectUrl}`;
    const cacheLifetime = 60 * 1000;
    const pending = new Map();

    async function query(table, params) {
        const url = new URL(`${projectUrl}/rest/v1/${table}`);
        url.search = new URLSearchParams(params).toString();
        const key = url.href;
        if (pending.has(key)) return pending.get(key);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const request = (async function () {
            try {
                const response = await fetch(url, {
                    headers: { apikey: publishableKey, Accept: "application/json" },
                    signal: controller.signal
                });
                if (!response.ok) throw new Error(`Scholarship request failed (HTTP ${response.status}).`);
                const rows = await response.json();
                if (!Array.isArray(rows)) throw new Error("Invalid scholarship response.");
                return rows;
            } finally {
                clearTimeout(timeout);
                pending.delete(key);
            }
        })();
        pending.set(key, request);
        return request;
    }

    function normalize(row) {
        return {
            id: `supabase-${row.id}`, databaseId: row.id, source: "supabase",
            name: row.name, country: row.countries?.name || "",
            funding: row.funding || "", deadline: row.deadline || "",
            degree: row.degree || "", field: row.field || "",
            description: row.description || "", isFeatured: row.is_featured === true,
            status: "published"
        };
    }

    window.scholarlyData = {
        async getFeaturedScholarships() {
            const embedded = document.getElementById("featured-scholarships-data");
            if (embedded) {
                try {
                    const rows = JSON.parse(embedded.textContent);
                    if (Array.isArray(rows)) return rows.map(normalize);
                } catch (_) { /* Keep the network fallback for invalid embedded data. */ }
            }
            try {
                const cached = JSON.parse(sessionStorage.getItem(cacheKey));
                const age = Date.now() - cached?.savedAt;
                if (cached && age >= 0 && age < cacheLifetime && Array.isArray(cached.rows)) {
                    return cached.rows.map(normalize);
                }
            } catch (_) { /* Storage may be disabled or contain invalid data. */ }
            const rows = await query("scholarships", {
                select: "id,name,funding,deadline,is_featured,countries(name)",
                status: "eq.published", is_featured: "eq.true", order: "created_at.desc", limit: "3"
            });
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), rows }));
            } catch (_) { /* A full or disabled cache must not prevent rendering. */ }
            return rows.map(normalize);
        },
        async getPublishedScholarships() {
            const rows = await query("scholarships", {
                select: "id,name,funding,degree,field,deadline,description,is_featured,countries(name)",
                status: "eq.published", order: "created_at.desc"
            });
            return rows.map(normalize);
        },
        getCountries() {
            return query("countries", {
                select: "code,name,flag_path,is_active", is_active: "eq.true", order: "name"
            });
        }
    };
})();
