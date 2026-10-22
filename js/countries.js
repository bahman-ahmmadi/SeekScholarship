(function () {
    const grid = document.querySelector(".countries-grid");
    if (!grid) return;
    const storageKey = "seek-country-cards-v1";
    let hasCards = false;
    function render(countries) {
        const cards = document.createDocumentFragment();
        countries.filter(country => country.count > 0).forEach(country => {
            const card = document.createElement("a");
            card.className = "country-card";
            card.dataset.country = country.name;
            card.href = `scholarships?country=${encodeURIComponent(country.name)}`;
            const heading = document.createElement("h2");
            if (country.flag_path) {
                const flag = document.createElement("img");
                flag.className = "country-flag"; flag.src = country.flag_path; flag.alt = "";
                heading.append(flag);
            }
            heading.append(document.createTextNode(country.name));
            const count = document.createElement("p"); count.className = "country-scholarship-count";
            count.textContent = `${country.count} ${country.count === 1 ? "scholarship" : "scholarships"} available`;
            const action = document.createElement("span"); action.className = "country-card-action"; action.textContent = "Explore scholarships →";
            card.append(heading, count, action); cards.append(card);
        });
        if (!cards.childElementCount) {
            const empty = document.createElement("p"); empty.className = "countries-status"; empty.textContent = "New scholarship destinations are on the way. Check back soon."; cards.append(empty);
        }
        grid.replaceChildren(cards); grid.setAttribute("aria-busy", "false"); hasCards = true;
    }
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved && Array.isArray(saved.countries) && Date.now() - saved.savedAt < 86400000) render(saved.countries);
    } catch (_) {}
    async function load() {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch("/api/countries", {signal: AbortSignal.timeout(15000)});
                if (!response.ok) throw new Error("Unavailable");
                const result = await response.json();
                if (!Array.isArray(result.countries)) throw new Error("Invalid destinations");
                render(result.countries);
                try { localStorage.setItem(storageKey, JSON.stringify(result)); } catch (_) {}
                return;
            } catch (_) {
                if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
            }
        }
        if (hasCards) return;
        const status = document.createElement("p"); status.className = "countries-status"; status.setAttribute("role", "status");
        status.append(document.createTextNode("Destinations are temporarily unavailable. "));
        const retry = document.createElement("button"); retry.type = "button"; retry.textContent = "Try again";
        retry.addEventListener("click", () => { grid.setAttribute("aria-busy", "true"); retry.disabled = true; load(); });
        status.append(retry); grid.replaceChildren(status); grid.setAttribute("aria-busy", "false");
    }
    load();
})();
