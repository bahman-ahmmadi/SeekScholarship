const searchInput = document.querySelector(".search-box input");
const scholarshipSearch = document.querySelector("#scholarship-search");
const scholarshipCountry = document.querySelector("#scholarship-country");
const scholarshipDegree = document.querySelector("#scholarship-degree");
const clearFilters = document.querySelector("#clear-filters");
const countrySearch = document.querySelector("#country-search");

const urlParams = new URLSearchParams(window.location.search);
let selectedCountry = urlParams.get("country");
let selectedDegree = urlParams.get("degree");

const scholarshipGrid = document.querySelector("#scholarship-grid");
const isScholarshipsPage = Boolean(document.querySelector(".scholarships-page") && scholarshipGrid);
const isHomePage = Boolean(document.querySelector(".home-results") && scholarshipGrid);
let allScholarships = [];
let featuredScholarships = [];
let activeCountries = [];
let scholarshipLoadState = "loading";
let allScholarshipsPromise = null;
let featuredScholarshipsPromise = null;
let allScholarshipsLoaded = false;
let featuredScholarshipsLoaded = false;
let countriesLoadPromise = null;
let countriesLoaded = false;

if (selectedCountry) {
    if (scholarshipCountry) {
        scholarshipCountry.value = selectedCountry;
    }

    if (countrySearch) {
        countrySearch.value = selectedCountry;
    }
}

if (scholarshipDegree && selectedDegree) {
    scholarshipDegree.value = {
        "high-school": "High School",
        bachelor: "Bachelor",
        master: "Master",
        phd: "PhD"
    }[selectedDegree] || "";
}

function removePresetFilterFromUrl(key) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete(key);
    window.history.replaceState({}, "", cleanUrl);
}


function makeCardText(tagName, className, value) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value || "";
    return element;
}

function formatDeadline(value) {
    if (!value || value === "Not specified") return "Not specified";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString(undefined, {
            year: "numeric", month: "long", day: "numeric"
        });
    }
    return value;
}

function displayScholarships(list) {
    if (!scholarshipGrid) return;
    scholarshipGrid.replaceChildren();
    scholarshipGrid.setAttribute("aria-busy", "false");

    if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "no-results";
        empty.setAttribute("role", "status");
        empty.append(makeCardText("h3", "", "No scholarships found"));
        empty.append(makeCardText("p", "", "We currently don't have any scholarships listed for this selection."));
        scholarshipGrid.appendChild(empty);
        return;
    }

    list.forEach(function (scholarship) {
        const card = document.createElement("article");
        card.className = "scholarship-card";
        const top = document.createElement("div");
        top.className = "card-top";
        if (scholarship.country) top.appendChild(makeCardText("span", "country", scholarship.country));
        if (scholarship.funding) top.appendChild(makeCardText("span", "funding", scholarship.funding));
        if (top.childElementCount) card.appendChild(top);
        card.appendChild(makeCardText("h3", "", scholarship.name));
        if (scholarship.deadline && scholarship.deadline !== "Not specified") {
            const deadline = document.createElement("div");
            deadline.className = "deadline";
            deadline.append(makeCardText("span", "", "Deadline"), makeCardText("strong", "", formatDeadline(scholarship.deadline)));
            card.appendChild(deadline);
        }

        const link = document.createElement("a");
        link.className = "view-button";
        link.textContent = "View Scholarship " + String.fromCharCode(0x2192);
        link.href = `scholarship?id=${encodeURIComponent(scholarship.databaseId)}`;
        card.appendChild(link);
        scholarshipGrid.appendChild(card);
    });
}

function displayScholarshipLoading() {
    if (!scholarshipGrid) return;
    scholarshipGrid.replaceChildren();
    scholarshipGrid.setAttribute("aria-busy", "true");
    const message = makeCardText("p", "scholarship-state scholarship-loading", "Loading scholarships...");
    message.setAttribute("role", "status");
    scholarshipGrid.appendChild(message);
}

function displayScholarshipLoadError() {
    if (!scholarshipGrid) return;
    scholarshipGrid.replaceChildren();
    scholarshipGrid.setAttribute("aria-busy", "false");

    const state = document.createElement("div");
    state.className = "scholarship-state scholarship-load-error";
    state.setAttribute("role", "alert");
    state.append(
        makeCardText("h3", "", "Scholarships are temporarily unavailable"),
        makeCardText("p", "", "We couldn't load scholarship listings. Please check your connection and try again.")
    );
    const retry = makeCardText("button", "scholarship-retry-button", "Try again");
    retry.type = "button";
    retry.addEventListener("click", function () {
        retry.disabled = true;
        retry.textContent = "Retrying...";
        loadSupabaseContent();
    });
    state.appendChild(retry);
    scholarshipGrid.appendChild(state);
}
function updateSearchViewState() {
    const hasActiveFilter = Boolean(
        selectedCountry ||
        selectedDegree ||
        (searchInput && searchInput.value.trim()) ||
        (countrySearch && countrySearch.value) ||
        (scholarshipSearch && scholarshipSearch.value.trim()) ||
        (scholarshipCountry && scholarshipCountry.value) ||
        (scholarshipDegree && scholarshipDegree.value)
    );

    document.body.classList.toggle("has-active-scholarship-filter", hasActiveFilter);
}

function normalizeFilterValue(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function normalizeCountryFilter(value) {
    const normalized = normalizeFilterValue(value);
    const aliases = {
        turkiye: "turkey",
        "united states of america": "united states",
        usa: "united states",
        us: "united states",
        uk: "united kingdom",
        "great britain": "united kingdom"
    };
    return aliases[normalized] || normalized;
}

function matchesDegreeFilter(scholarshipDegree, selectedDegreeValue) {
    const selected = normalizeFilterValue(selectedDegreeValue);
    if (!selected) return true;

    const patterns = {
        "high school": /\b(high school|secondary|pre university)\b/,
        bachelor: /\b(bachelors?|undergraduate)\b/,
        master: /\b(masters?|graduate|postgraduate)\b/,
        phd: /\b(phd|ph d|doctoral|doctorate)\b/
    };
    const pattern = patterns[selected];
    const scholarshipValue = normalizeFilterValue(scholarshipDegree);
    return pattern ? pattern.test(scholarshipValue) : scholarshipValue === selected;
}

function hasHomeSearchFilters() {
    return Boolean(
        (searchInput && searchInput.value.trim()) ||
        (countrySearch && countrySearch.value) ||
        selectedCountry
    );
}


function filterScholarships() {

    updateSearchViewState();

    if (scholarshipLoadState !== "loaded") return;

    let searchText = "";

    if (scholarshipSearch) {
        searchText = scholarshipSearch.value.trim().toLowerCase();
    } else if (searchInput) {
        searchText = searchInput.value.trim().toLowerCase();
    }

    let country = "";

    if (scholarshipCountry) {
        country = scholarshipCountry.value || selectedCountry || "";
    } else if (countrySearch) {
        country = countrySearch.value;
    }

    const degree = scholarshipDegree ? scholarshipDegree.value : "";

    const filteredScholarships = allScholarships.filter(function (scholarship) {

        const searchableText = [
            scholarship.name,
            scholarship.description,
            scholarship.country,
            scholarship.degree,
            scholarship.field,
            scholarship.funding
        ].filter(Boolean).join(" ").toLowerCase();
        const matchesSearch = searchableText.includes(searchText);

        const matchesCountry =
            country === "" ||
            normalizeCountryFilter(scholarship.country) === normalizeCountryFilter(country);

        const matchesSelectedDegree = matchesDegreeFilter(scholarship.degree, degree);

        return matchesSearch && matchesCountry && matchesSelectedDegree;
    });

    displayScholarships(filteredScholarships);
}


/* Home search: combine keyword and country selections */

function filterHomeScholarships() {

    updateSearchViewState();

    if (scholarshipLoadState !== "loaded") return;

    const searchText = searchInput.value.trim().toLowerCase();
    const selectedHomeCountry = countrySearch.value;

    const filteredScholarships = allScholarships.filter(function (scholarship) {
        const searchableText = [
            scholarship.name,
            scholarship.description,
            scholarship.country,
            scholarship.degree,
            scholarship.field,
            scholarship.funding
        ].filter(Boolean).join(" ").toLowerCase();
        const matchesSearch = searchableText.includes(searchText);
        const matchesCountry =
            selectedHomeCountry === "" ||
            normalizeCountryFilter(scholarship.country) === normalizeCountryFilter(selectedHomeCountry);

        return matchesSearch && matchesCountry;
    });

    displayScholarships(filteredScholarships);
}

function populateCountryFilters() {
    if (!countriesLoaded || (!isHomePage && !allScholarshipsLoaded)) return;
    const available = activeCountries.filter(function (country) {
        return isHomePage || allScholarships.some(function (item) {
            return normalizeCountryFilter(item.country) === normalizeCountryFilter(country.name);
        });
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    [scholarshipCountry, countrySearch].filter(Boolean).forEach(function (select) {
        const previous = select.value || selectedCountry || "";
        const placeholder = select.options[0].cloneNode(true);
        select.replaceChildren(placeholder);
        available.forEach(function (country) { select.add(new Option(country.name, country.name)); });
        const match = Array.from(select.options).find(function (option) {
            return normalizeCountryFilter(option.value) === normalizeCountryFilter(previous);
        });
        select.value = match ? match.value : "";
        select.disabled = false;
    });
}

function showCountryStatus(message) {
    const grid = document.querySelector(".countries-grid");
    if (!grid) return;
    grid.replaceChildren(makeCardText("p", "countries-status", message));
    grid.setAttribute("aria-busy", "false");
}

function updateCountryCards() {
    const grid = document.querySelector(".countries-grid");
    if (!grid || !countriesLoaded || scholarshipLoadState !== "loaded") return;

    const cards = document.createDocumentFragment();
    activeCountries.slice().sort(function (a, b) {
        return a.name.localeCompare(b.name);
    }).forEach(function (country) {
        const count = allScholarships.filter(function (item) {
            return normalizeCountryFilter(item.country) === normalizeCountryFilter(country.name);
        }).length;
        if (count === 0) return;

        const card = document.createElement("a");
        card.className = "country-card";
        card.dataset.country = country.name;
        card.href = `scholarships?country=${encodeURIComponent(country.name)}`;
        const heading = document.createElement("h2");
        if (country.flag_path) {
            const flag = document.createElement("img");
            flag.className = "country-flag";
            flag.src = country.flag_path;
            flag.alt = "";
            heading.append(flag);
        }
        heading.append(document.createTextNode(country.name));
        card.append(heading,
            makeCardText("p", "country-scholarship-count", `${count} ${count === 1 ? "scholarship" : "scholarships"} available`),
            makeCardText("span", "country-card-action", "Explore scholarships →"));
        cards.append(card);
    });
    if (!cards.childElementCount) {
        showCountryStatus("New scholarship destinations are on the way. Check back soon.");
        return;
    }
    grid.replaceChildren(cards);
    grid.setAttribute("aria-busy", "false");
}

function renderCurrentScholarships() {
    if (!scholarshipGrid) return;
    if (isScholarshipsPage) {
        if (allScholarshipsLoaded) filterScholarships();
    } else if (isHomePage) {
        if (hasHomeSearchFilters()) {
            if (allScholarshipsLoaded) filterHomeScholarships();
        } else if (featuredScholarshipsLoaded) {
            displayScholarships(featuredScholarships.slice(0, 3));
        }
    }
}

function loadCountriesOnce() {
    if (!window.scholarlyData || countriesLoaded || countriesLoadPromise) return countriesLoadPromise;
    const countryRequest = isHomePage
        ? window.scholarlyData.getCountriesWithScholarships()
        : window.scholarlyData.getCountries();
    countriesLoadPromise = countryRequest
        .then(function (countries) {
            activeCountries = countries;
            countriesLoaded = true;
            populateCountryFilters();
            renderCurrentScholarships();
            updateCountryCards();
        })
        .catch(function (error) {
            console.warn("Could not load active countries:", error.message);
            showCountryStatus("Destinations could not load. Please refresh to try again.");
        })
        .finally(function () {
            countriesLoadPromise = null;
        });
    return countriesLoadPromise;
}

function loadAllScholarships() {
    if (allScholarshipsLoaded) return Promise.resolve(allScholarships);
    if (allScholarshipsPromise) return allScholarshipsPromise;

    if (!window.scholarlyData) {
        scholarshipLoadState = "error";
        displayScholarshipLoadError();
        return Promise.resolve([]);
    }

    scholarshipLoadState = "loading";
    displayScholarshipLoading();
    allScholarshipsPromise = window.scholarlyData.getPublishedScholarships()
        .then(function (remoteScholarships) {
            allScholarships = remoteScholarships;
            allScholarshipsLoaded = true;
            populateCountryFilters();
            if (!featuredScholarshipsLoaded) {
                featuredScholarships = allScholarships.filter(function (item) { return item.isFeatured; }).slice(0, 3);
                featuredScholarshipsLoaded = true;
            }
            scholarshipLoadState = "loaded";
            updateCountryCards();
            renderCurrentScholarships();
            return allScholarships;
        })
        .catch(function (error) {
            console.error("Could not load published Supabase scholarships:", error.message);
            showCountryStatus("Destinations could not load. Please refresh to try again.");
            if (isHomePage && !hasHomeSearchFilters() && featuredScholarshipsLoaded) {
                scholarshipLoadState = "loaded";
                displayScholarships(featuredScholarships.slice(0, 3));
            } else {
                scholarshipLoadState = "error";
                displayScholarshipLoadError();
            }
            return [];
        })
        .finally(function () {
            allScholarshipsPromise = null;
        });
    return allScholarshipsPromise;
}

function loadHomeFeaturedScholarships() {
    if (featuredScholarshipsLoaded) {
        renderCurrentScholarships();
        return Promise.resolve(featuredScholarships);
    }
    if (featuredScholarshipsPromise) return featuredScholarshipsPromise;

    if (!window.scholarlyData || typeof window.scholarlyData.getFeaturedScholarships !== "function") {
        scholarshipLoadState = "error";
        displayScholarshipLoadError();
        return Promise.resolve([]);
    }

    scholarshipLoadState = "loading";
    if (!scholarshipGrid?.hasAttribute("data-featured-rendered")) displayScholarshipLoading();
    featuredScholarshipsPromise = window.scholarlyData.getFeaturedScholarships()
        .then(function (remoteScholarships) {
            featuredScholarships = remoteScholarships;
            featuredScholarshipsLoaded = true;
            if (!hasHomeSearchFilters() && !allScholarshipsPromise) {
                scholarshipLoadState = "loaded";
                renderCurrentScholarships();
            } else if (allScholarshipsLoaded) {
                scholarshipLoadState = "loaded";
                renderCurrentScholarships();
            }
            return featuredScholarships;
        })
        .catch(function (error) {
            console.error("Could not load featured Supabase scholarships:", error.message);
            if (!allScholarshipsLoaded && !allScholarshipsPromise) {
                scholarshipLoadState = "error";
                displayScholarshipLoadError();
            } else if (allScholarshipsLoaded) {
                scholarshipLoadState = "loaded";
                renderCurrentScholarships();
            }
            return [];
        })
        .finally(function () {
            featuredScholarshipsPromise = null;
        });
    return featuredScholarshipsPromise;
}

function handleHomeFilterChange() {
    updateSearchViewState();
    if (!hasHomeSearchFilters()) {
        renderCurrentScholarships();
        return;
    }
    if (!allScholarshipsLoaded) {
        loadAllScholarships();
        return;
    }
    filterHomeScholarships();
}

function loadSupabaseContent() {
    if (!window.scholarlyData) {
        scholarshipLoadState = "error";
        displayScholarshipLoadError();
        return Promise.resolve();
    }

    if (isHomePage) {
        loadCountriesOnce();
        return hasHomeSearchFilters() ? loadAllScholarships() : loadHomeFeaturedScholarships();
    }

    if (isScholarshipsPage || document.querySelector(".countries-grid")) {
        loadCountriesOnce();
        return loadAllScholarships();
    }

    return Promise.resolve();
}

loadSupabaseContent();

if (searchInput) {
    searchInput.addEventListener("input", handleHomeFilterChange);
}

if (countrySearch) {
    countrySearch.addEventListener("change", function () {
        selectedCountry = "";
        removePresetFilterFromUrl("country");
        handleHomeFilterChange();
    });
}

/* Scholarships page keyword search */

if (scholarshipSearch) {
    scholarshipSearch.addEventListener("input", filterScholarships);
}


/* Scholarships page country filter */

if (scholarshipCountry) {
    scholarshipCountry.addEventListener("change", function () {
        selectedCountry = "";
        removePresetFilterFromUrl("country");
        filterScholarships();
    });
}

if (scholarshipDegree) {
    scholarshipDegree.addEventListener("change", function () {
        selectedDegree = "";
        removePresetFilterFromUrl("degree");
        filterScholarships();
    });
}


/* Clear filters */

if (clearFilters) {

    clearFilters.addEventListener("click", function () {

        scholarshipSearch.value = "";
        scholarshipCountry.value = "";
        scholarshipDegree.value = "";
        selectedCountry = "";
        selectedDegree = "";
        removePresetFilterFromUrl("country");
        removePresetFilterFromUrl("degree");
        if (scholarshipPageTitle) {
            scholarshipPageTitle.textContent = "All Scholarships";
        }
        if (scholarshipPageDescription) {
            scholarshipPageDescription.textContent = "Explore scholarship opportunities for international students.";
        }

        filterScholarships();
    });
}


/* Contact form */

const contactForm = document.querySelector("#contact-form");
const formMessage = document.querySelector("#form-message");

const scholarshipPageTitle = document.querySelector("#scholarship-page-title");
const scholarshipPageDescription = document.querySelector("#scholarship-page-description");

if (scholarshipPageTitle && selectedDegree) {

    const categoryTitles = {
        "high-school": "High School Scholarships",
        "bachelor": "Bachelor Scholarships",
        "master": "Master Scholarships",
        "phd": "PhD Scholarships"
    };

    const categoryDescriptions = {
        "high-school": "Explore scholarship opportunities for high school students.",
        "bachelor": "Explore scholarship opportunities for undergraduate students.",
        "master": "Explore scholarship opportunities for master's students.",
        "phd": "Explore scholarship opportunities for doctoral students."
    };

    scholarshipPageTitle.textContent =
        categoryTitles[selectedDegree] || "All Scholarships";

    scholarshipPageDescription.textContent =
        categoryDescriptions[selectedDegree] ||
        "Explore scholarship opportunities for international students.";
}

if (contactForm) {

    contactForm.addEventListener("submit", function (event) {

        event.preventDefault();
        const submitButton = contactForm.querySelector('button[type="submit"]');
        const formData = new FormData(contactForm);
        const senderName = String(formData.get("name")).trim();
        formData.set("_subject", `SeekScholarship contact message from ${senderName}`);

        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
        formMessage.textContent = "Sending your message...";
        formMessage.classList.remove("form-message-error");

        fetch(contactForm.action, {
            method: "POST",
            headers: { "Accept": "application/json" },
            body: formData
        })
            .then(async function (response) {
                let result = {};
                try {
                    result = await response.json();
                } catch (error) {
                    result = {};
                }
                if (!response.ok || result.ok === false || (result.errors && result.errors.length)) {
                    const errorDetails = Array.isArray(result.errors)
                        ? result.errors.map(function (item) {
                            return typeof item === "string" ? item : item.message;
                        }).filter(Boolean).join(" ")
                        : "";
                    throw new Error(errorDetails || result.message || `Formspree rejected the submission (HTTP ${response.status}).`);
                }
                formMessage.textContent = "Thanks! Your message was sent successfully.";
                formMessage.classList.remove("form-message-error");
                contactForm.reset();
            })
            .catch(function (error) {
                const reason = error && error.message ? error.message : "";
                if (reason && reason !== "Failed to fetch") {
                    formMessage.textContent = `We could not send your message: ${reason}`;
                } else {
                    formMessage.textContent = "We could not send your message. Please check your connection and try again.";
                }
                formMessage.classList.add("form-message-error");
            })
            .finally(function () {
                submitButton.disabled = false;
                submitButton.textContent = "Send Message";
            });
    });
}
