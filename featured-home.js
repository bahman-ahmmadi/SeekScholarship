const FRESH_MS = 60_000;
const RETAIN_SECONDS = 300;
const inFlight = new Map();

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

function renderCards(rows) {
    if (!rows.length) {
        return '<div class="no-results" role="status"><h3>No scholarships found</h3><p>We currently don\'t have any scholarships listed for this selection.</p></div>';
    }
    return rows.map(row => {
        const country = row.countries?.name;
        const top = (country ? `<span class="country">${escapeHtml(country)}</span>` : "") +
            (row.funding ? `<span class="funding">${escapeHtml(row.funding)}</span>` : "");
        let deadline = "";
        if (row.deadline && row.deadline !== "Not specified") {
            let label = row.deadline;
            if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
                const date = new Date(`${label}T00:00:00Z`);
                if (!Number.isNaN(date.getTime())) {
                    label = date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
                }
            }
            deadline = `<div class="deadline"><span>Deadline</span><strong>${escapeHtml(label)}</strong></div>`;
        }
        return `<article class="scholarship-card">${top ? `<div class="card-top">${top}</div>` : ""}<h3>${escapeHtml(row.name)}</h3>${deadline}<a class="view-button" href="scholarship.html?id=${escapeHtml(encodeURIComponent(String(row.id)))}">View Scholarship →</a></article>`;
    }).join("");
}

async function refreshFeatured(env, cacheKey) {
    if (inFlight.has(cacheKey.url)) return inFlight.get(cacheKey.url);
    const pending = (async () => {
        const endpoint = new URL(`${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/scholarships`);
        endpoint.search = new URLSearchParams({
            select: "id,name,funding,deadline,is_featured,countries(name)",
            status: "eq.published", is_featured: "eq.true", order: "created_at.desc", limit: "3"
        });
        const response = await fetch(endpoint, {
            headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Accept: "application/json" },
            signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) throw new Error(`Featured scholarships returned HTTP ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.some(row => !row || row.id == null || typeof row.name !== "string")) {
            throw new Error("Invalid featured scholarships response");
        }
        const result = { savedAt: Date.now(), rows: rows.slice(0, 3) };
        try {
            await caches.default.put(cacheKey, new Response(JSON.stringify(result), {
                headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${RETAIN_SECONDS}` }
            }));
        } catch (error) {
            console.warn("Could not cache featured scholarships:", error.message);
        }
        return result;
    })();
    inFlight.set(cacheKey.url, pending);
    try { return await pending; } finally { inFlight.delete(cacheKey.url); }
}

async function getFeatured(request, env, ctx) {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase public configuration is missing");
    // One public-data cache entry per origin/project, independent of visitor cookies or filters.
    const keyUrl = new URL("/__featured-cache-v1", request.url);
    keyUrl.searchParams.set("project", env.SUPABASE_URL);
    const cacheKey = new Request(keyUrl);
    try {
        const cached = await caches.default.match(cacheKey);
        if (cached) {
            const result = await cached.json();
            const age = Date.now() - result.savedAt;
            if (Array.isArray(result.rows) && age >= 0 && age < RETAIN_SECONDS * 1000) {
                if (age >= FRESH_MS) {
                    ctx.waitUntil(refreshFeatured(env, cacheKey).catch(error => {
                        console.warn("Could not refresh featured scholarships:", error.message);
                    }));
                }
                return result;
            }
        }
    } catch (error) {
        console.warn("Could not read featured cache:", error.message);
    }
    return refreshFeatured(env, cacheKey);
}

export async function serveFeaturedHome(request, env, ctx) {
    // Fetch assets and data concurrently; a failed database request keeps the client fallback.
    const dataPromise = getFeatured(request, env, ctx).catch(error => {
        console.warn("Could not render featured scholarships:", error.message);
        return null;
    });
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 200 || !asset.headers.get("Content-Type")?.includes("text/html")) return asset;
    const result = await dataPromise;
    if (!result) return asset;
    const json = JSON.stringify(result.rows).replace(/</g, "\\u003c");
    const transformed = new HTMLRewriter().on("#scholarship-grid", {
        element(element) {
            element.setAttribute("aria-busy", "false");
            element.setAttribute("data-featured-rendered", "true");
            element.setInnerContent(renderCards(result.rows), { html: true });
            element.after(`<script id="featured-scholarships-data" type="application/json">${json}</script>`, { html: true });
        }
    }).transform(asset);
    const headers = new Headers(transformed.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Featured-Rendering", "server");
    headers.delete("ETag");
    headers.delete("Last-Modified");
    headers.delete("Content-Length");
    return new Response(transformed.body, { status: transformed.status, headers });
}
