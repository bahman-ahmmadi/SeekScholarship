const pending = new Map();
const FRESH_MS = 60_000;
const RETAIN_SECONDS = 86400;

async function refreshCountries(env, key) {
    if (pending.has(key.url)) return pending.get(key.url);
    const task = (async () => {
        const countries = new Map();
        let offset = 0;
        while (true) {
            const url = new URL(`${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/scholarships`);
            url.search = new URLSearchParams({select: "id,countries(name,flag_path,is_active)", status: "eq.published", order: "id", offset: String(offset), limit: "1000"});
            const response = await fetch(url, {headers: {apikey: env.SUPABASE_PUBLISHABLE_KEY, Accept: "application/json", Prefer: "count=exact"}, signal: AbortSignal.timeout(6000)});
            if (!response.ok) throw new Error(`Country data returned HTTP ${response.status}`);
            const rows = await response.json();
            if (!Array.isArray(rows)) throw new Error("Invalid country data");
            if (!rows.length) break;
            rows.forEach(row => {
                const country = row.countries;
                if (!country?.name || country.is_active === false) return;
                const item = countries.get(country.name) || {name: country.name, flag_path: country.flag_path || "", count: 0};
                item.count++;
                countries.set(country.name, item);
            });
            offset += rows.length;
            const total = Number(response.headers.get("Content-Range")?.split("/")[1]);
            if (Number.isFinite(total) && offset >= total) break;
        }
        const result = {savedAt: Date.now(), countries: [...countries.values()].sort((a,b) => a.name.localeCompare(b.name))};
        await caches.default.put(key, Response.json(result, {headers: {"Cache-Control": `public, max-age=${RETAIN_SECONDS}`}}));
        return result;
    })();
    pending.set(key.url, task);
    try { return await task; } finally { pending.delete(key.url); }
}

export async function serveCountryData(request, env, ctx) {
    if (request.method !== "GET") return new Response("Method Not Allowed", {status: 405, headers: {Allow: "GET"}});
    const url = new URL("/__country-cache-v1", request.url);
    url.searchParams.set("project", env.SUPABASE_URL);
    const key = new Request(url);
    let cached;
    try { const entry = await caches.default.match(key); if (entry) cached = await entry.json(); } catch (_) {}
    if (cached && Array.isArray(cached.countries) && Date.now() - cached.savedAt < RETAIN_SECONDS * 1000) {
        if (Date.now() - cached.savedAt > FRESH_MS) ctx.waitUntil(refreshCountries(env, key).catch(() => {}));
        return Response.json(cached, {headers: {"Cache-Control": "public, max-age=30", "X-Country-Cache": "hit"}});
    }
    try {
        return Response.json(await refreshCountries(env, key), {headers: {"Cache-Control": "public, max-age=30", "X-Country-Cache": "miss"}});
    } catch (_) {
        return Response.json({error: "Destinations temporarily unavailable"}, {status: 503, headers: {"Cache-Control": "no-store", "Retry-After": "2"}});
    }
}
