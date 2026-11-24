// =========================================
// ANALYSIS DESK CONFIGURATION
// =========================================

const API_BASE = "http://127.0.0.1:5000";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

let activeSessionId = null;
let pollingTimer = null;
let pollingIntervalMs = null;
let isCollecting = false;
let displayedSessionId = null;
let displayedReadings = [];
let activeLocation = null;
let analysisChartState = null;
let analysisChartHoverIndex = null;
let analysisChartTooltip = null;
let activeMaxReadings = null;
let activeReadingCount = 0;
let stopRequested = false;
let consecutiveCollectionFailures = 0;
let lastWeatherObservationTime = null;
let activeModuleTemperatureMode = "estimated";
let activeModuleTemperatureValue = null;
let activeSourceKeyMode = "fixed";
let activeSourceKeyValue = 0;
let activeAnalysisMode = "comparison";
let activeSinglePlantId = 1;
let singlePlantModeUnlocked = false;
let displayedSession = null;
let activeSharedChartScale = null;
const SESSION_META_STORAGE_KEY = "solarAnalysisSessionMetadataV1";

const elements = {
    form: document.getElementById("analysisForm"),
    location: document.getElementById("locationInput"),
    sessionName: document.getElementById("sessionNameInput"),
    sessionTag: document.getElementById("sessionTagInput"),
    sessionDescription: document.getElementById("sessionDescriptionInput"),
    interval: document.getElementById("intervalInput"),
    maxReadings: document.getElementById("maxReadingsInput"),
    moduleMode: document.getElementById("moduleMode"),
    moduleValue: document.getElementById("moduleValue"),
    sourceMode: document.getElementById("sourceMode"),
    sourceValue: document.getElementById("sourceValue"),
    unlockSinglePlant: document.getElementById("unlockSinglePlantButton"),
    singlePlantOptions: document.getElementById("singlePlantOptions"),
    singlePlantSelect: document.getElementById("singlePlantSelect"),
    lockComparison: document.getElementById("lockComparisonButton"),
    analysisModeLabel: document.getElementById("analysisModeLabel"),
    modeLockNote: document.getElementById("modeLockNote"),
    start: document.getElementById("startButton"),
    stop: document.getElementById("stopButton"),
    message: document.getElementById("formMessage"),
    statusBadge: document.getElementById("statusBadge"),
    statusLocation: document.getElementById("statusLocation"),
    statusDescription: document.getElementById("statusDescription"),
    statusSessionId: document.getElementById("statusSessionId"),
    statusInterval: document.getElementById("statusInterval"),
    statusReadings: document.getElementById("statusReadings"),
    statusLastFetch: document.getElementById("statusLastFetch"),
    progressLabel: document.getElementById("progressLabel"),
    progressText: document.getElementById("progressText"),
    progressTrack: document.getElementById("progressTrack"),
    progressBar: document.getElementById("sessionProgressBar"),
    summaryContext: document.getElementById("summaryContext"),
    summaryStatus: document.getElementById("summaryStatus"),
    summaryDuration: document.getElementById("summaryDuration"),
    summaryAverageRadiation: document.getElementById("summaryAverageRadiation"),
    summaryUniqueWeather: document.getElementById("summaryUniqueWeather"),
    summaryRepeatedWeather: document.getElementById("summaryRepeatedWeather"),
    summaryHighlights: document.getElementById("summaryHighlights"),
    sessionSearch: document.getElementById("sessionSearchInput"),
    sessionStatusFilter: document.getElementById("sessionStatusFilter"),
    sessionFromDate: document.getElementById("sessionFromDate"),
    sessionToDate: document.getElementById("sessionToDate"),
    sessionFilterCount: document.getElementById("sessionFilterCount"),
    clearSessionFilters: document.getElementById("clearSessionFilters"),
    metricCount: document.getElementById("metricCount"),
    metricPlant1Latest: document.getElementById("metricPlant1Latest"),
    metricPlant2Latest: document.getElementById("metricPlant2Latest"),
    metricPlant1Model: document.getElementById("metricPlant1Model"),
    metricPlant2Model: document.getElementById("metricPlant2Model"),
    plant1ModelHeading: document.getElementById("plant1ModelHeading"),
    plant2ModelHeading: document.getElementById("plant2ModelHeading"),
    metricDifference: document.getElementById("metricDifference"),
    reportTitle: document.getElementById("reportTitle"),
    reportSubtitle: document.getElementById("reportSubtitle"),
    chart: document.getElementById("powerChart"),
    chartEmpty: document.getElementById("chartEmpty"),
    chartPlant2: document.getElementById("powerChartPlant2"),
    chartEmptyPlant2: document.getElementById("chartEmptyPlant2"),
    chartGrid: document.getElementById("comparisonChartGrid"),
    chartCardPlant1: document.getElementById("plant1ChartCard"),
    chartCardPlant2: document.getElementById("plant2ChartCard"),
    sessionsList: document.getElementById("sessionsList"),
    readingsBody: document.getElementById("readingsTableBody"),
    readingCount: document.getElementById("readingTableCount"),
    refreshReport: document.getElementById("refreshReportButton"),
    refreshSessions: document.getElementById("refreshSessionsButton")
};


// =========================================
// HELPERS
// =========================================

function setMessage(message, isError = false) {
    elements.message.textContent = message;
    elements.message.style.color = isError ? "#bd4b4b" : "#82909d";
}

function setStatus(status, description = "") {
    elements.statusBadge.textContent = status.toUpperCase();
    elements.statusBadge.className = `status-badge ${status}`;
    if (description) elements.statusDescription.textContent = description;
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function formatSessionDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}

function formatSessionTime(value) {
    if (!value) return "Time unavailable";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time unavailable";

    return new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function readSessionMetadataStore() {
    try {
        const value = JSON.parse(localStorage.getItem(SESSION_META_STORAGE_KEY) || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (error) {
        console.warn("Could not read local session labels:", error);
        return {};
    }
}

function getSessionMetadata(sessionId) {
    const store = readSessionMetadataStore();
    return store[String(sessionId)] || {};
}

function saveSessionMetadata(sessionId, metadata) {
    try {
        const store = readSessionMetadataStore();
        store[String(sessionId)] = {
            ...(store[String(sessionId)] || {}),
            ...metadata,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(SESSION_META_STORAGE_KEY, JSON.stringify(store));
        return true;
    } catch (error) {
        console.warn("Could not save local session metadata:", error);
        setMessage("Session saved, but its custom label could not be stored in this browser.", true);
        return false;
    }
}

function getSessionLocation(session) {
    const location = session?.location_name || session?.location || "Unknown location";
    return String(location).trim() || "Unknown location";
}

function getSessionDisplayName(session) {
    const sessionId = session.id ?? session.session_id;
    const metadata = sessionId ? getSessionMetadata(sessionId) : {};
    const customName = String(metadata.name || "").trim();
    if (customName) return customName;
    return `${getSessionLocation(session)} — ${formatSessionDate(session.started_at)}`;
}

function formatSessionStatus(status) {
    const value = String(status || "unknown").toLowerCase();
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatNumber(value, decimals = 2) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(decimals) : "—";
}

function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function requestJSON(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const timeoutMs = Number(options.timeoutMs) > 0
        ? Number(options.timeoutMs)
        : (method === "GET" ? 18000 : 25000);
    const explicitlyRetryable = options.retryable === true;
    const retrySafe = ["GET", "HEAD"].includes(method) || explicitlyRetryable;
    const maxAttempts = retrySafe ? 2 : 1;
    const fetchOptions = { ...options };
    delete fetchOptions.timeoutMs;
    delete fetchOptions.retryable;

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal
            });

            let data = {};
            try {
                const bodyText = await response.text();
                data = bodyText ? JSON.parse(bodyText) : {};
            } catch {
                if (response.ok) {
                    const parseError = new Error("The server returned an unreadable response.");
                    parseError.status = response.status;
                    throw parseError;
                }
            }

            if (!response.ok) {
                const error = new Error(
                    data.error || `Request failed (${response.status}).`
                );
                error.status = response.status;

                const transientStatus = [408, 429, 500, 502, 503, 504].includes(response.status);
                if (retrySafe && attempt < maxAttempts && transientStatus) {
                    const retryAfter = Number(response.headers.get("Retry-After"));
                    await delay(Number.isFinite(retryAfter) && retryAfter > 0
                        ? Math.min(retryAfter * 1000, 4000)
                        : 700 * attempt);
                    continue;
                }
                throw error;
            }

            return data;

        } catch (error) {
            let normalizedError = error;

            if (error.name === "AbortError") {
                normalizedError = new Error(
                    `Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Check your connection and try again.`
                );
                normalizedError.isTimeout = true;
            } else if (!error.status && !error.isTimeout) {
                normalizedError = new Error(
                    "Unable to reach the service. Check your internet connection and whether the Flask backend is running."
                );
                normalizedError.isNetworkError = true;
                normalizedError.cause = error;
            }

            lastError = normalizedError;
            const transientStatus = normalizedError.status &&
                [408, 429, 500, 502, 503, 504].includes(normalizedError.status);
            const shouldRetry = retrySafe && attempt < maxAttempts &&
                (!normalizedError.status || transientStatus);

            if (shouldRetry) {
                await delay(700 * attempt);
                continue;
            }

            throw normalizedError;

        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    throw lastError || new Error("The request could not be completed.");
}

function safeText(value) {
    return String(value ?? "—");
}


// =========================================
// PLANT COMPARISON MODE
// =========================================

function getSessionMode(session = {}) {
    // Older sessions predate dual-plant comparisons and remain Plant 1 legacy sessions.
    return String(session.analysis_mode || "single").toLowerCase() === "comparison"
        ? "comparison"
        : "single";
}

function getSessionSinglePlant(session = {}) {
    const value = Number(session.selected_plant_id || 1);
    return value === 2 ? 2 : 1;
}

function getPlantPower(reading, plantId) {
    if (plantId === 1) {
        // Old readings have only predicted_ac_power. New Plant 2-only rows
        // also populate that legacy field, so do not mislabel those as Plant 1.
        const hasPlantSpecificValues =
            reading.plant_1_predicted_ac_power !== undefined ||
            reading.plant_2_predicted_ac_power !== undefined;
        const value = reading.plant_1_predicted_ac_power !== undefined && reading.plant_1_predicted_ac_power !== null
            ? reading.plant_1_predicted_ac_power
            : (hasPlantSpecificValues ? null : reading.predicted_ac_power);
        const number = Number(value);
        return value === null || value === undefined || !Number.isFinite(number) ? null : number;
    }
    const value = reading.plant_2_predicted_ac_power;
    const number = Number(value);
    return value === null || value === undefined || !Number.isFinite(number) ? null : number;
}

function getPlantModelLabel(plantId, reading = {}) {
    if (plantId === 1) return reading.plant_1_model_name || "XGBoost";
    return reading.plant_2_model_name || "Random Forest";
}

function setSinglePlantUnlocked(unlocked) {
    singlePlantModeUnlocked = Boolean(unlocked);
    elements.singlePlantOptions.hidden = !singlePlantModeUnlocked;
    elements.unlockSinglePlant.textContent = singlePlantModeUnlocked
        ? "Single-plant mode unlocked"
        : "Unlock single-plant mode";
    elements.unlockSinglePlant.setAttribute("aria-expanded", String(singlePlantModeUnlocked));
    elements.analysisModeLabel.textContent = singlePlantModeUnlocked
        ? `Single-plant mode · Plant ${elements.singlePlantSelect.value}`
        : "Both plants · Default comparison";
    elements.modeLockNote.textContent = singlePlantModeUnlocked
        ? "Single-plant mode is unlocked. Choose one plant, or lock comparison mode again."
        : "🔒 Single-plant mode is locked. Unlock it only when you want to run one plant.";
}

function getRequestedAnalysisMode() {
    return singlePlantModeUnlocked
        ? { analysis_mode: "single", selected_plant_id: Number(elements.singlePlantSelect.value) }
        : { analysis_mode: "comparison", selected_plant_id: null };
}

// =========================================
// MODEL TIME FEATURES
// =========================================

function getTimeFeatures(timeString) {
    if (!timeString || !timeString.includes("T")) {
        throw new Error("Weather API did not return a valid local timestamp.");
    }

    const [datePart, timePart] = timeString.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour] = timePart.split(":").map(Number);

    const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const weekday = jsDay === 0 ? 6 : jsDay - 1;
    const isWeekend = (jsDay === 0 || jsDay === 6) ? 1 : 0;

    return { hour, day, month, weekday, isWeekend };
}


// =========================================
// OPEN-METEO
// =========================================

async function findLocation(name) {
    const url = `${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
    const data = await requestJSON(url);

    if (!Array.isArray(data.results) || data.results.length === 0) {
        throw new Error("Location not found. Try a nearby city or a more specific name.");
    }

    const location = data.results[0];
    if (!Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
        throw new Error("The location service did not return valid coordinates.");
    }
    if (!location.timezone) {
        throw new Error("The location service did not return a timezone.");
    }
    return location;
}

async function fetchCurrentWeather(latitude, longitude) {
    const url = `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}`
        + "&current=temperature_2m,shortwave_radiation&temperature_unit=celsius&timezone=auto";
    const data = await requestJSON(url, { timeoutMs: 20000 });

    if (!data.current) {
        throw new Error("Weather service returned no current conditions.");
    }

    const ambient = Number(data.current.temperature_2m);
    const radiation = Number(data.current.shortwave_radiation);
    const weatherTime = data.current.time;

    if (!Number.isFinite(ambient) || !Number.isFinite(radiation) || radiation < 0) {
        throw new Error("Weather service returned invalid temperature or solar radiation values.");
    }
    if (ambient < -90 || ambient > 70) {
        throw new Error("The weather temperature is outside the expected physical range. No reading was saved.");
    }
    if (!weatherTime || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(weatherTime)) {
        throw new Error("Weather service did not provide a valid observation timestamp.");
    }

    return { ambient, radiationWm2: radiation, weatherTime };
}


// =========================================
// CREATE AND START SESSION
// =========================================

async function startAnalysis(event) {
    event.preventDefault();

    if (activeSessionId !== null) {
        setMessage("A monitoring session is already active in this page.", true);
        return;
    }

    const locationName = elements.location.value.trim();
    const intervalMinutes = Number(elements.interval.value);
    const maxText = elements.maxReadings.value.trim();
    const maxReadings = maxText === "" ? null : Number(maxText);
    const moduleMode = elements.moduleMode.value;
    const sourceMode = elements.sourceMode.value;
    const moduleValue = elements.moduleValue.value.trim();
    const sourceValue = elements.sourceValue.value.trim();

    if (!locationName) {
        setMessage("Enter a location first.", true);
        return;
    }
    const allowedIntervals = [1, 5, 10, 15, 30, 60];
    if (!allowedIntervals.includes(intervalMinutes)) {
        setMessage("Choose one of the supported collection intervals: 1, 5, 10, 15, 30, or 60 minutes.", true);
        return;
    }
    if (maxReadings !== null && (!Number.isInteger(maxReadings) || maxReadings < 1)) {
        setMessage("Maximum readings must be a positive whole number, or left empty.", true);
        return;
    }
    if (moduleMode === "manual" && (
        moduleValue === "" ||
        !Number.isFinite(Number(moduleValue)) ||
        Number(moduleValue) < -50 ||
        Number(moduleValue) > 100
    )) {
        setMessage("Enter a module temperature between -50°C and 100°C.", true);
        return;
    }
    if (sourceMode === "manual" && (
        sourceValue === "" ||
        !Number.isInteger(Number(sourceValue)) ||
        Number(sourceValue) < 0
    )) {
        setMessage("Enter a non-negative whole-number source key.", true);
        return;
    }

    elements.start.disabled = true;
    elements.start.textContent = "Preparing session...";
    setMessage("Finding location and preparing the monitoring session...");

    try {
        const location = await findLocation(locationName);
        const modeSelection = getRequestedAnalysisMode();
        const config = {
            ...modeSelection,
            location_name: location.name,
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
            timezone: location.timezone,
            interval_minutes: intervalMinutes,
            max_readings: maxReadings,
            module_temperature_mode: moduleMode,
            module_temperature_value: moduleMode === "manual" ? Number(moduleValue) : null,
            source_key_mode: sourceMode,
            source_key_value: sourceMode === "manual" ? Number(sourceValue) : 0
        };

        const created = await requestJSON(`${API_BASE}/analysis/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config)
        });

        // Supabase analysis session IDs are UUIDs, not integers.
        activeSessionId = String(created.session_id || "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activeSessionId)) {
            activeSessionId = null;
            throw new Error("Backend did not return a valid session ID.");
        }

        const customName = elements.sessionName.value.trim();
        const sessionDescription = elements.sessionDescription.value.trim();
        const sessionTag = elements.sessionTag.value || "General";

        saveSessionMetadata(activeSessionId, {
            name: customName,
            description: sessionDescription,
            tag: sessionTag,
            favorite: false
        });

        activeAnalysisMode = created.analysis_mode || modeSelection.analysis_mode;
        activeSinglePlantId = Number(created.selected_plant_id || modeSelection.selected_plant_id || 1);
        activeMaxReadings = maxReadings;
        activeReadingCount = 0;
        activeLocation = location;
        displayedSessionId = activeSessionId;
        pollingIntervalMs = intervalMinutes * 60 * 1000;
        activeModuleTemperatureMode = moduleMode;
        activeModuleTemperatureValue = moduleMode === "manual" ? Number(moduleValue) : null;
        activeSourceKeyMode = sourceMode;
        activeSourceKeyValue = sourceMode === "manual" ? Number(sourceValue) : 0;
        consecutiveCollectionFailures = 0;
        lastWeatherObservationTime = null;
        stopRequested = false;

        localStorage.setItem("solarActiveAnalysisSession", String(activeSessionId));

        updateActiveUI(location.name, intervalMinutes, maxReadings);
        setMessage("Session created. Fetching the first weather reading now...");

        // First reading is collected immediately; next readings follow the selected interval.
        await collectReading();

        if (activeSessionId !== null) {
            pollingTimer = window.setInterval(collectReading, pollingIntervalMs);
        }

        await loadSessions();

    } catch (error) {
        console.error(error);
        if (activeSessionId !== null) {
            await stopActiveSession(false);
        }

        if (activeSessionId !== null) {
            // Stop could not be confirmed. Keep the session reference and
            // prevent a second session from being created in this browser.
            elements.start.disabled = true;
            elements.stop.disabled = false;
            setConfigurationLocked(true);
            setMessage(
                `The session may still be active on the server. Press Stop after the connection is restored. ${error.message}`,
                true
            );
        } else {
            resetStartButton();
            const uncertainty = (error.isTimeout || error.isNetworkError)
                ? " The creation request may have reached Flask even though the response was interrupted. Check Past Analysis Sessions before trying again."
                : "";
            setMessage(
                `${error.message || "Could not start the analysis session."}${uncertainty}`,
                true
            );
        }
    }
}

function updateActiveUI(locationName, intervalMinutes, maxReadings = null) {
    const customName = elements.sessionName.value.trim();
    setStatus("running", activeAnalysisMode === "comparison"
        ? "One weather observation is being processed by both plant models at every interval."
        : `Only Plant ${activeSinglePlantId} is being processed at every interval.`);
    elements.statusLocation.textContent = locationName;
    elements.statusSessionId.textContent = customName || `${locationName} — ${formatSessionDate(new Date())}`;
    elements.statusInterval.textContent = `${intervalMinutes} min`;
    elements.statusReadings.textContent = "0";
    elements.statusLastFetch.textContent = "—";
    elements.start.disabled = true;
    elements.stop.disabled = false;
    elements.start.textContent = "Session running";
    setConfigurationLocked(true);
    updateSessionProgress(0, maxReadings, "running");
}

function updateSessionProgress(readingCount, maxReadings, status = "running") {
    const count = Math.max(0, Number(readingCount) || 0);
    const hasLimit = Number.isFinite(Number(maxReadings)) && maxReadings !== null && maxReadings !== "";
    elements.progressLabel.textContent = status === "completed"
        ? "Collection completed"
        : status === "stopped"
            ? "Collection stopped"
            : "Collection progress";

    if (hasLimit) {
        const limit = Math.max(1, Number(maxReadings));
        const percent = Math.min(100, (count / limit) * 100);
        elements.progressBar.style.width = `${percent}%`;
        elements.progressTrack.setAttribute("aria-valuenow", String(Math.round(percent)));
        elements.progressText.textContent = `${count} / ${limit} readings (${Math.round(percent)}%)`;
    } else {
        elements.progressBar.style.width = count > 0 ? "100%" : "0%";
        elements.progressBar.classList.toggle("unlimited-progress", status === "running");
        elements.progressTrack.setAttribute("aria-valuenow", "0");
        elements.progressText.textContent = `${count} ${count === 1 ? "reading" : "readings"} · No limit`;
    }

    if (status !== "running") {
        elements.progressBar.classList.remove("unlimited-progress");
    }
}

function setConfigurationLocked(locked) {
    [
        elements.location,
        elements.sessionName,
        elements.sessionTag,
        elements.sessionDescription,
        elements.interval,
        elements.maxReadings,
        elements.moduleMode,
        elements.moduleValue,
        elements.sourceMode,
        elements.sourceValue,
        elements.unlockSinglePlant,
        elements.singlePlantSelect,
        elements.lockComparison
    ].forEach(element => {
        if (element) element.disabled = locked;
    });

    // Preserve each manual field's mode-dependent disabled state when unlocked.
    if (!locked) {
        elements.moduleValue.disabled = elements.moduleMode.value !== "manual";
        elements.sourceValue.disabled = elements.sourceMode.value !== "manual";
    }
}

function resetStartButton() {
    elements.start.disabled = false;
    elements.start.innerHTML = 'Start analysis <span>↗</span>';
    elements.stop.disabled = true;
    setConfigurationLocked(false);
}


// =========================================
// COLLECT ONE READING
// =========================================

async function collectReading() {
    if (activeSessionId === null || isCollecting || stopRequested) return;

    isCollecting = true;
    const sessionId = activeSessionId;
    const requestStartedAt = Date.now();
    let saveRequestStarted = false;
    let attemptedWeatherTime = null;

    setMessage("Fetching current weather and generating a model estimate...");

    try {
        const weather = await fetchCurrentWeather(
            activeLocation.latitude,
            activeLocation.longitude
        );

        if (stopRequested || activeSessionId !== sessionId) return;

        const time = getTimeFeatures(weather.weatherTime);
        attemptedWeatherTime = weather.weatherTime;

        const moduleTemperature = activeModuleTemperatureMode === "manual"
            ? activeModuleTemperatureValue
            : Math.max(weather.ambient, weather.ambient + weather.radiationWm2 * 0.025);

        const sourceKey = activeSourceKeyMode === "manual"
            ? activeSourceKeyValue
            : 0;

        if (
            !Number.isFinite(moduleTemperature) ||
            !Number.isFinite(sourceKey) ||
            !Number.isFinite(weather.radiationWm2 / 1000)
        ) {
            throw new Error("Prepared model inputs contain invalid numbers. No reading was saved.");
        }

        const repeatedWeatherObservation =
            lastWeatherObservationTime !== null &&
            lastWeatherObservationTime === weather.weatherTime;

        const readingPayload = {
            weather_time_local: weather.weatherTime,
            source_key: sourceKey,
            ambient_temperature: weather.ambient,
            module_temperature: moduleTemperature,
            shortwave_radiation_wm2: weather.radiationWm2,
            irradiation: weather.radiationWm2 / 1000,
            hour: time.hour,
            day: time.day,
            month: time.month,
            weekday: time.weekday,
            is_weekend: time.isWeekend
        };

        if (stopRequested || activeSessionId !== sessionId) return;

        saveRequestStarted = true;
        const saved = await requestJSON(
            `${API_BASE}/analysis/sessions/${sessionId}/readings`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(readingPayload),
                timeoutMs: 30000
                // Intentionally not retryable: this request writes to Supabase.
                // An automatic POST retry could create duplicate rows.
            }
        );

        consecutiveCollectionFailures = 0;
        lastWeatherObservationTime = weather.weatherTime;
        elements.statusLastFetch.textContent = formatDate(new Date().toISOString());
        activeReadingCount = Number(saved.total_readings ?? Number(elements.statusReadings.textContent) + 1);
        elements.statusReadings.textContent = String(activeReadingCount);
        updateSessionProgress(activeReadingCount, activeMaxReadings, saved.completed ? "completed" : "running");

        const repeatNote = repeatedWeatherObservation
            ? " The weather observation timestamp is unchanged from the previous reading; this duplicate timestamp is retained for data-quality analysis."
            : "";

        const savedSummary = saved.analysis_mode === "comparison"
            ? `Plant 1: ${formatNumber(saved.plant_1_predicted_ac_power)} kW · Plant 2: ${formatNumber(saved.plant_2_predicted_ac_power)} kW`
            : `Plant ${saved.plant_id}: ${formatNumber(saved.predicted_ac_power)} kW`;
        setMessage(`Comparison reading saved. ${savedSummary}.${repeatNote}`);

        if (displayedSessionId === sessionId) {
            await loadSessionReport(sessionId, false);
        }

        if (saved.completed) {
            clearPollingTimer();
            activeSessionId = null;
            stopRequested = false;
            localStorage.removeItem("solarActiveAnalysisSession");
            setStatus("completed", "The configured maximum number of readings has been reached.");
            updateSessionProgress(activeReadingCount, activeMaxReadings, "completed");
            resetStartButton();
            await loadSessions();
        }

    } catch (error) {
        console.error(error);
        consecutiveCollectionFailures += 1;

        // A timed-out/network-interrupted write may have reached the server.
        // Verify the saved rows once rather than resending the same POST.
        let recoveredSavedWrite = false;
        if (saveRequestStarted && attemptedWeatherTime && (error.isTimeout || error.isNetworkError)) {
            try {
                const data = await requestJSON(
                    `${API_BASE}/analysis/sessions/${sessionId}/readings`,
                    { timeoutMs: 12000 }
                );
                const rows = Array.isArray(data.readings) ? data.readings : [];
                const matchingRecentRow = rows.find(row => {
                    if (String(row.weather_time_local) !== String(attemptedWeatherTime)) return false;
                    const fetchedAt = new Date(row.fetched_at).getTime();
                    return Number.isFinite(fetchedAt) &&
                        Math.abs(fetchedAt - requestStartedAt) <= 30000;
                });

                if (matchingRecentRow) {
                    recoveredSavedWrite = true;
                    consecutiveCollectionFailures = 0;
                    lastWeatherObservationTime = attemptedWeatherTime;
                    activeReadingCount = rows.length;
                    elements.statusReadings.textContent = String(activeReadingCount);
                    updateSessionProgress(activeReadingCount, activeMaxReadings, "running");
                    elements.statusLastFetch.textContent = formatDate(matchingRecentRow.fetched_at);
                    setMessage(
                        "The save response was interrupted, but the reading was found in the database. It was not sent again."
                    );
                    if (displayedSessionId === sessionId) {
                        await loadSessionReport(sessionId, false);
                    }
                }
            } catch (verificationError) {
                console.warn("Could not verify an interrupted reading save:", verificationError);
            }
        }

        if (!recoveredSavedWrite) {
            const retryLabel = pollingIntervalMs
                ? ` The browser will try again at the next ${Math.round(pollingIntervalMs / 60000)}-minute collection interval.`
                : "";
            const uncertaintyNote = saveRequestStarted && (error.isTimeout || error.isNetworkError)
                ? " The save response was interrupted, so the server may have received it. The request was not automatically resent to avoid duplicate rows."
                : "";
            const repeatedFailureNote = consecutiveCollectionFailures >= 3
                ? ` ${consecutiveCollectionFailures} consecutive attempts have failed. Check the internet connection, Open-Meteo availability, and Flask terminal.`
                : "";

            setMessage(
                `Collection attempt failed: ${error.message}.${uncertaintyNote}${retryLabel}${repeatedFailureNote}`,
                true
            );
        }
    } finally {
        isCollecting = false;
    }
}

// =========================================
// STOP SESSION
// =========================================

function clearPollingTimer() {
    if (pollingTimer !== null) {
        window.clearInterval(pollingTimer);
        pollingTimer = null;
    }
}

async function stopActiveSession(showMessage = true) {
    if (activeSessionId === null) return;

    const sessionId = activeSessionId;
    stopRequested = true;
    clearPollingTimer();
    elements.stop.disabled = true;

    // Let an already-started weather/save request settle before marking the
    // session stopped on the server. This avoids a reading racing with Stop.
    const waitStartedAt = Date.now();
    while (isCollecting && Date.now() - waitStartedAt < 35000) {
        await delay(100);
    }

    if (isCollecting) {
        elements.stop.disabled = false;
        setMessage("A reading request is still in progress. Wait a moment, then press Stop again.", true);
        return;
    }

    try {
        await requestJSON(`${API_BASE}/analysis/sessions/${sessionId}/stop`, {
            method: "POST",
            timeoutMs: 15000
        });

        activeSessionId = null;
        stopRequested = false;
        localStorage.removeItem("solarActiveAnalysisSession");

        if (showMessage) {
            setMessage("Analysis session stopped. All confirmed readings remain saved.");
        }
        setStatus("stopped", "Collection has stopped. You can open this session again from Past Analysis Sessions.");
        updateSessionProgress(activeReadingCount, activeMaxReadings, "stopped");
        resetStartButton();

    } catch (error) {
        console.error(error);

        // If the server already completed/stopped it, reconcile the local state.
        if (error.status === 404 || error.status === 409) {
            activeSessionId = null;
            stopRequested = false;
            localStorage.removeItem("solarActiveAnalysisSession");
            setStatus("stopped", "The server reports that this session is no longer active.");
            updateSessionProgress(activeReadingCount, activeMaxReadings, "stopped");
            resetStartButton();
        } else {
            // Keep the UUID in localStorage and keep Stop available. The browser
            // timer is already cleared, so no more readings will be submitted.
            setStatus("error", "Browser collection is paused, but the server has not confirmed that the session is stopped.");
            elements.stop.disabled = false;
            elements.start.disabled = true;
            setMessage(
                `The browser has paused collection, but the server could not confirm Stop: ${error.message}. Restore the connection and press Stop again.`,
                true
            );
            return;
        }

    } finally {
        await loadSessions();
        if (displayedSessionId === sessionId) {
            await loadSessionReport(sessionId, false);
        }
    }
}

// =========================================
// SESSION REPORTS
// =========================================

async function loadSessionReport(sessionId, showErrors = true) {
    try {
        const [sessionData, readingData] = await Promise.all([
            requestJSON(`${API_BASE}/analysis/sessions/${sessionId}`),
            requestJSON(`${API_BASE}/analysis/sessions/${sessionId}/readings`)
        ]);

        displayedSessionId = String(sessionId);
        displayedReadings = Array.isArray(readingData.readings) ? readingData.readings : [];

        const session = sessionData.session || {};
        displayedSession = session;
        const displayName = getSessionDisplayName(session);
        const status = formatSessionStatus(session.status);
        const readingLabel = `${displayedReadings.length} saved ${displayedReadings.length === 1 ? "reading" : "readings"}`;

        const metadata = getSessionMetadata(sessionId);
        const tagLabel = metadata.tag ? ` · ${metadata.tag}` : "";
        const descriptionLabel = metadata.description ? ` ${metadata.description}` : "";

        elements.reportTitle.textContent = displayName;
        const sampleReading = displayedReadings[0] || {};
        const modeLabel = getSessionMode(session) === "comparison"
            ? "Both plants · XGBoost vs Random Forest"
            : `Plant ${getSessionSinglePlant(session)} only · ${getPlantModelLabel(getSessionSinglePlant(session), sampleReading)}`;
        elements.reportSubtitle.textContent = `Location: ${getSessionLocation(session)} · ${modeLabel} · ${formatSessionTime(session.started_at)} · ${readingLabel} · ${status}${tagLabel}`;
        elements.summaryContext.textContent = descriptionLabel.trim() || "Computed from the readings saved in this session.";
        elements.summaryStatus.textContent = status.toUpperCase();

        // Keep the user-facing status panel readable; UUID remains internal.
        elements.statusSessionId.textContent = displayName;

        renderReadings(displayedReadings, session);
        renderSessionsSelection();

    } catch (error) {
        console.error(error);
        if (showErrors) setMessage(`Could not load session report: ${error.message}`, true);
    }
}

function renderReadings(readings, session = {}) {
    analysisChartHoverIndex = null;
    hideAnalysisChartTooltip();

    const mode = getSessionMode(session);
    const selectedPlant = getSessionSinglePlant(session);
    const latest = readings.length ? readings[readings.length - 1] : null;
    const latestP1 = latest ? getPlantPower(latest, 1) : null;
    const latestP2 = latest ? getPlantPower(latest, 2) : null;
    const modelReading = readings.find(item => item.plant_1_model_name || item.plant_2_model_name) || {};
    let plant1Model = modelReading.plant_1_model_name || "XGBoost";
    let plant2Model = modelReading.plant_2_model_name || "Random Forest";
    if (mode === "single" && selectedPlant === 1) plant2Model = "Not run";
    if (mode === "single" && selectedPlant === 2) plant1Model = "Not run";
    elements.plant1ModelHeading.textContent = plant1Model;
    elements.plant2ModelHeading.textContent = plant2Model;
    elements.metricPlant1Model.textContent = `${plant1Model} · kW`;
    elements.metricPlant2Model.textContent = `${plant2Model} · kW`;

    elements.metricCount.textContent = String(readings.length);
    elements.metricPlant1Latest.textContent = latestP1 === null ? "—" : formatNumber(latestP1);
    elements.metricPlant2Latest.textContent = latestP2 === null ? "—" : formatNumber(latestP2);
    elements.metricDifference.textContent = latestP1 !== null && latestP2 !== null
        ? formatNumber(latestP1 - latestP2)
        : "—";

    elements.readingCount.textContent = `${readings.length} records`;

    if (readings.length === 0) {
        elements.readingsBody.innerHTML = '<tr><td colspan="6" class="table-empty">No readings saved in this session.</td></tr>';
    } else {
        elements.readingsBody.innerHTML = readings.slice().reverse().map(item => {
            const p1 = getPlantPower(item, 1);
            const p2 = getPlantPower(item, 2);
            return `
                <tr>
                    <td>${escapeHTML(formatDate(item.fetched_at))}</td>
                    <td>${escapeHTML(item.weather_time_local || "—")}</td>
                    <td>${escapeHTML(formatNumber(item.ambient_temperature))}</td>
                    <td>${escapeHTML(formatNumber(item.irradiation, 4))}</td>
                    <td class="power-cell plant1-power-cell">${p1 === null ? "—" : `${escapeHTML(formatNumber(p1))} kW`}</td>
                    <td class="power-cell plant2-power-cell">${p2 === null ? "—" : `${escapeHTML(formatNumber(p2))} kW`}</td>
                </tr>
            `;
        }).join("");
    }

    const comparison = mode === "comparison";
    elements.chartCardPlant1.classList.toggle("is-hidden", !comparison && selectedPlant !== 1);
    elements.chartCardPlant2.classList.toggle("is-hidden", !comparison && selectedPlant !== 2);
    elements.chartGrid.classList.toggle("single-chart", !comparison);
    elements.metricPlant1Latest.closest(".metric-card").classList.toggle("is-muted-metric", !comparison && selectedPlant !== 1);
    elements.metricPlant2Latest.closest(".metric-card").classList.toggle("is-muted-metric", !comparison && selectedPlant !== 2);

    renderSessionSummary(readings, session);
    drawComparisonCharts(readings, session);
}

function renderSessionSummary(readings, session = {}) {
    const powers1 = readings.map(item => getPlantPower(item, 1)).filter(value => value !== null);
    const powers2 = readings.map(item => getPlantPower(item, 2)).filter(value => value !== null);
    const powers = getSessionMode(session) === "comparison"
        ? [...powers1, ...powers2]
        : (getSessionSinglePlant(session) === 1 ? powers1 : powers2);
    const radiationValues = readings.map(item => Number(item.shortwave_radiation_wm2)).filter(Number.isFinite);
    const weatherTimes = readings.map(item => String(item.weather_time_local || "")).filter(Boolean);
    const uniqueWeatherTimes = new Set(weatherTimes).size;
    const repeatedWeatherTimes = Math.max(0, weatherTimes.length - uniqueWeatherTimes);

    const fetchedDates = readings
        .map(item => new Date(item.fetched_at))
        .filter(date => !Number.isNaN(date.getTime()))
        .sort((a, b) => a - b);

    let durationText = "—";
    if (fetchedDates.length >= 2) {
        const minutes = Math.max(0, Math.round((fetchedDates[fetchedDates.length - 1] - fetchedDates[0]) / 60000));
        if (minutes < 60) durationText = `${minutes} min`;
        else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            durationText = remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
        }
    } else if (fetchedDates.length === 1) {
        durationText = "1 reading";
    }

    const averageRadiation = radiationValues.length
        ? radiationValues.reduce((sum, value) => sum + value, 0) / radiationValues.length
        : null;

    elements.summaryDuration.textContent = durationText;
    elements.summaryAverageRadiation.textContent = averageRadiation === null ? "—" : `${formatNumber(averageRadiation, 1)} W/m²`;
    elements.summaryUniqueWeather.textContent = String(uniqueWeatherTimes);
    elements.summaryRepeatedWeather.textContent = String(repeatedWeatherTimes);

    if (powers.length === 0) {
        elements.summaryHighlights.textContent = "No valid power readings are available for this session yet.";
        return;
    }

    const repeatedNote = repeatedWeatherTimes > 0
        ? `${repeatedWeatherTimes} collection(s) reused an already-seen weather observation timestamp.`
        : "No repeated weather observation timestamps were found in the saved readings.";

    if (getSessionMode(session) === "comparison") {
        const average1 = powers1.length ? powers1.reduce((sum, value) => sum + value, 0) / powers1.length : null;
        const average2 = powers2.length ? powers2.reduce((sum, value) => sum + value, 0) / powers2.length : null;
        const peak1 = powers1.length ? Math.max(...powers1) : null;
        const peak2 = powers2.length ? Math.max(...powers2) : null;
        elements.summaryHighlights.textContent =
            `Plant 1 · XGBoost: average ${average1 === null ? "—" : `${formatNumber(average1)} kW`}, peak ${peak1 === null ? "—" : `${formatNumber(peak1)} kW`}. Plant 2 · Random Forest: average ${average2 === null ? "—" : `${formatNumber(average2)} kW`}, peak ${peak2 === null ? "—" : `${formatNumber(peak2)} kW`}. ${repeatedNote}`;
    } else {
        const averagePower = powers.length ? powers.reduce((sum, value) => sum + value, 0) / powers.length : null;
        const peakPower = powers.length ? Math.max(...powers) : null;
        const lowestPower = powers.length ? Math.min(...powers) : null;
        const selectedPlant = getSessionSinglePlant(session);
        elements.summaryHighlights.textContent =
            `Plant ${selectedPlant}: ${powers.length} valid power reading(s) · Average ${averagePower === null ? "—" : `${formatNumber(averagePower)} kW`} · Range ${lowestPower === null ? "—" : `${formatNumber(lowestPower)}–${formatNumber(peakPower)} kW`}. ${repeatedNote}`;
    }
}

function escapeHTML(value) {
    return String(value ?? "—")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// =========================================
// SIMPLE CANVAS LINE CHART
// =========================================

function ensureAnalysisChartTooltip() {
    if (analysisChartTooltip) return analysisChartTooltip;

    const wrap = elements.chart.closest(".chart-wrap");
    analysisChartTooltip = document.createElement("div");
    analysisChartTooltip.className = "solar-chart-tooltip";
    analysisChartTooltip.setAttribute("role", "tooltip");
    analysisChartTooltip.setAttribute("aria-hidden", "true");
    wrap.appendChild(analysisChartTooltip);

    if (!wrap.parentElement.querySelector(".chart-interaction-hint")) {
        const hint = document.createElement("div");
        hint.className = "chart-interaction-hint";
        hint.textContent = "Hover or tap a point to inspect its reading";
        wrap.insertAdjacentElement("afterend", hint);
    }

    return analysisChartTooltip;
}

function formatChartClock(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function positionAnalysisTooltip(point) {
    const tooltip = ensureAnalysisChartTooltip();
    const wrap = elements.chart.closest(".chart-wrap");
    const wrapRect = wrap.getBoundingClientRect();
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;

    tooltip.hidden = false;
    tooltip.setAttribute("aria-hidden", "false");

    const tooltipRect = tooltip.getBoundingClientRect();
    let left = point.x + 14;
    if (left + tooltipRect.width > width - 8) {
        left = point.x - tooltipRect.width - 14;
    }
    left = Math.max(8, Math.min(left, width - tooltipRect.width - 8));

    let top = point.y - tooltipRect.height - 12;
    if (top < 8) top = point.y + 14;
    top = Math.max(8, Math.min(top, height - tooltipRect.height - 8));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function showAnalysisChartTooltip(index) {
    if (!analysisChartState || !analysisChartState.points[index]) return;

    const point = analysisChartState.points[index];
    const reading = point.reading;
    const tooltip = ensureAnalysisChartTooltip();

    tooltip.innerHTML = `
        <div class="chart-tooltip-kicker">PLANT 1 · ${escapeHTML(getPlantModelLabel(1, reading))} · COLLECTED READING</div>
        <div class="chart-tooltip-time">${escapeHTML(formatDate(reading.fetched_at))}</div>
        <div class="chart-tooltip-primary">${escapeHTML(formatNumber(point.value))} <span>kW</span></div>
        <div class="chart-tooltip-grid">
            <div><span>Weather time</span><strong>${escapeHTML(reading.weather_time_local || "—")}</strong></div>
            <div><span>Ambient</span><strong>${escapeHTML(formatNumber(reading.ambient_temperature, 1))} °C</strong></div>
            <div><span>Module</span><strong>${escapeHTML(formatNumber(reading.module_temperature, 1))} °C</strong></div>
            <div><span>Model irradiation</span><strong>${escapeHTML(formatNumber(reading.irradiation, 3))}</strong></div>
            <div><span>Shortwave radiation</span><strong>${escapeHTML(formatNumber(reading.shortwave_radiation_wm2, 0))} W/m²</strong></div>
        </div>
    `;

    positionAnalysisTooltip(point);
}

function hideAnalysisChartTooltip() {
    if (!analysisChartTooltip) return;
    analysisChartTooltip.hidden = true;
    analysisChartTooltip.setAttribute("aria-hidden", "true");
}

function handleAnalysisChartPointerMove(event) {
    if (!analysisChartState || !analysisChartState.points.length) return;

    const rect = elements.chart.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const geometry = analysisChartState.geometry;

    if (
        x < geometry.left - 4 ||
        x > geometry.right + 4 ||
        y < geometry.top - 4 ||
        y > geometry.bottom + 4
    ) {
        analysisChartHoverIndex = null;
        hideAnalysisChartTooltip();
        drawPowerChart(displayedReadings);
        return;
    }

    let nearestIndex = 0;
    let nearestDistance = Infinity;

    analysisChartState.points.forEach((point, index) => {
        const distance = Math.abs(point.x - x);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });

    analysisChartHoverIndex = nearestIndex;
    drawPowerChart(displayedReadings);
    showAnalysisChartTooltip(nearestIndex);
}

function clearAnalysisChartHover() {
    if (analysisChartHoverIndex === null) return;
    analysisChartHoverIndex = null;
    hideAnalysisChartTooltip();
    drawPowerChart(displayedReadings);
}

function handleAnalysisChartKeydown(event) {
    if (!analysisChartState || !analysisChartState.points.length) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const last = analysisChartState.points.length - 1;
        const current = analysisChartHoverIndex === null ? 0 : analysisChartHoverIndex;
        analysisChartHoverIndex = Math.max(0, Math.min(last, current + (event.key === "ArrowRight" ? 1 : -1)));
        drawPowerChart(displayedReadings);
        showAnalysisChartTooltip(analysisChartHoverIndex);
    } else if (event.key === "Escape") {
        clearAnalysisChartHover();
    }
}

function drawPowerChart(readings) {
    const canvas = elements.chart;
    const ctx = canvas.getContext("2d");
    const cssWidth = canvas.clientWidth || 800;
    const cssHeight = canvas.clientHeight || 300;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const points = readings
        .map((reading, index) => ({
            index,
            reading,
            value: getPlantPower(reading, 1),
            time: reading.fetched_at
        }))
        .filter(point => Number.isFinite(point.value));

    elements.chartEmpty.style.display = points.length ? "none" : "grid";
    if (points.length === 0) {
        analysisChartState = null;
        hideAnalysisChartTooltip();
        return;
    }

    const left = 64, right = 22, top = 30, bottom = 48;
    const plotWidth = Math.max(1, cssWidth - left - right);
    const plotHeight = Math.max(1, cssHeight - top - bottom);
    const rawMin = activeSharedChartScale
        ? activeSharedChartScale.rawMin
        : Math.min(...points.map(point => point.value));
    const rawMax = activeSharedChartScale
        ? activeSharedChartScale.rawMax
        : Math.max(...points.map(point => point.value));
    let min = activeSharedChartScale ? activeSharedChartScale.min : (rawMin >= 0 ? 0 : rawMin);
    let max = activeSharedChartScale ? activeSharedChartScale.max : rawMax;
    if (max <= min) max = min + Math.max(Math.abs(min) * 0.08, 1);
    if (!activeSharedChartScale) {
        const padding = (max - min) * 0.10;
        if (rawMin < 0) min -= padding;
        max += padding;
    }

    const xFor = index => points.length === 1
        ? left + plotWidth / 2
        : left + (plotWidth * index / (points.length - 1));
    const yFor = value => top + plotHeight - ((value - min) / (max - min)) * plotHeight;

    points.forEach((point, index) => {
        point.x = xFor(index);
        point.y = yFor(point.value);
    });

    analysisChartState = {
        points,
        geometry: {
            left,
            right: left + plotWidth,
            top,
            bottom: top + plotHeight,
            width: cssWidth,
            height: cssHeight
        }
    };

    if (analysisChartHoverIndex !== null && analysisChartHoverIndex >= points.length) {
        analysisChartHoverIndex = null;
        hideAnalysisChartTooltip();
    }

    // Axis labels and grid.
    ctx.font = "10px Inter, Arial, sans-serif";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e8eef4";
    ctx.fillStyle = "#8192a2";
    ctx.textAlign = "left";
    ctx.fillText("ESTIMATED AC POWER · kW", left, 13);

    const decimals = max >= 100 ? 0 : max >= 10 ? 1 : 2;
    for (let i = 0; i <= 4; i++) {
        const y = top + (plotHeight * i / 4);
        const label = max - ((max - min) * i / 4);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + plotWidth, y);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillStyle = "#8b99a7";
        ctx.fillText(label.toFixed(decimals), left - 9, y + 3);
    }

    // Soft area fill beneath the estimated-power curve.
    const gradient = ctx.createLinearGradient(0, top, 0, top + plotHeight);
    gradient.addColorStop(0, "rgba(40,120,216,.16)");
    gradient.addColorStop(1, "rgba(40,120,216,.015)");

    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
    });
    ctx.lineTo(points[points.length - 1].x, top + plotHeight);
    ctx.lineTo(points[0].x, top + plotHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Main curve.
    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = "#2878d8";
    ctx.lineWidth = 2.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Points.
    points.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = "#2878d8";
        ctx.lineWidth = 1.8;
        ctx.stroke();
    });

    // Crosshair and selected point.
    if (analysisChartHoverIndex !== null) {
        const point = points[analysisChartHoverIndex];
        if (point) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = "rgba(40,120,216,.55)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(point.x, top);
            ctx.lineTo(point.x, top + plotHeight);
            ctx.stroke();
            ctx.restore();

            ctx.beginPath();
            ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(40,120,216,.14)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.strokeStyle = "#1559ad";
            ctx.lineWidth = 2.2;
            ctx.stroke();
        }
    }

    // Time ticks, spaced to avoid crowding.
    const tickCount = Math.min(5, points.length);
    const tickIndices = [...new Set(Array.from(
        { length: tickCount },
        (_, i) => tickCount === 1 ? 0 : Math.round(i * (points.length - 1) / (tickCount - 1))
    ))];
    ctx.fillStyle = "#8b99a7";
    ctx.textAlign = "center";
    tickIndices.forEach(index => {
        ctx.fillText(formatChartClock(points[index].time), points[index].x, cssHeight - 22);
    });
    ctx.textAlign = "right";
    ctx.fillStyle = "#a0acb7";
    ctx.font = "8px Inter, Arial, sans-serif";
    ctx.fillText("COLLECTION TIME", cssWidth - right, cssHeight - 5);

    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("aria-label", "Estimated AC power over collection time. Hover, tap, or use arrow keys to inspect readings.");
}

function getSharedChartScale(readings, session = {}) {
    const mode = getSessionMode(session);
    const selectedPlant = getSessionSinglePlant(session);
    const values = readings.flatMap(reading => {
        if (mode === "comparison") return [getPlantPower(reading, 1), getPlantPower(reading, 2)].filter(value => value !== null);
        const value = getPlantPower(reading, selectedPlant);
        return value === null ? [] : [value];
    });

    if (!values.length) return null;
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    let min = rawMin >= 0 ? 0 : rawMin;
    let max = rawMax;
    if (max <= min) max = min + Math.max(Math.abs(min) * 0.08, 1);
    const padding = (max - min) * 0.10;
    if (rawMin < 0) min -= padding;
    max += padding;
    return { rawMin, rawMax, min, max };
}

function drawPlant2PowerChart(readings, scale) {
    const canvas = elements.chartPlant2;
    const empty = elements.chartEmptyPlant2;
    const ctx = canvas.getContext("2d");
    const width = canvas.clientWidth || 700;
    const height = canvas.clientHeight || 285;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const points = readings.map(reading => ({
        reading,
        value: getPlantPower(reading, 2),
        time: reading.fetched_at
    })).filter(point => point.value !== null);

    empty.style.display = points.length ? "none" : "grid";
    if (!points.length) return;

    const left = 64, right = 22, top = 30, bottom = 48;
    const plotWidth = Math.max(1, width - left - right);
    const plotHeight = Math.max(1, height - top - bottom);
    const min = scale ? scale.min : 0;
    const max = scale ? scale.max : Math.max(...points.map(point => point.value), 1);
    const xFor = index => points.length === 1 ? left + plotWidth / 2 : left + plotWidth * index / (points.length - 1);
    const yFor = value => top + plotHeight - ((value - min) / Math.max(max - min, 1e-9)) * plotHeight;
    points.forEach((point, index) => { point.x = xFor(index); point.y = yFor(point.value); });

    ctx.font = "10px Inter, Arial, sans-serif";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e8eef4";
    ctx.fillStyle = "#8192a2";
    ctx.textAlign = "left";
    ctx.fillText("ESTIMATED AC POWER · kW", left, 13);
    const decimals = max >= 100 ? 0 : max >= 10 ? 1 : 2;
    for (let i = 0; i <= 4; i++) {
        const y = top + plotHeight * i / 4;
        const label = max - (max - min) * i / 4;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotWidth, y); ctx.stroke();
        ctx.textAlign = "right"; ctx.fillStyle = "#8b99a7"; ctx.fillText(label.toFixed(decimals), left - 9, y + 3);
    }

    const gradient = ctx.createLinearGradient(0, top, 0, top + plotHeight);
    gradient.addColorStop(0, "rgba(36,156,98,.17)");
    gradient.addColorStop(1, "rgba(36,156,98,.015)");
    ctx.beginPath();
    points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.lineTo(points[points.length - 1].x, top + plotHeight);
    ctx.lineTo(points[0].x, top + plotHeight);
    ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "#249c62"; ctx.lineWidth = 2.6; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
    points.forEach(point => {
        ctx.beginPath(); ctx.arc(point.x, point.y, 3.1, 0, Math.PI * 2);
        ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#249c62"; ctx.lineWidth = 1.8; ctx.stroke();
    });

    const tickCount = Math.min(5, points.length);
    const ticks = [...new Set(Array.from({ length: tickCount }, (_, i) => tickCount === 1 ? 0 : Math.round(i * (points.length - 1) / (tickCount - 1))))];
    ctx.fillStyle = "#8b99a7"; ctx.textAlign = "center";
    ticks.forEach(index => ctx.fillText(formatChartClock(points[index].time), points[index].x, height - 22));
    ctx.textAlign = "right"; ctx.fillStyle = "#a0acb7"; ctx.font = "8px Inter, Arial, sans-serif";
    ctx.fillText("COLLECTION TIME", width - right, height - 5);
}

function drawComparisonCharts(readings, session = {}) {
    const mode = getSessionMode(session);
    const selectedPlant = getSessionSinglePlant(session);
    const comparison = mode === "comparison";
    elements.chartCardPlant1.classList.toggle("is-hidden", !comparison && selectedPlant !== 1);
    elements.chartCardPlant2.classList.toggle("is-hidden", !comparison && selectedPlant !== 2);
    elements.chartGrid.classList.toggle("single-chart", !comparison);

    activeSharedChartScale = getSharedChartScale(readings, session);
    if (comparison || selectedPlant === 1) {
        drawPowerChart(readings);
    } else {
        // Keep the Plant 1 chart state empty while a Plant 2-only report is open.
        analysisChartState = null;
        hideAnalysisChartTooltip();
    }
    if (comparison || selectedPlant === 2) {
        drawPlant2PowerChart(readings, activeSharedChartScale);
    }
}

// Add accessible pointer and keyboard inspection once.
if (elements.chart) {
    elements.chart.addEventListener("pointermove", handleAnalysisChartPointerMove);
    elements.chart.addEventListener("pointerdown", handleAnalysisChartPointerMove);
    elements.chart.addEventListener("pointerleave", clearAnalysisChartHover);
    elements.chart.addEventListener("keydown", handleAnalysisChartKeydown);
}

// =========================================
// SESSION LIST, LOCAL LABELS AND FILTERS
// =========================================

let cachedSessions = [];

async function loadSessions() {
    try {
        const data = await requestJSON(`${API_BASE}/analysis/sessions?limit=100`);
        cachedSessions = Array.isArray(data.sessions) ? data.sessions : [];
        renderSessionsSelection();
    } catch (error) {
        console.error(error);
        elements.sessionsList.innerHTML = '<div class="list-empty">Could not load saved sessions. Check the Flask backend and database.</div>';
    }
}

function getFilteredSessions() {
    const query = elements.sessionSearch.value.trim().toLowerCase();
    const status = elements.sessionStatusFilter.value;
    const fromDate = elements.sessionFromDate.value;
    const toDate = elements.sessionToDate.value;

    let filtered = cachedSessions.filter(session => {
        const metadata = getSessionMetadata(session.id);
        const location = String(session.location_name || session.location || "");
        const haystack = [
            metadata.name,
            metadata.description,
            metadata.tag,
            location,
            formatSessionDate(session.started_at),
            formatSessionTime(session.started_at)
        ].join(" ").toLowerCase();

        if (query && !haystack.includes(query)) return false;
        if (status !== "all" && String(session.status || "").toLowerCase() !== status) return false;

        const date = session.started_at ? new Date(session.started_at) : null;
        if (fromDate && (!date || Number.isNaN(date.getTime()) || date < new Date(`${fromDate}T00:00:00`))) return false;
        if (toDate && (!date || Number.isNaN(date.getTime()) || date > new Date(`${toDate}T23:59:59.999`))) return false;

        return true;
    });

    // Favorites are browser-local; preserve newest-first order within each group.
    filtered.sort((a, b) => {
        const favA = Boolean(getSessionMetadata(a.id).favorite);
        const favB = Boolean(getSessionMetadata(b.id).favorite);
        return Number(favB) - Number(favA);
    });

    return filtered;
}

function renderSessionsSelection() {
    if (!cachedSessions.length) {
        elements.sessionsList.innerHTML = '<div class="list-empty">No analysis sessions yet. Start your first session above.</div>';
        elements.sessionFilterCount.textContent = "No saved sessions";
        return;
    }

    const filtered = getFilteredSessions();
    elements.sessionFilterCount.textContent = `Showing ${filtered.length} of ${cachedSessions.length} session(s)`;
    elements.sessionsList.innerHTML = "";

    if (!filtered.length) {
        elements.sessionsList.innerHTML = '<div class="list-empty">No sessions match these filters. Try clearing or changing your filters.</div>';
        return;
    }

    filtered.forEach(session => {
        const sessionId = String(session.id);
        const metadata = getSessionMetadata(sessionId);
        const item = document.createElement("div");
        item.className = `session-item ${String(displayedSessionId) === sessionId ? "selected" : ""}`;

        const info = document.createElement("div");
        info.className = "session-info";

        const title = document.createElement("strong");
        title.textContent = getSessionDisplayName(session);

        const location = document.createElement("span");
        location.className = "session-location";
        location.textContent = `Location: ${getSessionLocation(session)}`;

        const meta = document.createElement("span");
        meta.className = "session-meta";
        const tag = metadata.tag ? ` · ${metadata.tag}` : "";
        const runMode = getSessionMode(session) === "comparison"
            ? "Both plants"
            : `Plant ${getSessionSinglePlant(session)} only`;
        meta.textContent = `${runMode} · ${formatSessionTime(session.started_at)} · ${formatSessionStatus(session.status)}${tag}`;

        info.append(title, location, meta);

        if (metadata.description) {
            const note = document.createElement("small");
            note.className = "session-note";
            note.textContent = metadata.description;
            info.appendChild(note);
        }

        const actions = document.createElement("div");
        actions.className = "session-actions";

        const favorite = document.createElement("button");
        favorite.type = "button";
        favorite.className = `favorite-toggle ${metadata.favorite ? "is-favorite" : ""}`;
        favorite.textContent = metadata.favorite ? "★" : "☆";
        favorite.title = metadata.favorite ? "Remove favorite" : "Add to favorites";
        favorite.setAttribute("aria-label", favorite.title);
        favorite.addEventListener("click", () => {
            saveSessionMetadata(sessionId, { favorite: !metadata.favorite });
            renderSessionsSelection();
        });

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "session-edit";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => editSessionMetadata(sessionId, session));

        const open = document.createElement("button");
        open.type = "button";
        open.className = "session-open";
        open.textContent = "Open report";
        open.addEventListener("click", () => loadSessionReport(sessionId));

        actions.append(favorite, edit, open);
        item.append(info, actions);
        elements.sessionsList.appendChild(item);
    });
}

function editSessionMetadata(sessionId, session) {
    const current = getSessionMetadata(sessionId);
    const suggestedName = current.name || getSessionDisplayName(session);
    const name = window.prompt("Session name", suggestedName);
    if (name === null) return;

    const description = window.prompt(
        "Short session description / note",
        current.description || ""
    );
    if (description === null) return;

    const tag = window.prompt(
        "Category (e.g. Baseline, Location comparison, Testing)",
        current.tag || "General"
    );
    if (tag === null) return;

    saveSessionMetadata(sessionId, {
        name: name.trim(),
        description: description.trim(),
        tag: tag.trim() || "General"
    });

    if (String(displayedSessionId) === String(sessionId)) {
        elements.reportTitle.textContent = name.trim() || getSessionDisplayName(session);
        elements.reportSubtitle.textContent = `Location: ${getSessionLocation(session)} · ${formatSessionTime(session.started_at)} · ${displayedReadings.length} saved ${displayedReadings.length === 1 ? "reading" : "readings"} · ${formatSessionStatus(session.status)} · ${tag.trim() || "General"}`;
        elements.summaryContext.textContent = description.trim() || "Computed from the readings saved in this session.";
        elements.statusSessionId.textContent = name.trim() || getSessionDisplayName(session);
    }

    renderSessionsSelection();
}


// =========================================
// COMPARISON / SINGLE-PLANT CONTROLS
// =========================================

elements.unlockSinglePlant.addEventListener("click", () => {
    if (!singlePlantModeUnlocked) {
        setSinglePlantUnlocked(true);
    }
});

elements.singlePlantSelect.addEventListener("change", () => {
    elements.analysisModeLabel.textContent = `Single-plant mode · Plant ${elements.singlePlantSelect.value}`;
});

elements.lockComparison.addEventListener("click", () => {
    elements.singlePlantSelect.value = "1";
    setSinglePlantUnlocked(false);
});

// =========================================
// INPUT MODE CONTROLS
// =========================================

elements.moduleMode.addEventListener("change", () => {
    const manual = elements.moduleMode.value === "manual";
    elements.moduleValue.disabled = !manual;
    if (!manual) elements.moduleValue.value = "";
});

elements.sourceMode.addEventListener("change", () => {
    const manual = elements.sourceMode.value === "manual";
    elements.sourceValue.disabled = !manual;
    if (!manual) elements.sourceValue.value = "0";
});


// =========================================
// EVENT LISTENERS
// =========================================

elements.form.addEventListener("submit", startAnalysis);
elements.stop.addEventListener("click", () => stopActiveSession(true));
elements.refreshSessions.addEventListener("click", loadSessions);
elements.sessionSearch.addEventListener("input", renderSessionsSelection);
elements.sessionStatusFilter.addEventListener("change", renderSessionsSelection);
elements.sessionFromDate.addEventListener("change", renderSessionsSelection);
elements.sessionToDate.addEventListener("change", renderSessionsSelection);
elements.clearSessionFilters.addEventListener("click", () => {
    elements.sessionSearch.value = "";
    elements.sessionStatusFilter.value = "all";
    elements.sessionFromDate.value = "";
    elements.sessionToDate.value = "";
    renderSessionsSelection();
});
elements.refreshReport.addEventListener("click", () => {
    if (displayedSessionId !== null) loadSessionReport(displayedSessionId);
});

window.addEventListener("resize", () => {
    drawComparisonCharts(displayedReadings, displayedSession || {});
    if (analysisChartHoverIndex !== null) showAnalysisChartTooltip(analysisChartHoverIndex);
});

// Best-effort stop when the user closes or navigates away from the page.
window.addEventListener("pagehide", () => {
    if (activeSessionId !== null && navigator.sendBeacon) {
        const url = `${API_BASE}/analysis/sessions/${activeSessionId}/stop`;
        navigator.sendBeacon(url, new Blob([], { type: "text/plain" }));
    }
});


// =========================================
// INITIAL LOAD
// =========================================

async function initialiseAnalysisDesk() {
    setSinglePlantUnlocked(false);
    elements.moduleValue.disabled = elements.moduleMode.value !== "manual";
    elements.sourceValue.disabled = elements.sourceMode.value !== "manual";
    elements.progressBar.style.width = "0%";

    const previousSession = localStorage.getItem("solarActiveAnalysisSession");
    if (previousSession) {
        try {
            await requestJSON(
                `${API_BASE}/analysis/sessions/${previousSession}/stop`,
                { method: "POST", timeoutMs: 12000 }
            );
            localStorage.removeItem("solarActiveAnalysisSession");
            setMessage("A previous browser session was safely closed. Its saved readings are preserved.");
        } catch (error) {
            if (error.status === 404 || error.status === 409) {
                localStorage.removeItem("solarActiveAnalysisSession");
            } else {
                // Do not lose the session reference if Flask/database is offline.
                activeSessionId = previousSession;
                stopRequested = true;
                elements.start.disabled = true;
                elements.stop.disabled = false;
                setConfigurationLocked(true);
                setStatus("error", "A previous session may still be marked active on the server. Stop it after the connection is restored.");
                setMessage(
                    `Could not reconcile the previous session: ${error.message}. Its ID is retained in this browser; press Stop after Flask is available.`,
                    true
                );
            }
        }
    }

    drawComparisonCharts([], { analysis_mode: "comparison" });
    await loadSessions();
    if (cachedSessions.length > 0) {
        const latest = cachedSessions[0];
        if (latest.status !== "active") {
            await loadSessionReport(String(latest.id), false);
        }
    }
}

window.addEventListener("offline", () => {
    setMessage("Internet connection lost. Active collection will pause on failed requests and retry at the next interval.", true);
});

window.addEventListener("online", async () => {
    setMessage("Connection restored. Checking the backend and refreshing saved sessions...");
    await loadSessions();
    if (activeSessionId !== null && stopRequested && !pollingTimer) {
        await stopActiveSession(true);
    } else if (activeSessionId !== null && !stopRequested) {
        collectReading();
    }
});

initialiseAnalysisDesk();
