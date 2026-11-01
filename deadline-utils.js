const SCHOLARSHIP_TIME_ZONE = "Europe/Istanbul";

export function todayInScholarshipTimeZone() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: SCHOLARSHIP_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function isScholarshipDeadlineActive(value) {
    const text = String(value || "").trim();
    if (!text || text.toLowerCase() === "not specified") return true;

    const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
    let date = isoDate?.[1] || "";
    if (!date) {
        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime())) return true;
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: SCHOLARSHIP_TIME_ZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(parsed);
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        date = `${values.year}-${values.month}-${values.day}`;
    }
    return date >= todayInScholarshipTimeZone();
}
