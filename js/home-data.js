(function () {
    // Public homepage reads do not need the authentication/realtime SDK.
    const { projectUrl, publishableKey } = window.scholarlyPublicConfig;
    function currentIstanbulDate() {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
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
        return date >= currentIstanbulDate();
    }

    const cacheKey = `scholarly-featured-v3:${projectUrl}:${currentIstanbulDate()}`;
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
                    if (Array.isArray(rows)) return rows.filter(row => isDeadlineActive(row.deadline)).slice(0, 3).map(normalize);
                } catch (_) { /* Keep the network fallback for invalid embedded data. */ }
            }
            try {
                const cached = JSON.parse(sessionStorage.getItem(cacheKey));
                const age = Date.now() - cached?.savedAt;
                if (cached && age >= 0 && age < cacheLifetime && Array.isArray(cached.rows)) {
                    return cached.rows.filter(row => isDeadlineActive(row.deadline)).slice(0, 3).map(normalize);
                }
            } catch (_) { /* Storage may be disabled or contain invalid data. */ }
            const rows = await query("scholarships", {
                select: "id,name,funding,deadline,is_featured,countries(name)",
                status: "eq.published", is_featured: "eq.true", order: "created_at.desc"
            });
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), rows }));
            } catch (_) { /* A full or disabled cache must not prevent rendering. */ }
            return rows.filter(row => isDeadlineActive(row.deadline)).slice(0, 3).map(normalize);
        },
        async getPublishedScholarships() {
            const rows = await query("scholarships", {
                select: "id,name,funding,degree,field,deadline,description,is_featured,countries(name)",
                status: "eq.published", order: "created_at.desc"
            });
            return rows.filter(row => isDeadlineActive(row.deadline)).map(normalize);
        },
        async getCountriesWithScholarships() {
            const rows = await query("scholarships", {
                select: "deadline,countries(code,name,flag_path,is_active)", status: "eq.published"
            });
            const countries = new Map();
            rows.filter(row => isDeadlineActive(row.deadline)).forEach(function (row) {
                const country = row.countries;
                if (country?.name && country.is_active !== false) countries.set(country.name, country);
            });
            return Array.from(countries.values());
        },
        getCountries() {
            return query("countries", {
                select: "code,name,flag_path,is_active", is_active: "eq.true", order: "name"
            });
        }
    };
})();
