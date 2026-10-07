const STATIC_PUBLIC_URLS = [
    "https://seekscholarship.com/",
    "https://seekscholarship.com/scholarships.html",
    "https://seekscholarship.com/countries.html",
    "https://seekscholarship.com/about.html",
    "https://seekscholarship.com/team.html",
    "https://seekscholarship.com/contact.html"
];

const XML_HEADERS = {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-store"
};

function escapeXml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function createSitemap(scholarshipIds) {
    const scholarshipUrls = scholarshipIds.map(function (id) {
        return `https://seekscholarship.com/scholarship.html?id=${encodeURIComponent(String(id))}`;
    });
    const urls = [...STATIC_PUBLIC_URLS, ...scholarshipUrls];
    const entries = urls.map(function (url) {
        return `  <url><loc>${escapeXml(url)}</loc></url>`;
    }).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

async function getPublishedScholarshipIds(env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
        throw new Error("Supabase public configuration is missing");
    }

    const endpoint = new URL(`${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/scholarships`);
    endpoint.searchParams.set("select", "id");
    endpoint.searchParams.set("status", "eq.published");
    endpoint.searchParams.set("order", "id.asc");

    const pageSize = 500;
    const ids = [];
    let lastId = null;

    while (true) {
        const pageUrl = new URL(endpoint);
        pageUrl.searchParams.set("limit", String(pageSize));
        if (lastId !== null) {
            pageUrl.searchParams.set("id", `gt.${String(lastId)}`);
        }

        const response = await fetch(pageUrl, {
            headers: {
                apikey: env.SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Supabase REST returned HTTP ${response.status}`);
        }

        const rows = await response.json();
        if (!Array.isArray(rows)) {
            throw new Error("Supabase returned an invalid scholarship list");
        }

        if (rows.length === 0) break;

        rows.forEach(function (row) {
            if (row.id === null || row.id === undefined) {
                throw new Error("Supabase returned a scholarship without an id");
            }
            ids.push(row.id);
        });

        // Keep paging after short responses because the API may enforce a lower row cap.
        const nextId = rows[rows.length - 1].id;
        if (nextId === null || nextId === undefined || String(nextId) === String(lastId)) {
            throw new Error("Supabase returned an invalid scholarship page");
        }
        lastId = nextId;
    }

    return ids;
}

function sitemapErrorResponse() {
    const body = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error>Sitemap is temporarily unavailable.</error>\n";
    return new Response(body, {
        status: 503,
        headers: { ...XML_HEADERS, "Retry-After": "60" }
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname !== "/sitemap.xml") {
            return env.ASSETS.fetch(request);
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method Not Allowed", {
                status: 405,
                headers: { Allow: "GET, HEAD" }
            });
        }

        try {
            const scholarshipIds = await getPublishedScholarshipIds(env);
            const body = createSitemap(scholarshipIds);
            return new Response(request.method === "HEAD" ? null : body, {
                status: 200,
                headers: XML_HEADERS
            });
        } catch (error) {
            console.error("Could not generate sitemap:", error.message);
            return sitemapErrorResponse();
        }
    }
};
