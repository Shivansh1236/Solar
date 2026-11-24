// =========================================
// CONFIGURATION
// =========================================

const HISTORY_API_URL = "http://127.0.0.1:5000/history?limit=500";

let predictionHistory = [];


// =========================================
// HTML ELEMENTS
// =========================================

const historyTableBody = document.getElementById("historyTableBody");
const totalCount = document.getElementById("totalCount");
const displayCount = document.getElementById("displayCount");
const statusMessage = document.getElementById("statusMessage");
const refreshButton = document.getElementById("refreshButton");
const downloadButton = document.getElementById("downloadButton");
const searchInput = document.getElementById("searchInput");
const plantFilter = document.getElementById("plantFilter");


// =========================================
// FORMATTERS
// =========================================

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || value === "") return "—";

    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(decimals) : "—";
}

function escapeHTML(value) {
    return String(value ?? "—")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getPlantName(record) {
    const id = Number(record.plant_id);
    if (id === 1 || id === 2) return `Plant ${id}`;
    return record.plant_name || "Unknown plant";
}

function getModelName(record) {
    return record.model_name || "Unknown model";
}


// =========================================
// FILTER RECORDS
// =========================================

function getFilteredRecords() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedPlant = plantFilter.value;

    return predictionHistory.filter(function (record) {
        const plantId = String(record.plant_id ?? "");

        if (selectedPlant !== "all" && plantId !== selectedPlant) {
            return false;
        }

        if (!query) return true;

        const searchableValues = [
            record.id,
            formatDate(record.created_at),
            plantId,
            getPlantName(record),
            getModelName(record),
            record.source_key
        ];

        return searchableValues.some(function (value) {
            return String(value ?? "").toLowerCase().includes(query);
        });
    });
}


// =========================================
// DISPLAY HISTORY
// =========================================

function renderHistory(records) {
    historyTableBody.innerHTML = "";
    displayCount.textContent = records.length;
    downloadButton.disabled = records.length === 0;

    if (records.length === 0) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="14" class="empty-message">
                    No matching prediction records found.
                </td>
            </tr>
        `;
        return;
    }

    records.forEach(function (record) {
        const row = document.createElement("tr");
        const plantId = Number(record.plant_id);
        const plantClass = plantId === 2 ? "plant-two" : "plant-one";

        row.innerHTML = `
            <td>#${escapeHTML(record.id)}</td>
            <td>${escapeHTML(formatDate(record.created_at))}</td>
            <td><span class="plant-pill ${plantClass}">${escapeHTML(getPlantName(record))}</span></td>
            <td><span class="model-pill">${escapeHTML(getModelName(record))}</span></td>
            <td class="power-value">${escapeHTML(formatNumber(record.predicted_ac_power))} kW</td>
            <td>${escapeHTML(record.source_key)}</td>
            <td>${escapeHTML(formatNumber(record.ambient_temperature))}</td>
            <td>${escapeHTML(formatNumber(record.module_temperature))}</td>
            <td>${escapeHTML(formatNumber(record.irradiation, 4))}</td>
            <td>${escapeHTML(record.hour)}</td>
            <td>${escapeHTML(record.day)}</td>
            <td>${escapeHTML(record.month)}</td>
            <td>${escapeHTML(record.weekday)}</td>
            <td>${Number(record.is_weekend) === 1 ? "Yes" : "No"}</td>
        `;

        historyTableBody.appendChild(row);
    });
}

function applyFilters() {
    const records = getFilteredRecords();
    renderHistory(records);

    const filterLabel = plantFilter.value === "all"
        ? "all plants"
        : `Plant ${plantFilter.value}`;

    statusMessage.textContent =
        `Showing ${records.length} of ${predictionHistory.length} loaded records (${filterLabel}).`;
}


// =========================================
// FETCH HISTORY FROM FLASK
// =========================================

async function loadHistory() {
    refreshButton.disabled = true;
    refreshButton.textContent = "Loading...";
    statusMessage.textContent = "Connecting to database...";

    try {
        const response = await fetch(HISTORY_API_URL);

        if (!response.ok) {
            let errorMessage = "History request failed.";
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (_) {
                // Keep the generic message when the server response is not JSON.
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        predictionHistory = Array.isArray(data.history) ? data.history : [];

        totalCount.textContent = data.count ?? predictionHistory.length;
        applyFilters();

    } catch (error) {
        console.error(error);
        predictionHistory = [];
        totalCount.textContent = "0";
        displayCount.textContent = "0";
        downloadButton.disabled = true;

        historyTableBody.innerHTML = `
            <tr>
                <td colspan="14" class="empty-message">
                    Could not load history. ${escapeHTML(error.message)}
                    Make sure Flask is running and the database migration has been applied.
                </td>
            </tr>
        `;

        statusMessage.textContent = "Connection failed. Please check the backend and database.";
    } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = "↻ Refresh";
    }
}


// =========================================
// CSV EXPORT — EXPORTS CURRENT FILTERED VIEW
// =========================================

function downloadCSV() {
    const records = getFilteredRecords();
    if (records.length === 0) return;

    const columns = [
        ["id", "Prediction ID"],
        ["created_at", "Created At"],
        ["plant_id", "Plant ID"],
        ["plant_name", "Plant Name"],
        ["model_name", "Model Name"],
        ["source_key", "Source Key"],
        ["ambient_temperature", "Ambient Temperature (C)"],
        ["module_temperature", "Module Temperature (C)"],
        ["irradiation", "Irradiation (kW/m2)"],
        ["hour", "Hour"],
        ["day", "Day"],
        ["month", "Month"],
        ["weekday", "Weekday"],
        ["is_weekend", "Is Weekend"],
        ["predicted_ac_power", "Predicted AC Power (kW)"]
    ];

    const csvEscape = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csvRows = [columns.map(column => csvEscape(column[1])).join(",")];

    records.forEach(function (record) {
        const values = columns.map(function (column) {
            let value = record[column[0]];
            if (column[0] === "plant_name") value = getPlantName(record);
            if (column[0] === "model_name") value = getModelName(record);
            if (column[0] === "created_at") value = formatDate(record.created_at);
            return csvEscape(value);
        });
        csvRows.push(values.join(","));
    });

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = plantFilter.value === "all"
        ? "solar_prediction_history_all_plants.csv"
        : `solar_prediction_history_plant_${plantFilter.value}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}


// =========================================
// EVENT LISTENERS
// =========================================

refreshButton.addEventListener("click", loadHistory);
downloadButton.addEventListener("click", downloadCSV);
searchInput.addEventListener("input", applyFilters);
plantFilter.addEventListener("change", applyFilters);


// =========================================
// INITIAL LOAD
// =========================================

loadHistory();
