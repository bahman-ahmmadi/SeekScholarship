const ORIGIN = "https://seekscholarship.com";
const PUBLIC_PAGES = new Set(["scholarships", "scholarship", "countries", "about", "team", "contact"]);

function cleanPath(pathname) {
    if (pathname === "/" || pathname === "/index.html" || pathname === "/index") return "/";
    const name = pathname.replace(/^\//, "").replace(/\/$/, "").replace(/\.html$/, "");
    return PUBLIC_PAGES.has(name) ? `/${name}` : null;
}

export function canonicalRedirect(request) {
    if (request.method !== "GET" && request.method !== "HEAD") return null;
    const url = new URL(request.url);
    const path = cleanPath(url.pathname);
    const publicHost = url.hostname === "seekscholarship.com" || url.hostname === "www.seekscholarship.com";
    if (path && (path !== url.pathname || (publicHost && (url.protocol !== "https:" || url.hostname.startsWith("www."))))) {
        const destination = new URL(path + url.search, publicHost ? ORIGIN : url.origin);
        return Response.redirect(destination.href, 301);
    }
    return null;
}

export function withCanonical(response, request) {
    const url = new URL(request.url);
    const path = cleanPath(url.pathname);
    if (!path || response.status !== 200 || !response.headers.get("Content-Type")?.includes("text/html")) return response;
    const canonical = new URL(path, ORIGIN);
    if (path === "/scholarship") {
        const id = url.searchParams.get("id") || "";
        if (!/^\d{1,20}$/.test(id)) return response;
        canonical.searchParams.set("id", id);
    }
    const transformed = new HTMLRewriter()
        .on('link[rel="canonical"]', { element(element) { element.remove(); } })
        .on("head", { element(element) { element.prepend(`<link rel="canonical" href="${canonical.href}">`, { html: true }); } })
        .on('meta[property="og:url"]', { element(element) { element.setAttribute("content", canonical.href); } })
        .transform(response);
    const headers = new Headers(transformed.headers);
    headers.delete("ETag");
    headers.delete("Content-Length");
    if (url.hostname !== "seekscholarship.com" && url.hostname !== "www.seekscholarship.com") {
        headers.set("X-Robots-Tag", "noindex");
    }
    return new Response(transformed.body, { status: transformed.status, headers });
}
