// ==UserScript==
// @name         Steam License Cleanup
// @namespace    https://github.com/PatrickJnr/Steam-License-Cleanup/
// @version      1.6
// @description  Scans all license pages and allows interactive review before removing licenses based on keywords or date ranges. Features exclusion list, pagination handling, progress bar with detailed feedback, rate-limit handling, persistent settings, summary modal with export, and cancellation.
// @author       PatrickJnr (Enhanced by Gemini)
// @match        https://store.steampowered.com/account/licenses*
// @grant        none
// @updateURL    https://github.com/PatrickJnr/Steam-License-Cleanup/raw/main/Steam-License-Cleanup.user.js
// @downloadURL  https://github.com/PatrickJnr/Steam-License-Cleanup/raw/main/Steam-License-Cleanup.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- CONFIGURATION & STATE ---
    const DEFAULTS = {
        keywords: ["trailer", "teaser", "demo", "cinematic", "pegi", "esrb", "soundtrack", "playtest", "beta", "alpha"],
        exclusions: ["(Soundtrack)", "Game Developer"], // Example: protect items with these words
        removalDelay: 600000 // Default 10 minute (600,000 ms) delay between removals
    };
    let state = {
        settings: {
            keywords: [],
            exclusions: [],
            removalDelay: 600000
        },
        isCleaning: false,
        removedDetails: [],
        scannedLicenses: [] // Holds { packageId, details }
    };

    // --- STYLES ---
    const addGlobalStyle = () => {
        const style = document.createElement('style');
        style.innerHTML = `
            :root {
                --steam-blue: #66c0f4;
                --steam-blue-hover: #a2d9f8;
                --steam-dark: #1b2838;
                --steam-dark-gradient: linear-gradient(to bottom, #2a475e 5%, #1b2838 95%);
                --steam-light-text: #c7d5e0;
                --steam-white-text: #ffffff;
                --steam-error: #ff3300;
                --steam-warning: #ffcc00;
            }
            .cleanup-controls-container {
                text-align: center;
                margin-bottom: 20px;
                padding: 10px;
                background-color: rgba(0,0,0,0.2);
                border-radius: 5px;
            }
            .date-range-container {
                margin-bottom: 15px;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 15px;
            }
            .date-range-container label {
                color: var(--steam-light-text);
                font-size: 14px;
            }
            .date-range-container input[type="date"] {
                background-color: #2a3f5a;
                border: 1px solid var(--steam-blue);
                color: var(--steam-light-text);
                padding: 5px;
                border-radius: 3px;
            }
            .steam-cleanup-button {
                background: var(--steam-dark-gradient);
                border: 1px solid var(--steam-blue);
                border-radius: 4px;
                color: var(--steam-light-text);
                font-size: 14px;
                padding: 10px 20px;
                cursor: pointer;
                margin: 5px;
                display: inline-block;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                transition: all 0.2s;
            }
            .steam-cleanup-button:hover, .steam-cleanup-button:focus {
                background: var(--steam-blue);
                color: var(--steam-white-text);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                outline: none;
            }
            .steam-cleanup-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .steam-cleanup-button.cancel-button {
                background: #c23b22;
                border-color: #ff6347;
            }
            .steam-cleanup-button.cancel-button:hover {
                background: #e04a31;
            }
            .progress-bar-container {
                width: 100%;
                background-color: var(--steam-dark);
                border-radius: 4px;
                margin: 10px auto;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                max-width: 600px;
                padding: 5px;
            }
            .progress-bar {
                width: 0%;
                height: 20px;
                background-color: var(--steam-blue);
                border-radius: 4px;
                text-align: center;
                line-height: 20px;
                color: var(--steam-white-text);
                transition: width 0.3s ease-in-out, background-color 0.3s;
            }
            .progress-status-text {
                text-align: center;
                margin-top: 5px;
                color: var(--steam-light-text);
                font-style: italic;
            }
            .modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.7); z-index: 999; display: flex;
                align-items: center; justify-content: center;
            }
            .modal-content {
                background: var(--steam-dark); color: var(--steam-light-text);
                padding: 30px; border: 1px solid var(--steam-blue); border-radius: 8px;
                box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3); z-index: 1000;
                width: 90%; max-width: 800px; max-height: 90vh;
                display: flex; flex-direction: column;
                animation: fadeIn 0.3s;
            }
            .modal-header h2 {
                margin: 0 0 20px 0;
            }
            .modal-body {
                overflow-y: auto;
                margin-bottom: 20px;
            }
            .modal-footer {
                margin-top: auto;
                text-align: right;
                border-top: 1px solid #3a4b5e;
                padding-top: 20px;
            }
            .modal-textarea {
                width: 95%;
                height: 80px;
                margin-bottom: 15px;
                background: #2a3f5a;
                color: var(--steam-light-text);
                border: 1px solid var(--steam-blue);
                padding: 10px;
            }
             .modal-input {
                width: 100px;
                margin-bottom: 15px;
                background: #2a3f5a;
                color: var(--steam-light-text);
                border: 1px solid var(--steam-blue);
                padding: 5px;
            }
            #review-list {
                list-style: none;
                padding: 0;
            }
            #review-list label {
                display: block;
                padding: 8px;
                border-radius: 3px;
                transition: background-color 0.2s;
                cursor: pointer;
                word-break: break-word;
            }
            #review-list label:hover {
                background-color: #2a475e;
            }
            #review-list input {
                margin-right: 10px;
                vertical-align: middle;
            }
            .review-controls {
                margin-bottom: 15px;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    };

    // --- HELPERS ---
    const parseSteamDate = (dateString) => {
        if (!dateString) return null;
        // Steam format is "25 Jan, 2023". The comma is optional for JS Date parsing.
        try {
            return new Date(dateString.replace(',', ''));
        } catch (e) {
            return null;
        }
    };

    // --- LOCALSTORAGE & SETTINGS ---
    const loadSettings = () => {
        try {
            const saved = localStorage.getItem('steamLicenseCleanupSettings');
            const parsed = saved ? JSON.parse(saved) : {};
            // Merge saved settings with defaults to ensure new settings are applied
            state.settings = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...parsed };
        } catch (e) {
            console.error("Failed to load settings:", e);
            state.settings = JSON.parse(JSON.stringify(DEFAULTS));
        }
    };

    const saveSettings = () => {
        try {
            localStorage.setItem('steamLicenseCleanupSettings', JSON.stringify(state.settings));
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
    };

    // --- CORE LOGIC: SCANNING & REMOVAL ---
    const parseTableForDetails = (tableElement) => {
        const foundLicenses = [];
        if (!tableElement) return foundLicenses;

        const { keywords, exclusions } = state.settings;
        const useKeywordlessMode = keywords.length === 0 && exclusions.length === 0;

        const keywordRegex = keywords.length > 0 ? new RegExp(`\\b(?:${keywords.join("|")})\\b`, "i") : null;
        const exclusionRegex = exclusions.length > 0 ? new RegExp(`\\b(?:${exclusions.join("|")})\\b`, "i") : null;

        const startDateInput = document.getElementById('start-date-input').valueAsDate;
        const endDateInput = document.getElementById('end-date-input').valueAsDate;

        for (const row of tableElement.rows) {
            // Date check
            const dateText = row.cells[0]?.textContent?.trim();
            const licenseDate = parseSteamDate(dateText);
            if (!licenseDate) continue; // Skip rows we can't parse a date from

            if (startDateInput && licenseDate < startDateInput) continue;
            if (endDateInput) {
                const endOfDay = new Date(endDateInput);
                endOfDay.setHours(23, 59, 59, 999); // Ensure end date is inclusive
                if (licenseDate > endOfDay) continue;
            }

            // Keyword check
            const cell = row.cells[1];
            const cellText = cell?.textContent;
            if (!cellText) continue;

            let isMatch = false;
            if (useKeywordlessMode) {
                isMatch = true; // Match everything if keywords are empty
            } else if (keywordRegex && keywordRegex.test(cellText)) {
                if (!exclusionRegex || !exclusionRegex.test(cellText)) {
                    isMatch = true; // Match if inclusion is found and exclusion is not
                }
            }

            if (!isMatch) continue;

            const link = cell.querySelector('a[href*="RemoveFreeLicense"]');
            const packageIdMatch = link ? /RemoveFreeLicense\s*\(\s*(\d+)/.exec(link.href) : null;
            if (packageIdMatch) {
                const packageId = packageIdMatch[1];
                const cleanText = cellText.trim().replace(/[\r\n\t]+/g, " ");
                const details = `${cleanText} (Acquired: ${dateText}, Package ID: ${packageId})`;
                foundLicenses.push({ packageId, details });
            }
        }
        return foundLicenses;
    };


    const scanAllPages = async () => {
        const { modal, statusElement } = showWorkingModal(
            "Scanning Licenses",
            "Please wait while all license pages are scanned. This may take a moment."
        );

        const allLicenses = [];
        const existingIds = new Set();
        let page = 1;
        let hasMorePages = true;

        while (hasMorePages) {
            statusElement.textContent = `Scanning Page ${page}...`;
            try {
                const response = await fetch(`${window.location.pathname.split('?')[0]}?p=${page}`);
                if (!response.ok) {
                    hasMorePages = false;
                    continue;
                }

                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const table = doc.querySelector(".account_table");
                const licensesOnPage = parseTableForDetails(table);

                // Stop if we find an empty table or a page without a "next" button
                if (!table || licensesOnPage.length === 0 || !doc.querySelector('.pagebtn.next')) {
                    hasMorePages = false;
                }

                licensesOnPage.forEach(license => {
                    if (!existingIds.has(license.packageId)) {
                        allLicenses.push(license);
                        existingIds.add(license.packageId);
                    }
                });

                if (hasMorePages) page++;

            } catch (error) {
                console.error(`Failed to fetch page ${page}:`, error);
                hasMorePages = false;
            }
        }

        document.body.removeChild(modal); // Close scanning modal
        state.scannedLicenses = allLicenses;
        showReviewModal();
    };


    const removeNextPackage = async (licensesToRemove, i, progressBar, statusText) => {
        if (i >= licensesToRemove.length || !state.isCleaning) {
            state.isCleaning = false;
            updateUICleanupFinished();
            return;
        }

        const license = licensesToRemove[i];
        const progress = ((i + 1) / licensesToRemove.length) * 100;

        try {
            updateProgressBar(progressBar, statusText, progress, `Removing: ${license.details}`);
            const response = await fetch("https://store.steampowered.com/account/removelicense", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
                body: `sessionid=${encodeURIComponent(window.g_sessionID)}&packageid=${license.packageId}`,
            });

            if (!response.ok) throw new Error(`HTTP Status ${response.status}`);
            const data = await response.json();

            if (data.success === 84) { // Rate limited
                updateProgressBar(progressBar, statusText, progress, "Rate limited. Retrying in 30s...", "var(--steam-warning)");
                await new Promise(resolve => setTimeout(resolve, 30000));
                removeNextPackage(licensesToRemove, i, progressBar, statusText); // Retry same package
            } else if (data.success) { // Success
                state.removedDetails.push(license.details);
                // Wait for the configured delay before proceeding
                if (i + 1 < licensesToRemove.length) {
                    const totalCount = licensesToRemove.length;
                    const removedCount = state.removedDetails.length; // This will be i + 1
                    const delayInSeconds = state.settings.removalDelay / 1000;
                    const statusMessage = `Removed ${removedCount} of ${totalCount}. Waiting ${delayInSeconds}s for next removal...`;
                    updateProgressBar(progressBar, statusText, progress, statusMessage);
                    await new Promise(resolve => setTimeout(resolve, state.settings.removalDelay));
                }
                removeNextPackage(licensesToRemove, i + 1, progressBar, statusText); // Next package
            } else { // Fail
                throw new Error(data.error || 'Unknown response from Steam API.');
            }
        } catch (error) {
            console.error(`Network or parsing error for ${license.packageId}: ${error}`);
            updateProgressBar(progressBar, statusText, progress, "Network error. Retrying in 30s...", "var(--steam-error)");
            await new Promise(resolve => setTimeout(resolve, 30000));
            removeNextPackage(licensesToRemove, i, progressBar, statusText); // Retry same package
        }
    };

    const startCleanup = (licensesToRemove) => {
        if (!window.g_sessionID) {
            showInfoModal("Error: Not Logged In", "Could not find a valid Steam session ID. Please make sure you are fully logged into store.steampowered.com and refresh the page.");
            return;
        }
        const mainContainer = document.getElementById("cleanup-controls");
        document.getElementById("scan-button").disabled = true;

        const { progressBarContainer, progressBar, statusText } = createProgressBar();
        mainContainer.appendChild(progressBarContainer);
        const cancelButton = createCancelButton();
        mainContainer.appendChild(cancelButton);

        state.isCleaning = true;
        state.removedDetails = []; // Reset for this run
        removeNextPackage(licensesToRemove, 0, progressBar, statusText);
    };

    // --- UI & MODALS ---
    const createButton = (id, text, title, onClick) => {
        const button = document.createElement("button");
        button.id = id;
        button.textContent = text;
        button.title = title;
        button.className = "steam-cleanup-button";
        button.addEventListener("click", onClick);
        return button;
    };

    const createCancelButton = () => {
        const button = createButton("cancel-button", "Cancel", "Stop the cleanup process", () => state.isCleaning = false);
        button.classList.add("cancel-button");
        return button;
    };

    const createProgressBar = () => {
        const progressBarContainer = document.createElement("div");
        progressBarContainer.className = "progress-bar-container";
        const progressBar = document.createElement("div");
        progressBar.className = "progress-bar";
        const statusText = document.createElement("div");
        statusText.className = "progress-status-text";
        progressBarContainer.append(progressBar, statusText);
        return { progressBarContainer, progressBar, statusText };
    };

    const updateProgressBar = (progressBar, statusText, progress, text, color = 'var(--steam-blue)') => {
        if (!progressBar) return;
        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${Math.round(progress)}%`;
        progressBar.style.backgroundColor = color;
        statusText.textContent = text;
    };

    const showModal = (title, content, buttons, isClosable = true) => {
        const modalOverlay = document.createElement("div");
        modalOverlay.className = "modal-overlay";
        const modalContent = document.createElement("div");
        modalContent.className = "modal-content";
        modalContent.innerHTML = `<div class="modal-header"><h2>${title}</h2></div><div class="modal-body">${content}</div>`;
        const footer = document.createElement("div");
        footer.className = "modal-footer";

        buttons.forEach(btnInfo => {
            const button = createButton(btnInfo.id || '', btnInfo.text, '', () => {
                if (btnInfo.onClick) btnInfo.onClick();
                if (btnInfo.closes) document.body.removeChild(modalOverlay);
            });
            if (btnInfo.class) button.classList.add(btnInfo.class);
            footer.appendChild(button);
        });

        if (isClosable) {
            const closeButton = createButton('modal-close', 'Close', 'Close this dialog', () => document.body.removeChild(modalOverlay));
            footer.appendChild(closeButton);
        }

        modalContent.appendChild(footer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
        return modalOverlay;
    };

    const showInfoModal = (title, message) => {
        showModal(title, `<p>${message}</p>`, []);
    };



    const showWorkingModal = (title, initialMessage) => {
        const content = `<p>${initialMessage}</p><p id="working-status" style="font-weight: bold; text-align: center; margin-top: 15px;"></p>`;
        const modal = showModal(title, content, [], false);
        const statusElement = modal.querySelector('#working-status');
        return { modal, statusElement };
    };

    const exportRemovedLicenses = () => {
        if (state.removedDetails.length === 0) return;
        const textToSave = state.removedDetails.join("\n");
        const blob = new Blob([textToSave], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const date = new Date().toISOString().slice(0, 10);
        a.download = `steam_removed_licenses_${date}.txt`;
        document.body.appendChild(a); // Required for Firefox compatibility
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const showSettingsModal = () => {
        const content = `
            <p><strong>Inclusion Keywords (one per line or comma-separated):</strong><br>Licenses containing these words will be selected for removal.</p>
            <textarea id="keywords-textarea" class="modal-textarea">${state.settings.keywords.join(", ")}</textarea>
            <p><strong>Exclusion Keywords (one per line or comma-separated):</strong><br>Licenses containing these words will be protected, even if they match inclusion keywords.</p>
            <textarea id="exclusions-textarea" class="modal-textarea">${state.settings.exclusions.join(", ")}</textarea>
            <p style="color: var(--steam-warning);"><strong>Warning:</strong> If both keyword fields above are empty, the script will select ALL removable licenses within the chosen date range for review.</p>
            <hr style="border-color: #3a4b5e; margin: 20px 0;">
            <p><strong>Delay Between Removals (milliseconds):</strong><br>A delay after each removal to prevent API errors. 1000ms = 1 second. Default is 600000 (10 minutes).</p>
            <input type="number" id="delay-input" class="modal-input" value="${state.settings.removalDelay}">
        `;
        const parseInput = (text) => text.split(/[,\n]/).map(k => k.trim()).filter(Boolean);
        const buttons = [{
            text: "Save",
            closes: true,
            onClick: () => {
                state.settings.keywords = parseInput(document.getElementById("keywords-textarea").value);
                state.settings.exclusions = parseInput(document.getElementById("exclusions-textarea").value);
                state.settings.removalDelay = parseInt(document.getElementById("delay-input").value, 10) || DEFAULTS.removalDelay;
                saveSettings();
            }
        }, {
            text: "Reset to Default",
            closes: false,
            onClick: () => {
                state.settings = JSON.parse(JSON.stringify(DEFAULTS));
                document.getElementById("keywords-textarea").value = state.settings.keywords.join(", ");
                document.getElementById("exclusions-textarea").value = state.settings.exclusions.join(", ");
                document.getElementById("delay-input").value = state.settings.removalDelay;
            }
        }];
        showModal("Cleanup Settings", content, buttons);
    };

    const showReviewModal = () => {
        if (state.scannedLicenses.length === 0) {
            showInfoModal("Scan Complete", "No removable licenses matching your criteria were found.");
            return;
        }
        const listItems = state.scannedLicenses.map((lic, index) =>
            `<li><label><input type="checkbox" class="license-checkbox" data-index="${index}" checked> ${lic.details}</label></li>`
        ).join("");

        const content = `
            <p>Found <strong>${state.scannedLicenses.length}</strong> license(s) matching your criteria. Review the list below and uncheck any you wish to keep.</p>
            <div class="review-controls">
                <button class="steam-cleanup-button" id="select-all">Select All</button>
                <button class="steam-cleanup-button" id="deselect-all">Deselect All</button>
            </div>
            <ul id="review-list">${listItems}</ul>
        `;
        const buttons = [{
            text: `Remove Selected (0)`,
            id: "review-proceed-button",
            closes: true,
            onClick: () => {
                const selectedLicenses = [];
                document.querySelectorAll('.license-checkbox:checked').forEach(cb => {
                    selectedLicenses.push(state.scannedLicenses[cb.dataset.index]);
                });
                if (selectedLicenses.length > 0) showConfirmModal(selectedLicenses);
            }
        }];
        const modal = showModal("Review Licenses to Remove", content, buttons);
        const proceedBtn = modal.querySelector('#review-proceed-button');
        const checkboxes = modal.querySelectorAll('.license-checkbox');
        const updateCount = () => {
            const count = modal.querySelectorAll('.license-checkbox:checked').length;
            proceedBtn.textContent = `Remove Selected (${count})`;
            proceedBtn.disabled = count === 0;
        };
        checkboxes.forEach(cb => cb.addEventListener('change', updateCount));
        modal.querySelector('#select-all').addEventListener('click', () => { checkboxes.forEach(cb => cb.checked = true); updateCount(); });
        modal.querySelector('#deselect-all').addEventListener('click', () => { checkboxes.forEach(cb => cb.checked = false); updateCount(); });
        updateCount();
    };

    const showConfirmModal = (selectedLicenses) => {
        const content = `<p>You are about to permanently remove <strong>${selectedLicenses.length}</strong> license(s). This action cannot be undone. Are you sure?</p>`;
        const buttons = [{
            text: "Yes, Clean Up",
            closes: true,
            onClick: () => startCleanup(selectedLicenses)
        }];
        showModal("Confirm Cleanup", content, buttons);
    };

    const showSummaryModal = () => {
        const listItems = state.removedDetails.map(d => `<li>${d}</li>`).join("");
        const content = `<p>Cleanup complete. Successfully removed <strong>${state.removedDetails.length}</strong> license(s).</p> ${state.removedDetails.length > 0 ? `<ul>${listItems}</ul>` : ''}`;
        const buttons = [{
            text: "Export List",
            closes: false,
            id: 'export-button',
            onClick: exportRemovedLicenses
        }, {
            text: "Refresh Page",
            closes: true,
            onClick: () => window.location.reload()
        }];
        const modal = showModal("Cleanup Summary", content, buttons);
        if (state.removedDetails.length === 0) {
            modal.querySelector('#export-button').style.display = 'none';
        }
    };

    const updateUICleanupFinished = () => {
        document.querySelector(".progress-bar-container")?.remove();
        document.getElementById("cancel-button")?.remove();
        document.getElementById("scan-button").disabled = false;
        showSummaryModal();
    };

    // --- INITIALIZATION ---
    const init = () => {
        addGlobalStyle();
        loadSettings();
        const pageContent = document.querySelector(".page_content_ctn");
        if (!pageContent) {
            console.error("Page content container not found.");
            return;
        }

        const controlsContainer = document.createElement("div");
        controlsContainer.className = "cleanup-controls-container";
        controlsContainer.id = "cleanup-controls";

        // Date Range UI
        const dateRangeContainer = document.createElement("div");
        dateRangeContainer.className = "date-range-container";
        dateRangeContainer.innerHTML = `
            <label for="start-date-input">Start Date:</label>
            <input type="date" id="start-date-input">
            <label for="end-date-input">End Date:</label>
            <input type="date" id="end-date-input">
        `;
        controlsContainer.appendChild(dateRangeContainer);

        const scanButton = createButton("scan-button", "Scan for Removable Licenses", "Scans all pages for licenses matching your criteria", scanAllPages);
        const settingsButton = createButton("settings-button", "Settings", "Customize keywords, exclusions, and delay", showSettingsModal);

        controlsContainer.append(scanButton, settingsButton);
        pageContent.parentNode.insertBefore(controlsContainer, pageContent);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
