const scholarshipParams = new URLSearchParams(window.location.search);
const scholarshipId = scholarshipParams.get("id");

function formatScholarshipDeadline(value) {
    if (!value) return "Not specified";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString(undefined, {
            year: "numeric", month: "long", day: "numeric"
        });
    }
    return value;
}

function showScholarshipNotFound(message) {
    const hero = document.querySelector(".scholarship-hero-banner");
    const page = document.querySelector(".scholarship-page");
    if (hero) hero.hidden = true;
    if (!page) return;
    page.hidden = false;

    const section = document.createElement("section");
    section.className = "details-section scholarship-not-found";
    const title = document.createElement("h1");
    title.textContent = "Scholarship not found";
    const detail = document.createElement("p");
    detail.textContent = message || "This scholarship may have been removed or the link may be incorrect.";
    const link = document.createElement("a");
    link.className = "view-button";
    link.href = "scholarships.html";
    link.textContent = "Browse scholarships";
    section.append(title, detail, link);
    page.replaceChildren(section);
    document.title = "Scholarship not found | SeekScholarship";
}

const richContentTags = ["a", "b", "blockquote", "br", "em", "h2", "h3", "h4", "i", "li", "mark", "ol", "p", "strong", "u", "ul"];

function sanitizeScholarshipHTML(value) {
    const dirty = String(value || "");
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
        return window.DOMPurify.sanitize(dirty, {
            ALLOWED_TAGS: richContentTags,
            ALLOWED_ATTR: ["href"],
            ALLOW_DATA_ATTR: false,
            FORBID_ATTR: ["style", "class", "id", "name", "target"],
            SANITIZE_NAMED_PROPS: true
        });
    }

    const safeText = document.createElement("div");
    safeText.textContent = dirty;
    return safeText.innerHTML;
}

function setOptionalText(selector, value, formatter) {
    const element = document.querySelector(selector);
    const content = value == null ? "" : String(value).trim();
    element.textContent = content ? (formatter ? formatter(content) : content) : "";
    const row = element.closest("[data-scholarship-field]");
    if (row) row.hidden = !content;
    return Boolean(content);
}

function setRichSection(selector, value) {
    const element = document.querySelector(selector);
    const safeHTML = sanitizeScholarshipHTML(value);
    element.innerHTML = safeHTML;
    const text = element.textContent.trim();
    const section = element.closest(".details-section");
    if (section) section.hidden = !text;
    return Boolean(text);
}

function renderScholarship(scholarship) {
    if (!scholarship) {
        showScholarshipNotFound();
        return;
    }

    const countryLabel = document.querySelector("#scholarship-country-label");
    countryLabel.textContent = scholarship.country || "";
    countryLabel.hidden = !scholarship.country;
    document.querySelector("#scholarship-name").textContent = scholarship.name;
    const visibleFacts = [
        setOptionalText("#scholarship-funding", scholarship.funding),
        setOptionalText("#scholarship-degree", scholarship.degree),
        setOptionalText("#scholarship-country", scholarship.country),
        setOptionalText("#scholarship-deadline", scholarship.deadline, formatScholarshipDeadline)
    ];
    document.querySelector(".scholarship-info").hidden = !visibleFacts.some(Boolean);
    setRichSection("#scholarship-description", scholarship.description);
    document.querySelector(".scholarship-extra-details").hidden = true;
    document.title = `${scholarship.name} | SeekScholarship`;

    const detailValues = {
        gender: ["#scholarship-gender", scholarship.gender],
        eligibleCountries: ["#scholarship-eligible-countries", scholarship.eligibleCountries],
        languageRequirement: ["#scholarship-language", scholarship.languageRequirement],
        field: ["#scholarship-fields", scholarship.field]
    };
    let additionalDetailCount = 0;
    Object.entries(detailValues).forEach(function ([key, detail]) {
        const value = detail[1] == null ? "" : String(detail[1]).trim();
        document.querySelector(detail[0]).textContent = value;
        const row = document.querySelector(`[data-detail-field="${key}"]`);
        row.hidden = !value;
        if (value) additionalDetailCount += 1;
    });
    document.querySelector(".scholarship-extra-details").hidden = additionalDetailCount === 0;

    const summaryValues = {
        degree: scholarship.degree,
        funding: scholarship.funding,
        eligibleCountries: scholarship.eligibleCountries,
        languageRequirement: scholarship.languageRequirement,
        field: scholarship.field,
        country: scholarship.country,
        deadline: scholarship.deadline
    };
    let summaryCount = 0;
    Object.entries(summaryValues).forEach(function ([key, value]) {
        const content = value == null ? "" : String(value).trim();
        const row = document.querySelector(`[data-summary-field="${key}"]`);
        const span = row.querySelector("span");
        span.textContent = key === "deadline" && content ? formatScholarshipDeadline(content) : content;
        row.hidden = !content;
        if (content) summaryCount += 1;
    });
    const customSummaryDetails = document.querySelector("#custom-summary-details");
    customSummaryDetails.replaceChildren();
    (Array.isArray(scholarship.summaryDetails) ? scholarship.summaryDetails : []).forEach(function (detail) {
        const label = String(detail.label || "").trim();
        const value = String(detail.value || "").trim();
        if (!label || !value) return;
        const item = document.createElement("li");
        const strong = document.createElement("strong");
        strong.textContent = `${label}:`;
        const span = document.createElement("span");
        span.textContent = value;
        item.append(strong, " ", span);
        customSummaryDetails.appendChild(item);
        summaryCount += 1;
    });
    customSummaryDetails.hidden = customSummaryDetails.children.length === 0;
    document.querySelector("#scholarship-summary-section").hidden = summaryCount === 0;

    const customSections = document.querySelector("#custom-scholarship-sections");
    customSections.replaceChildren();
    (Array.isArray(scholarship.customSections) ? scholarship.customSections : []).forEach(function (customSection) {
        const title = String(customSection.title || "").trim();
        const safeHTML = sanitizeScholarshipHTML(customSection.content || "");
        const content = document.createElement("div");
        content.innerHTML = safeHTML;
        if (!title || !content.textContent.trim()) return;

        const section = document.createElement("section");
        section.className = "details-section";
        const heading = document.createElement("h2");
        heading.textContent = title;
        content.className = "scholarship-rich-content";
        section.append(heading, content);
        customSections.appendChild(section);
    });

    const listContent = [
        ["#scholarship-benefits", scholarship.benefits || [], "#scholarship-benefits-section"],
        ["#scholarship-eligibility", scholarship.eligibility || [], "#scholarship-eligibility-section"],
        ["#scholarship-documents", scholarship.documents || [], "#scholarship-documents-section"]
    ];
    listContent.forEach(function ([selector, entries, sectionSelector]) {
        const list = document.querySelector(selector);
        list.replaceChildren();
        (Array.isArray(entries) ? entries : []).filter(function (entry) { return String(entry || "").trim(); }).forEach(function (entry) {
            const item = document.createElement("li");
            item.textContent = entry;
            list.appendChild(item);
        });
        document.querySelector(sectionSelector).hidden = list.children.length === 0;
    });

    const applicationHasContent = setRichSection("#scholarship-application", scholarship.application);
    const applicationLink = document.querySelector("#scholarship-application-link");
    let applicationUrl = "#";
    try {
        const parsedApplicationUrl = new URL(scholarship.applicationUrl);
        if (["http:", "https:"].includes(parsedApplicationUrl.protocol)) {
            applicationUrl = parsedApplicationUrl.href;
        }
    } catch (error) {
        applicationUrl = "#";
    }
    applicationLink.href = applicationUrl;
    applicationLink.rel = "noopener noreferrer";
    applicationLink.hidden = applicationUrl === "#";
    document.querySelector("#scholarship-application-section").hidden = !applicationHasContent && applicationLink.hidden;

    document.querySelector(".scholarship-hero-banner").hidden = false;
    document.querySelector(".scholarship-page").hidden = false;
}

if (!window.scholarlyData) {
    showScholarshipNotFound("Scholarship data is temporarily unavailable. Please try again shortly.");
} else {
    window.scholarlyData.getScholarship(scholarshipId)
        .then(renderScholarship)
        .catch(function (error) {
            console.error("Could not load scholarship:", error.message);
            showScholarshipNotFound("Scholarship data is temporarily unavailable. Please try again shortly.");
        });
}
