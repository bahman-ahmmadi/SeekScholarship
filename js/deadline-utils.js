(function () {
    const timeZone = "Europe/Istanbul";

    function today() {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function deadlineDate(value) {
        const text = String(value || "").trim();
        if (!text || text.toLowerCase() === "not specified") return null;

        const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
        if (isoDate) return isoDate[1];

        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime())) return null;
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(parsed);
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    window.scholarlyDeadline = {
        today,
        isActive(value) {
            const date = deadlineDate(value);
            return !date || date >= today();
        }
    };
})();
