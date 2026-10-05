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
const isScholarshipsPage = window.location.pathname.includes("scholarships.html");
let allScholarships = [];
let activeCountries = [];

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
        link.href = `scholarship.html?id=${encodeURIComponent(scholarship.databaseId)}`;
        card.appendChild(link);
        scholarshipGrid.appendChild(card);
    });
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


function filterScholarships() {

    updateSearchViewState();

    let searchText = "";

    if (scholarshipSearch) {
        searchText = scholarshipSearch.value.trim().toLowerCase();
    } else if (searchInput) {
        searchText = searchInput.value.trim().toLowerCase();
    }

    let country = "";

    if (scholarshipCountry) {
        country = scholarshipCountry.value;
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
            scholarship.country === country;

        const matchesSelectedDegree =
            degree === "" ||
            scholarship.degree.toLowerCase().includes(degree.toLowerCase());

        return matchesSearch && matchesCountry && matchesSelectedDegree;
    });

    displayScholarships(filteredScholarships);
}


/* Home search: combine keyword and country selections */

function filterHomeScholarships() {

    updateSearchViewState();

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
            scholarship.country === selectedHomeCountry;

        return matchesSearch && matchesCountry;
    });

    displayScholarships(filteredScholarships);
}

function populateCountryFilters() {
    [scholarshipCountry, countrySearch].filter(Boolean).forEach(function (select) {
        activeCountries.forEach(function (country) {
            const exists = Array.from(select.options).some(function (option) {
                return option.value === country.name;
            });
            if (!exists) {
                select.add(new Option(country.name, country.name));
            }
        });
        if (selectedCountry && Array.from(select.options).some(function (option) {
            return option.value === selectedCountry;
        })) {
            select.value = selectedCountry;
        }
    });
}

function updateCountryCards() {
    const grid = document.querySelector(".countries-grid");
    if (!grid) return;

    activeCountries.forEach(function (country) {
        let card = Array.from(grid.querySelectorAll(".country-card[data-country]")).find(function (item) {
            return item.dataset.country === country.name;
        });

        if (!card) {
            card = document.createElement("a");
            card.className = "country-card";
            card.dataset.country = country.name;
            card.href = `scholarships.html?country=${encodeURIComponent(country.name)}`;
            const heading = document.createElement("h2");
            const flag = document.createElement("img");
            flag.className = "country-flag";
            flag.alt = "";
            heading.append(flag, document.createTextNode(country.name));
            card.append(heading, makeCardText("p", "country-scholarship-count", ""));
            grid.appendChild(card);
        }

        const flag = card.querySelector(".country-flag");
        if (flag && country.flag_path) flag.src = country.flag_path;
        const count = allScholarships.filter(function (item) {
            return item.country === country.name;
        }).length;
        const countLabel = card.querySelector(".country-scholarship-count");
        if (countLabel) {
            countLabel.textContent = `${count} ${count === 1 ? "scholarship" : "scholarships"} available`;
        }
    });
}

async function loadSupabaseContent() {
    if (scholarshipGrid) scholarshipGrid.setAttribute("aria-busy", "true");
    if (!window.scholarlyData) {
        if (scholarshipGrid) {
            displayScholarships([]);
            const message = scholarshipGrid.querySelector(".no-results p");
            if (message) message.textContent = "Scholarship data is temporarily unavailable. Please try again shortly.";
        }
        return;
    }

    try {
        const [remoteScholarships, countries] = await Promise.all([
            window.scholarlyData.getPublishedScholarships(),
            window.scholarlyData.getCountries()
        ]);
        allScholarships = remoteScholarships;
        activeCountries = countries;
        populateCountryFilters();
        updateCountryCards();

        if (scholarshipGrid) {
            if (isScholarshipsPage) {
                filterScholarships();
            } else if (searchInput.value.trim() || countrySearch.value || selectedCountry) {
                filterHomeScholarships();
            } else {
                displayScholarships(allScholarships.filter(function (scholarship) { return scholarship.isFeatured; }).slice(0, 3));
            }
        }
    } catch (error) {
        console.error("Could not load published Supabase scholarships:", error.message);
        if (scholarshipGrid) {
            displayScholarships([]);
            const message = scholarshipGrid.querySelector(".no-results p");
            if (message) message.textContent = "Scholarship data is temporarily unavailable. Please try again shortly.";
        }
    }
}

loadSupabaseContent();

if (searchInput) {
    searchInput.addEventListener("input", filterHomeScholarships);
}

if (countrySearch) {
    countrySearch.addEventListener("change", function () {
        selectedCountry = "";
        removePresetFilterFromUrl("country");
        filterHomeScholarships();
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
