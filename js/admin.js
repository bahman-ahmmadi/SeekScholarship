(function () {
    const client = window.scholarlySupabase;
    const loginPanel = document.querySelector("#admin-login-panel");
    const dashboard = document.querySelector("#admin-dashboard");
    const loginForm = document.querySelector("#admin-login-form");
    const loginMessage = document.querySelector("#admin-login-message");
    const recoveryPanel = document.querySelector("#admin-recovery-panel");
    const recoveryForm = document.querySelector("#admin-recovery-form");
    const recoveryMessage = document.querySelector("#admin-recovery-message");
    const newPasswordPanel = document.querySelector("#admin-new-password-panel");
    const newPasswordForm = document.querySelector("#admin-new-password-form");
    const newPasswordMessage = document.querySelector("#admin-new-password-message");
    const globalMessage = document.querySelector("#admin-global-message");
    const scholarshipForm = document.querySelector("#scholarship-form");
    const scholarshipMessage = document.querySelector("#scholarship-form-message");
    const countryForm = document.querySelector("#country-form");
    const countryMessage = document.querySelector("#country-form-message");
    const scholarshipRows = document.querySelector("#admin-scholarship-rows");
    const countryRows = document.querySelector("#admin-country-rows");
    const countrySelect = document.querySelector("#admin-country");
    const customSectionsContainer = document.querySelector("#admin-custom-sections");
    const summaryDetailsContainer = document.querySelector("#admin-summary-details");
    const inlineCountryPanel = document.querySelector("#admin-inline-country");
    const inlineCountryMessage = document.querySelector("#inline-country-message");

    let currentAdmin = null;
    let pendingAdminUserId = "";
    let pendingAdminVerification = null;
    let countries = [];
    let scholarships = [];
    let editingCountryCode = "";
    let lastCountrySelection = "";
    let passwordRecoveryMode = new URLSearchParams(window.location.search).get("mode") === "recovery";

    function setMessage(element, message, isError) {
        element.textContent = message || "";
        element.classList.toggle("is-error", Boolean(isError));
        element.classList.toggle("is-success", Boolean(message) && !isError);
    }

    function setAuthenticatedView(isAuthenticated) {
        loginPanel.hidden = isAuthenticated;
        dashboard.hidden = !isAuthenticated;
    }

    function showLoginView() {
        loginPanel.hidden = false;
        recoveryPanel.hidden = true;
        newPasswordPanel.hidden = true;
        dashboard.hidden = true;
    }

    async function showPasswordUpdate(session) {
        if (!session || !session.user) return false;
        const { data: allowed, error } = await client.rpc("is_admin");
        if (error) {
            showLoginView();
            setMessage(loginMessage, "Could not verify admin access right now. Your session is still saved; reload this page to try again.", true);
            return false;
        }
        if (allowed !== true) {
            await client.auth.signOut({ scope: "local" });
            passwordRecoveryMode = false;
            showLoginView();
            setMessage(loginMessage, "This account does not have SeekScholarship admin access.", true);
            return false;
        }

        passwordRecoveryMode = true;
        loginPanel.hidden = true;
        recoveryPanel.hidden = true;
        newPasswordPanel.hidden = false;
        dashboard.hidden = true;
        return true;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function optionList(textareaValue) {
        return textareaValue.split(/\r?\n/).map(function (item) {
            return item.trim();
        }).filter(Boolean);
    }

    const richTags = ["a", "b", "blockquote", "br", "em", "h2", "h3", "h4", "i", "li", "mark", "ol", "p", "strong", "u", "ul"];

    function sanitizeRichHTML(value) {
        const dirty = String(value || "");
        if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
            return window.DOMPurify.sanitize(dirty, {
                ALLOWED_TAGS: richTags,
                ALLOWED_ATTR: ["href"],
                ALLOW_DATA_ATTR: false,
                FORBID_ATTR: ["style", "class", "id", "name", "target"],
                SANITIZE_NAMED_PROPS: true
            });
        }

        const fallback = document.createElement("div");
        fallback.textContent = dirty;
        return fallback.innerHTML;
    }

    function syncEditorValue(editor) {
        const wrapper = editor.closest(".admin-rich-editor");
        if (!wrapper) return;
        const field = wrapper.dataset.richField;
        if (!field) return;
        const textarea = scholarshipForm.querySelector(`textarea[name="${field}"]`);
        if (textarea) textarea.value = sanitizeRichHTML(editor.innerHTML);
    }

    function createRichToolbar() {
        const toolbar = element("div", "admin-rich-toolbar");
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", "Section formatting");
        [
            ["bold", "B", "Bold"],
            ["italic", "I", "Italic"],
            ["heading", "H", "Heading"],
            ["unorderedList", "• List", "Bulleted list"],
            ["orderedList", "1. List", "Numbered list"],
            ["link", "Link", "Insert link"],
            ["highlight", "Highlight", "Highlight selection"]
        ].forEach(function (definition) {
            const button = element("button", "", definition[1]);
            button.type = "button";
            button.dataset.richCommand = definition[0];
            button.setAttribute("aria-label", definition[2]);
            button.title = definition[2];
            if (definition[0] === "bold") button.innerHTML = "<strong>B</strong>";
            if (definition[0] === "italic") button.innerHTML = "<em>I</em>";
            if (definition[0] === "highlight") button.innerHTML = "<mark>Highlight</mark>";
            toolbar.appendChild(button);
        });
        return toolbar;
    }

    function setupRichEditors(root) {
        root.querySelectorAll("[data-rich-editor]").forEach(function (editor) {
            editor.innerHTML = sanitizeRichHTML(editor.innerHTML);
            editor.addEventListener("input", function () { syncEditorValue(editor); });
            editor.addEventListener("paste", function (event) {
                event.preventDefault();
                const pastedHTML = event.clipboardData.getData("text/html");
                const pastedText = event.clipboardData.getData("text/plain");
                const safePaste = pastedHTML
                    ? sanitizeRichHTML(pastedHTML)
                    : document.createElement("div");
                if (!pastedHTML) {
                    safePaste.textContent = pastedText;
                }
                document.execCommand("insertHTML", false, pastedHTML ? safePaste : safePaste.innerHTML.replace(/\n/g, "<br>"));
                syncEditorValue(editor);
            });
        });
    }

    function setRichEditorValue(field, value) {
        const wrapper = scholarshipForm.querySelector(`.admin-rich-editor[data-rich-field="${field}"]`);
        const editor = wrapper && wrapper.querySelector("[data-rich-editor]");
        const textarea = scholarshipForm.querySelector(`textarea[name="${field}"]`);
        const safe = sanitizeRichHTML(value || "");
        if (editor) editor.innerHTML = safe;
        if (textarea) textarea.value = safe;
    }

    function applyRichCommand(button) {
        const wrapper = button.closest(".admin-rich-editor");
        const editor = wrapper && wrapper.querySelector("[data-rich-editor]");
        if (!editor) return;
        editor.focus();
        const command = button.dataset.richCommand;
        if (command === "highlight") {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;
            const range = selection.getRangeAt(0);
            if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return;
            const mark = document.createElement("mark");
            mark.appendChild(range.extractContents());
            range.insertNode(mark);
            selection.removeAllRanges();
            const selected = document.createRange();
            selected.selectNodeContents(mark);
            selection.addRange(selected);
        } else if (command === "link") {
            const address = window.prompt("Enter a link URL (https://, http://, or mailto:)");
            if (!address) return;
            let parsed;
            try { parsed = new URL(address.trim()); } catch (error) { return; }
            if (!["https:", "http:", "mailto:"].includes(parsed.protocol)) return;
            document.execCommand("createLink", false, parsed.href);
        } else {
            const commands = {
                bold: ["bold", null],
                italic: ["italic", null],
                heading: ["formatBlock", "<h3>"],
                unorderedList: ["insertUnorderedList", null],
                orderedList: ["insertOrderedList", null]
            };
            if (commands[command]) document.execCommand(commands[command][0], false, commands[command][1]);
        }
        editor.innerHTML = sanitizeRichHTML(editor.innerHTML);
        syncEditorValue(editor);
    }

    function createCustomSection(section) {
        const card = element("article", "admin-custom-section");
        card.dataset.sectionId = section.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const heading = element("div", "admin-custom-section-heading");
        const titleGroup = element("div", "admin-custom-title-group");
        const label = element("label", "", "Section title");
        const titleId = `custom-section-title-${card.dataset.sectionId}`;
        label.htmlFor = titleId;
        const title = element("input");
        title.id = titleId;
        title.type = "text";
        title.maxLength = 120;
        title.placeholder = "e.g. Additional Requirements";
        title.value = section.title || "";
        titleGroup.append(label, title);

        const controls = element("div", "admin-custom-section-controls");
        [["up", "Move up"], ["down", "Move down"], ["remove", "Remove"]].forEach(function (entry) {
            const button = element("button", entry[0] === "remove" ? "admin-text-button admin-delete-button" : "admin-secondary-button", entry[1]);
            button.type = "button";
            button.dataset.customAction = entry[0];
            controls.appendChild(button);
        });
        heading.append(titleGroup, controls);

        const editorWrapper = element("div", "admin-rich-editor");
        editorWrapper.appendChild(createRichToolbar());
        const editor = element("div", "admin-rich-content");
        editor.contentEditable = "true";
        editor.setAttribute("role", "textbox");
        editor.setAttribute("aria-multiline", "true");
        editor.setAttribute("aria-label", "Custom section content");
        editor.dataset.richEditor = "true";
        editor.innerHTML = sanitizeRichHTML(section.content || "");
        editorWrapper.appendChild(editor);

        card.append(heading, editorWrapper);
        return card;
    }

    function updateCustomSectionControls() {
        const sections = Array.from(customSectionsContainer.children);
        sections.forEach(function (section, index) {
            const up = section.querySelector("[data-custom-action='up']");
            const down = section.querySelector("[data-custom-action='down']");
            up.disabled = index === 0;
            down.disabled = index === sections.length - 1;
        });
    }

    function renderCustomSections(sections) {
        customSectionsContainer.replaceChildren();
        (Array.isArray(sections) ? sections : []).forEach(function (section) {
            customSectionsContainer.appendChild(createCustomSection(section));
        });
        setupRichEditors(customSectionsContainer);
        updateCustomSectionControls();
    }

    function collectCustomSections() {
        return Array.from(customSectionsContainer.querySelectorAll(".admin-custom-section")).map(function (section, index) {
            const editor = section.querySelector("[data-rich-editor]");
            return {
                id: section.dataset.sectionId,
                title: section.querySelector("input").value.trim(),
                content: sanitizeRichHTML(editor.innerHTML),
                position: index
            };
        });
    }

    function createSummaryDetail(detail) {
        const row = element("div", "admin-summary-detail-row");
        const label = element("input");
        label.type = "text";
        label.maxLength = 100;
        label.placeholder = "Label (e.g. Age limit)";
        label.setAttribute("aria-label", "Summary detail label");
        label.value = detail.label || "";
        const value = element("input");
        value.type = "text";
        value.maxLength = 500;
        value.placeholder = "Value";
        value.setAttribute("aria-label", "Summary detail value");
        value.value = detail.value || "";
        const remove = element("button", "admin-text-button admin-delete-button", "Remove");
        remove.type = "button";
        remove.dataset.summaryAction = "remove";
        row.append(label, value, remove);
        return row;
    }

    function renderSummaryDetails(details) {
        summaryDetailsContainer.replaceChildren();
        (Array.isArray(details) ? details : []).forEach(function (detail) {
            summaryDetailsContainer.appendChild(createSummaryDetail(detail));
        });
    }

    function collectSummaryDetails() {
        return Array.from(summaryDetailsContainer.querySelectorAll(".admin-summary-detail-row")).map(function (row) {
            return {
                label: row.querySelectorAll("input")[0].value.trim(),
                value: row.querySelectorAll("input")[1].value.trim()
            };
        }).filter(function (detail) { return detail.label && detail.value; });
    }

    function displayDate(value) {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
    }

    async function verifyAdmin(session) {
        if (!session || !session.user) {
            currentAdmin = null;
            setAuthenticatedView(false);
            return false;
        }

        if (currentAdmin && currentAdmin.id === session.user.id && !dashboard.hidden) return true;
        if (pendingAdminUserId === session.user.id && pendingAdminVerification) return pendingAdminVerification;

        pendingAdminUserId = session.user.id;
        pendingAdminVerification = verifyAdminAccess(session);
        try {
            return await pendingAdminVerification;
        } finally {
            if (pendingAdminUserId === session.user.id) {
                pendingAdminUserId = "";
                pendingAdminVerification = null;
            }
        }
    }

    async function verifyAdminAccess(session) {

        const { data: allowed, error } = await client.rpc("is_admin");
        if (error) {
            currentAdmin = null;
            setAuthenticatedView(false);
            setMessage(loginMessage, "Could not verify admin access right now. Your session is still saved; reload this page to try again.", true);
            return false;
        }
        if (allowed !== true) {
            await client.auth.signOut({ scope: "local" });
            currentAdmin = null;
            setAuthenticatedView(false);
            setMessage(loginMessage, "This account does not have SeekScholarship admin access.", true);
            return false;
        }

        currentAdmin = session.user;
        document.querySelector("#admin-account-label").textContent = session.user.email || "Signed in as admin";
        setMessage(loginMessage, "", false);
        setAuthenticatedView(true);
        await loadDashboardData();
        return true;
    }

    function renderCountryOptions() {
        const selected = countrySelect.value;
        countrySelect.replaceChildren(new Option("Not specified", ""));
        countries.forEach(function (country) {
            countrySelect.add(new Option(country.is_active ? country.name : `${country.name} (hidden)`, country.code));
        });
        countrySelect.add(new Option("+ Add New Country", "__add_new__"));
        if (countries.some(function (country) { return country.code === selected; })) {
            countrySelect.value = selected;
        }
        lastCountrySelection = countrySelect.value;
    }

    function renderScholarshipTable() {
        scholarshipRows.replaceChildren();
        if (!scholarships.length) {
            const row = element("tr");
            const cell = element("td", "admin-empty-cell", "No scholarship records yet. Add one above.");
            cell.colSpan = 5;
            row.appendChild(cell);
            scholarshipRows.appendChild(row);
            return;
        }

        scholarships.forEach(function (scholarship) {
            const country = countries.find(function (item) { return item.code === scholarship.country_code; });
            const row = element("tr");
            row.append(
                element("td", "admin-table-title", scholarship.name),
                element("td", "", country ? country.name : "Unknown country"),
                element("td", "", scholarship.status),
                element("td", "", displayDate(scholarship.updated_at || scholarship.created_at))
            );
            const actions = element("td", "admin-row-actions");
            const edit = element("button", "admin-text-button", "Edit");
            edit.type = "button";
            edit.dataset.action = "edit";
            edit.dataset.id = scholarship.id;
            const remove = element("button", "admin-text-button admin-delete-button", "Delete");
            remove.type = "button";
            remove.dataset.action = "delete";
            remove.dataset.id = scholarship.id;
            actions.append(edit, remove);
            row.appendChild(actions);
            scholarshipRows.appendChild(row);
        });
    }

    function renderCountryTable() {
        countryRows.replaceChildren();
        countries.forEach(function (country) {
            const row = element("tr");
            const flagCell = element("td");
            if (country.flag_path) {
                const flag = element("img", "admin-flag-preview");
                flag.src = country.flag_path;
                flag.alt = `${country.name} flag`;
                flagCell.appendChild(flag);
            } else {
                flagCell.textContent = "No flag";
            }
            row.append(
                flagCell,
                element("td", "admin-table-title", country.name),
                element("td", "", country.code),
                element("td", "", country.is_active ? "Visible" : "Hidden")
            );
            const actionCell = element("td", "admin-row-actions");
            const edit = element("button", "admin-text-button", "Edit");
            edit.type = "button";
            edit.dataset.action = "edit-country";
            edit.dataset.code = country.code;
            actionCell.appendChild(edit);
            row.appendChild(actionCell);
            countryRows.appendChild(row);
        });
    }

    async function loadDashboardData() {
        setMessage(globalMessage, "Loading records...", false);
        try {
            const [countryResult, scholarshipResult] = await Promise.all([
                client.from("countries").select("code, name, flag_path, is_active").order("name"),
                client.from("scholarships").select("*").order("updated_at", { ascending: false })
            ]);

            if (countryResult.error || scholarshipResult.error) {
                const error = countryResult.error || scholarshipResult.error;
                setMessage(globalMessage, `Could not load admin data: ${error.message}`, true);
                return false;
            }

            countries = countryResult.data || [];
            scholarships = scholarshipResult.data || [];
            renderCountryOptions();
            renderCountryTable();
            renderScholarshipTable();
            setMessage(globalMessage, "", false);
            return true;
        } catch (error) {
            setMessage(globalMessage, `Could not load admin data: ${error.message || "Check your connection and try again."}`, true);
            return false;
        }
    }
    function resetScholarshipForm() {
        scholarshipForm.reset();
        setRichEditorValue("description", "");
        setRichEditorValue("application", "");
        renderCustomSections([]);
        renderSummaryDetails([]);
        document.querySelector("#admin-is-featured").checked = false;
        countrySelect.value = "";
        lastCountrySelection = "";
        inlineCountryPanel.hidden = true;
        document.querySelector("#scholarship-record-id").value = "";
        document.querySelector("#scholarship-editor-title").textContent = "Add a scholarship";
        document.querySelector("#scholarship-save-button").textContent = "Save scholarship";
        document.querySelector("#scholarship-cancel-edit").hidden = true;
        setMessage(scholarshipMessage, "", false);
    }

    function editScholarship(id) {
        const scholarship = scholarships.find(function (item) { return String(item.id) === String(id); });
        if (!scholarship) return;

        document.querySelector("#scholarship-record-id").value = scholarship.id;
        document.querySelector("#admin-scholarship-name").value = scholarship.name;
        document.querySelector("#admin-country").value = scholarship.country_code || "";
        lastCountrySelection = scholarship.country_code || "";
        document.querySelector("#admin-degree").value = scholarship.degree;
        document.querySelector("#admin-funding").value = scholarship.funding;
        document.querySelector("#admin-field").value = scholarship.field || "";
        document.querySelector("#admin-gender").value = scholarship.gender || "";
        document.querySelector("#admin-deadline").value = scholarship.deadline || "";
        document.querySelector("#admin-eligible-countries").value = scholarship.eligible_countries || "";
        document.querySelector("#admin-language").value = scholarship.language_requirement || "";
        setRichEditorValue("description", scholarship.description);
        document.querySelector("#admin-benefits").value = (scholarship.benefits || []).join("\n");
        document.querySelector("#admin-eligibility").value = (scholarship.eligibility || []).join("\n");
        document.querySelector("#admin-documents").value = (scholarship.documents || []).join("\n");
        setRichEditorValue("application", scholarship.application || "");
        document.querySelector("#admin-application-url").value = scholarship.application_url;
        document.querySelector("#admin-status").value = scholarship.status;
        renderCustomSections(scholarship.custom_sections || []);
        renderSummaryDetails(scholarship.summary_details || []);
        document.querySelector("#admin-is-featured").checked = scholarship.is_featured === true;
        document.querySelector("#scholarship-editor-title").textContent = "Edit scholarship";
        document.querySelector("#scholarship-save-button").textContent = "Update scholarship";
        document.querySelector("#scholarship-cancel-edit").hidden = false;
        document.querySelector("#scholarship-editor-title").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function saveScholarship(event) {
        event.preventDefault();
        scholarshipForm.querySelectorAll("[data-rich-editor]").forEach(syncEditorValue);
        const recordId = document.querySelector("#scholarship-record-id").value;
        const values = new FormData(scholarshipForm);
        const record = {
            name: String(values.get("name")).trim(),
            country_code: values.get("country_code") || null,
            degree: String(values.get("degree")).trim(),
            field: String(values.get("field")).trim(),
            funding: String(values.get("funding")).trim(),
            gender: String(values.get("gender")).trim(),
            eligible_countries: String(values.get("eligible_countries")).trim(),
            language_requirement: String(values.get("language_requirement")).trim(),
            deadline: String(values.get("deadline")).trim() || null,
            description: sanitizeRichHTML(String(values.get("description") || "")),
            benefits: optionList(String(values.get("benefits") || "")),
            eligibility: optionList(String(values.get("eligibility") || "")),
            documents: optionList(String(values.get("documents") || "")),
            application: sanitizeRichHTML(String(values.get("application") || "")),
            application_url: String(values.get("application_url")).trim(),
            status: values.get("status"),
            custom_sections: collectCustomSections(),
            summary_details: collectSummaryDetails(),
            is_featured: document.querySelector("#admin-is-featured").checked
        };

        if (record.application_url) {
            let applicationUrl;
            try {
                applicationUrl = new URL(record.application_url);
            } catch (error) {
                setMessage(scholarshipMessage, "Enter a valid official application URL.", true);
                return;
            }
            if (!['http:', 'https:'].includes(applicationUrl.protocol)) {
                setMessage(scholarshipMessage, "The application URL must start with http:// or https://.", true);
                return;
            }
        }

        const button = document.querySelector("#scholarship-save-button");
        button.disabled = true;
        setMessage(scholarshipMessage, recordId ? "Updating scholarship…" : "Saving scholarship…", false);
        let query = client.from("scholarships");
        if (recordId) {
            query = query.update(record).eq("id", Number(recordId));
        } else {
            record.created_by = currentAdmin.id;
            query = query.insert(record);
        }
        try {
            const { error } = await query;
            if (error) throw error;

            resetScholarshipForm();
            if (await loadDashboardData()) {
                setMessage(globalMessage, recordId ? "Scholarship updated." : "Scholarship saved.", false);
            }
        } catch (error) {
            setMessage(scholarshipMessage, `Could not save scholarship: ${error.message || "Check your connection and try again."}`, true);
        } finally {
            button.disabled = false;
        }
    }

    async function deleteScholarship(id) {
        const record = scholarships.find(function (item) { return String(item.id) === String(id); });
        if (!record || !window.confirm(`Delete “${record.name}”? This cannot be undone.`)) return;

        try {
            const { error } = await client.from("scholarships").delete().eq("id", Number(id));
            if (error) throw error;
            if (await loadDashboardData()) setMessage(globalMessage, "Scholarship deleted.", false);
        } catch (error) {
            setMessage(globalMessage, `Could not delete scholarship: ${error.message || "Check your connection and try again."}`, true);
        }
    }

    async function addCountryInline() {
        const codeInput = document.querySelector("#inline-country-code");
        const nameInput = document.querySelector("#inline-country-name");
        const fileInput = document.querySelector("#inline-country-flag");
        const button = document.querySelector("#inline-country-save");
        const code = codeInput.value.trim().toUpperCase();
        const name = nameInput.value.trim();
        const file = fileInput.files[0];
        if (!/^[A-Z]{2}$/.test(code)) {
            setMessage(inlineCountryMessage, "Enter a valid two-letter country code.", true);
            return;
        }
        if (!name) {
            setMessage(inlineCountryMessage, "Enter the country name.", true);
            return;
        }
        const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
        if (file && !extensions[file.type]) {
            setMessage(inlineCountryMessage, "Use a PNG, JPEG, WebP, or SVG flag image.", true);
            return;
        }

        button.disabled = true;
        setMessage(inlineCountryMessage, "Saving country...", false);
        try {
            const { error: insertError } = await client.from("countries").insert({
                code: code,
                name: name,
                flag_path: null,
                is_active: true
            });
            if (insertError) throw insertError;

            let flagWarning = "";
            if (file) {
                const path = `flags/${code.toLowerCase()}.${extensions[file.type]}`;
                const { data: upload, error: uploadError } = await client.storage
                    .from("country-flags")
                    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
                if (uploadError) {
                    flagWarning = `Country added, but its flag upload failed: ${uploadError.message}`;
                } else {
                    const flagPath = client.storage.from("country-flags").getPublicUrl(upload.path).data.publicUrl;
                    const { error: updateError } = await client.from("countries").update({ flag_path: flagPath }).eq("code", code);
                    if (updateError) flagWarning = `Country added, but the flag link could not be saved: ${updateError.message}`;
                }
            }

            await loadDashboardData();
            if (!countrySelect.querySelector(`option[value="${code}"]`)) countrySelect.add(new Option(name, code));
            countrySelect.value = code;
            inlineCountryPanel.hidden = true;
            codeInput.value = "";
            nameInput.value = "";
            fileInput.value = "";
            setMessage(inlineCountryMessage, flagWarning || "Country added and selected.", Boolean(flagWarning));
        } catch (error) {
            setMessage(inlineCountryMessage, `Could not add country: ${error.message || "Check your connection and try again."}`, true);
        } finally {
            button.disabled = false;
        }
    }

    function resetCountryForm() {
        countryForm.reset();
        editingCountryCode = "";
        document.querySelector("#editing-country-code").value = "";
        document.querySelector("#admin-country-code").disabled = false;
        document.querySelector("#admin-country-active").checked = true;
        document.querySelector("#country-save-button").textContent = "Add country";
        document.querySelector("#country-cancel-edit").hidden = true;
        setMessage(countryMessage, "", false);
    }

    function editCountry(code) {
        const country = countries.find(function (item) { return item.code === code; });
        if (!country) return;
        editingCountryCode = country.code;
        document.querySelector("#editing-country-code").value = country.code;
        document.querySelector("#admin-country-code").value = country.code;
        document.querySelector("#admin-country-code").disabled = true;
        document.querySelector("#admin-country-name").value = country.name;
        document.querySelector("#admin-country-active").checked = country.is_active;
        document.querySelector("#country-save-button").textContent = "Update country";
        document.querySelector("#country-cancel-edit").hidden = false;
        document.querySelector("#countries-manager-title").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function saveCountry(event) {
        event.preventDefault();
        const wasEditing = Boolean(editingCountryCode);
        const code = document.querySelector("#admin-country-code").value.trim().toUpperCase();
        const name = document.querySelector("#admin-country-name").value.trim();
        const file = document.querySelector("#admin-flag-file").files[0];
        const isActive = document.querySelector("#admin-country-active").checked;
        const previous = countries.find(function (country) { return country.code === editingCountryCode; });
        const extensions = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/svg+xml": "svg"
        };
        if (!editingCountryCode && !file) {
            setMessage(countryMessage, "Choose a flag image for the new country.", true);
            return;
        }
        if (file && !extensions[file.type]) {
            setMessage(countryMessage, "Use a PNG, JPEG, WebP, or SVG flag image.", true);
            return;
        }

        const saveButton = document.querySelector("#country-save-button");
        saveButton.disabled = true;
        setMessage(countryMessage, wasEditing ? "Updating country..." : "Saving country...", false);
        try {
            let flagPath = previous ? previous.flag_path : "";
            if (file) {
                const path = `flags/${code.toLowerCase()}.${extensions[file.type]}`;
                const { data: upload, error: uploadError } = await client.storage
                    .from("country-flags")
                    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
                if (uploadError) throw uploadError;
                flagPath = client.storage.from("country-flags").getPublicUrl(upload.path).data.publicUrl;
            }

            const record = { code, name, flag_path: flagPath, is_active: isActive };
            const result = wasEditing
                ? await client.from("countries").update(record).eq("code", editingCountryCode)
                : await client.from("countries").insert(record);
            if (result.error) throw result.error;

            resetCountryForm();
            if (await loadDashboardData()) {
                setMessage(globalMessage, wasEditing ? "Country updated." : "Country saved.", false);
            }
        } catch (error) {
            setMessage(countryMessage, `Could not save country: ${error.message || "Check your connection and try again."}`, true);
        } finally {
            saveButton.disabled = false;
        }
    }
    async function start() {
        if (!client) {
            setMessage(loginMessage, window.scholarlySupabaseError || "Supabase is unavailable. Reload this page and try again.", true);
            loginForm.querySelector("button[type='submit']").disabled = true;
            return;
        }

        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const submit = loginForm.querySelector("button[type='submit']");
            submit.disabled = true;
            setMessage(loginMessage, "Signing in...", false);
            const email = document.querySelector("#admin-email").value.trim();
            const password = document.querySelector("#admin-password").value;
            try {
                const { data, error } = await client.auth.signInWithPassword({ email, password });
                if (error) throw error;
                setMessage(loginMessage, "Checking admin access...", false);
                await verifyAdmin(data.session);
            } catch (error) {
                setMessage(loginMessage, "Sign-in failed. Check your email and password, then try again.", true);
            } finally {
                submit.disabled = false;
            }
        });
        document.querySelector("#admin-forgot-password").addEventListener("click", function () {
            document.querySelector("#admin-recovery-email").value = document.querySelector("#admin-email").value.trim();
            loginPanel.hidden = true;
            recoveryPanel.hidden = false;
            newPasswordPanel.hidden = true;
            setMessage(recoveryMessage, "", false);
        });

        document.querySelector("#admin-back-to-login").addEventListener("click", showLoginView);

        recoveryForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const button = recoveryForm.querySelector("button[type='submit']");
            const email = document.querySelector("#admin-recovery-email").value.trim();
            button.disabled = true;
            setMessage(recoveryMessage, "Sending reset link…", false);
            const redirectTo = new URL("admin.html?mode=recovery", window.location.href).href;
            const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
            button.disabled = false;
            if (error) {
                setMessage(recoveryMessage, `We could not send a reset email: ${error.message}`, true);
                return;
            }
            setMessage(recoveryMessage, "If an account exists for that address, a password reset link has been sent.", false);
        });

        newPasswordForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const password = document.querySelector("#admin-new-password").value;
            const confirmation = document.querySelector("#admin-confirm-password").value;
            if (password !== confirmation) {
                setMessage(newPasswordMessage, "The passwords do not match.", true);
                return;
            }

            const button = newPasswordForm.querySelector("button[type='submit']");
            button.disabled = true;
            setMessage(newPasswordMessage, "Updating your password…", false);
            const { error } = await client.auth.updateUser({ password: password });
            button.disabled = false;
            if (error) {
                setMessage(newPasswordMessage, "Could not update the password. The reset link may have expired; request a new one and try again.", true);
                return;
            }

            passwordRecoveryMode = false;
            await client.auth.signOut({ scope: "local" });
            showLoginView();
            setMessage(loginMessage, "Password updated. Sign in with your new password.", false);
        });

        client.auth.onAuthStateChange(function (event, session) {
            window.setTimeout(function () {
                if (event === "SIGNED_OUT") {
                    currentAdmin = null;
                    if (passwordRecoveryMode) showLoginView();
                    else setAuthenticatedView(false);
                } else if (event === "PASSWORD_RECOVERY" && session) {
                    showPasswordUpdate(session);
                } else if (session && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
                    verifyAdmin(session);
                }
            }, 0);
        });

        const { data, error } = await client.auth.getSession();
        if (error) {
            setMessage(loginMessage, "Could not restore your admin session. Sign in again.", true);
            return;
        }
        const isRecoveryReturn = passwordRecoveryMode && data.session;
        if (isRecoveryReturn) {
            await showPasswordUpdate(data.session);
        } else if (data.session) {
            await verifyAdmin(data.session);
        } else if (passwordRecoveryMode) {
            showLoginView();
            setMessage(loginMessage, "This reset link is invalid or has expired. Request a new password reset email.", true);
        }

        document.querySelector("#admin-signout").addEventListener("click", async function () {
            await client.auth.signOut({ scope: "local" });
            setAuthenticatedView(false);
            setMessage(loginMessage, "You have signed out.", false);
        });
        scholarshipForm.addEventListener("submit", saveScholarship);
        setupRichEditors(scholarshipForm);
        scholarshipForm.addEventListener("mousedown", function (event) {
            if (event.target.closest("[data-rich-command]")) event.preventDefault();
        });
        scholarshipForm.addEventListener("click", function (event) {
            const richButton = event.target.closest("button[data-rich-command]");
            if (richButton) {
                applyRichCommand(richButton);
                return;
            }

            const customButton = event.target.closest("button[data-custom-action]");
            if (!customButton) return;
            const section = customButton.closest(".admin-custom-section");
            if (customButton.dataset.customAction === "remove") section.remove();
            if (customButton.dataset.customAction === "up" && section.previousElementSibling) {
                section.parentNode.insertBefore(section, section.previousElementSibling);
            }
            if (customButton.dataset.customAction === "down" && section.nextElementSibling) {
                section.parentNode.insertBefore(section.nextElementSibling, section);
            }
            updateCustomSectionControls();
        });
        document.querySelector("#add-custom-section").addEventListener("click", function () {
            customSectionsContainer.appendChild(createCustomSection({ title: "", content: "" }));
            setupRichEditors(customSectionsContainer.lastElementChild);
            updateCustomSectionControls();
            customSectionsContainer.lastElementChild.querySelector("input").focus();
        });
        document.querySelector("#add-summary-detail").addEventListener("click", function () {
            const row = createSummaryDetail({ label: "", value: "" });
            summaryDetailsContainer.appendChild(row);
            row.querySelector("input").focus();
        });
        summaryDetailsContainer.addEventListener("click", function (event) {
            const button = event.target.closest("button[data-summary-action='remove']");
            if (button) button.closest(".admin-summary-detail-row").remove();
        });
        countrySelect.addEventListener("change", function () {
            if (countrySelect.value === "__add_new__") {
                countrySelect.value = lastCountrySelection;
                inlineCountryPanel.hidden = false;
                setMessage(inlineCountryMessage, "", false);
                document.querySelector("#inline-country-name").focus();
                return;
            }
            lastCountrySelection = countrySelect.value;
        });
        document.querySelector("#inline-country-save").addEventListener("click", addCountryInline);
        document.querySelector("#inline-country-cancel").addEventListener("click", function () {
            inlineCountryPanel.hidden = true;
            countrySelect.value = lastCountrySelection;
            setMessage(inlineCountryMessage, "", false);
        });
        document.querySelector("#scholarship-cancel-edit").addEventListener("click", resetScholarshipForm);
        scholarshipRows.addEventListener("click", function (event) {
            const button = event.target.closest("button[data-action]");
            if (!button) return;
            if (button.dataset.action === "edit") editScholarship(button.dataset.id);
            if (button.dataset.action === "delete") deleteScholarship(button.dataset.id);
        });
        countryForm.addEventListener("submit", saveCountry);
        document.querySelector("#country-cancel-edit").addEventListener("click", resetCountryForm);
        countryRows.addEventListener("click", function (event) {
            const button = event.target.closest("button[data-action='edit-country']");
            if (button) editCountry(button.dataset.code);
        });
    }

    start();
})();
