// =========================================
// SOLAR OUTLOOK — CONFIGURATION
// =========================================

const API_BASE = "http://127.0.0.1:5000";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const STORAGE_KEY = "solarOutlookSavedLocationsV1";
const MAX_LOCATIONS = 6;

let savedLocations = [];
let selectedLocationId = null;
let activeMetric = "power";
let solarMap = null;
let mapMarkers = new Map();
const pendingLocationAdds = new Set();
let forecastChartState = null;
let forecastChartHoverIndex = null;
let forecastChartTooltip = null;

const ui = {
    search: document.getElementById("citySearch"),
    searchButton: document.getElementById("searchButton"),
    suggestions: document.getElementById("suggestions"),
    locationCount: document.getElementById("locationCount"),
    locationChips: document.getElementById("locationChips"),
    searchMessage: document.getElementById("searchMessage"),
    map: document.getElementById("solarMap"),
    fitMap: document.getElementById("fitMapButton"),
    selectedName: document.getElementById("selectedLocationName"),
    selectedMeta: document.getElementById("selectedLocationMeta"),
    forecastStatus: document.getElementById("forecastStatus"),
    refreshForecast: document.getElementById("refreshForecastButton"),
    plant1PeakPower: document.getElementById("plant1PeakPower"),
    plant1PeakTime: document.getElementById("plant1PeakTime"),
    plant2PeakPower: document.getElementById("plant2PeakPower"),
    plant2PeakTime: document.getElementById("plant2PeakTime"),
    plant1Energy: document.getElementById("plant1Energy"),
    plant2Energy: document.getElementById("plant2Energy"),
    chart: document.getElementById("forecastChart"),
    chartEmpty: document.getElementById("chartEmpty"),
    chartSubtitle: document.getElementById("chartSubtitle"),
    chartLegend: document.getElementById("chartLegend"),
    comparisonBody: document.getElementById("comparisonBody"),
    hourlyTitle: document.getElementById("hourlyTitle"),
    hourCount: document.getElementById("hourCount"),
    hourlyBody: document.getElementById("hourlyBody")
};




// =========================================
// COMMON HELPERS
// =========================================

function setSearchMessage(message, isError = false) {
    ui.searchMessage.textContent = message;
    ui.searchMessage.style.color = isError ? "#bd4b4b" : "#8c9ba8";
}

function setForecastStatus(status, text) {
    ui.forecastStatus.className = `status-pill ${status}`;
    ui.forecastStatus.textContent = text;
}

function formatNumber(value, decimals = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(decimals) : "—";
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function requestJSON(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const timeoutMs = Number(options.timeoutMs) > 0
        ? Number(options.timeoutMs)
        : (method === "GET" ? 20000 : 30000);
    // POST is not retried by default. The batch-predict endpoint is a pure
    // prediction operation with no database writes, so callers may opt in.
    const retrySafe = ["GET", "HEAD"].includes(method) || options.retryable === true;
    const maxAttempts = retrySafe ? 2 : 1;
    const fetchOptions = { ...options };
    delete fetchOptions.timeoutMs;
    delete fetchOptions.retryable;

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
                    const parseError = new Error("The service returned an unreadable response.");
                    parseError.status = response.status;
                    throw parseError;
                }
            }

            if (!response.ok) {
                const error = new Error(data.error || `Request failed (${response.status}).`);
                error.status = response.status;
                const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
                if (retrySafe && attempt < maxAttempts && transient) {
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
            let normalized = error;
            if (error.name === "AbortError") {
                normalized = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
                normalized.isTimeout = true;
            } else if (!error.status && !error.isTimeout) {
                normalized = new Error("Unable to reach the service. Check your internet connection and try again.");
                normalized.isNetworkError = true;
                normalized.cause = error;
            }

            const transient = normalized.status && [408, 429, 500, 502, 503, 504].includes(normalized.status);
            const retry = retrySafe && attempt < maxAttempts && (!normalized.status || transient);
            if (retry) {
                await delay(700 * attempt);
                continue;
            }
            throw normalized;

        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    throw new Error("The request could not be completed.");
}

function makeLocationId(latitude, longitude) {
    return `${Number(latitude).toFixed(4)}_${Number(longitude).toFixed(4)}`;
}

function locationFullName(place) {
    const parts = [place.name, place.admin1, place.country].filter(Boolean);
    return [...new Set(parts)].join(", ");
}

function localTimeLabel(timeValue, includeDate = false) {
    if (!timeValue || !timeValue.includes("T")) return "—";
    const [datePart, timePart] = timeValue.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    const clock = `${hour12}:${String(minute || 0).padStart(2, "0")} ${suffix}`;
    if (!includeDate) return clock;
    const date = new Date(Date.UTC(year, month - 1, day));
    const dateLabel = new Intl.DateTimeFormat("en-IN", {
        day: "2-digit", month: "short"
    }).format(date);
    return `${dateLabel} · ${clock}`;
}

function timeFeatures(timeValue) {
    const [datePart, timePart] = timeValue.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour] = timePart.split(":").map(Number);
    const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return {
        HOUR: hour,
        DAY: day,
        MONTH: month,
        WEEKDAY: jsDay === 0 ? 6 : jsDay - 1,
        IS_WEEKEND: (jsDay === 0 || jsDay === 6) ? 1 : 0
    };
}


// =========================================
// MAP SETUP
// =========================================

function initialiseMap() {
    if (!window.L) {
        ui.map.innerHTML = '<div class="inline-empty">The map library could not load. Check your internet connection and refresh this page.</div>';
        return;
    }

    solarMap = L.map("solarMap", {
        scrollWheelZoom: false,
        worldCopyJump: true
    }).setView([25, 15], 2.3);

    // Prefer the vector basemap, but retain an OpenStreetMap tile fallback
    // if the MapLibre bridge or its CDN script fails to load.
    try {
        if (typeof L.maplibreGL === "function") {
            L.maplibreGL({
                style: "https://tiles.openfreemap.org/styles/liberty",
                attributionControl: {
                    customAttribution:
                        '&copy; <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · ' +
                        '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · ' +
                        'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
                }
            }).addTo(solarMap);
        } else {
            throw new Error("MapLibre Leaflet bridge is unavailable.");
        }
    } catch (error) {
        console.warn("OpenFreeMap could not initialise; using OpenStreetMap tiles instead.", error);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
        }).addTo(solarMap);
    }
}

function updateMapMarkers() {
    if (!solarMap) return;

    for (const marker of mapMarkers.values()) {
        solarMap.removeLayer(marker);
    }
    mapMarkers.clear();

    savedLocations.forEach(place => {
        const stats = place.forecast?.stats;
        const popup = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = locationFullName(place);
        popup.appendChild(title);

        const details = document.createElement("div");
        details.textContent = stats
            ? `Plant 1 peak: ${formatNumber(stats.plant1.peakPower, 2)} kW · Plant 2 peak: ${formatNumber(stats.plant2.peakPower, 2)} kW`
            : (place.loading ? "Loading both plant forecasts…" : "Forecast not available");
        popup.appendChild(details);

        const action = document.createElement("div");
        action.textContent = "Select the location card to inspect its 24-hour outlook.";
        action.style.color = "#718397";
        popup.appendChild(action);

        const marker = L.circleMarker(
            [place.latitude, place.longitude],
            {
                radius: String(place.id) === String(selectedLocationId) ? 10 : 8,
                color: "#ffffff",
                weight: 2,
                fillColor: "#2878d8",
                fillOpacity: 0.95
            }
        ).addTo(solarMap);

        marker.bindPopup(popup);
        marker.on("click", () => selectLocation(place.id));
        mapMarkers.set(place.id, marker);
    });
}



function fitAllPins() {
    if (!solarMap || savedLocations.length === 0) return;
    if (savedLocations.length === 1) {
        const place = savedLocations[0];
        solarMap.setView([place.latitude, place.longitude], 7);
        return;
    }
    const points = savedLocations.map(place => [place.latitude, place.longitude]);
    solarMap.fitBounds(points, { padding: [35, 35], maxZoom: 6 });
}


// =========================================
// GEOCODING & LOCATION MANAGEMENT
// =========================================

async function searchCities(query) {
    const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    const data = await requestJSON(url);
    return Array.isArray(data.results) ? data.results : [];
}

async function runLocationSearch() {
    const query = ui.search.value.trim();
    if (!query) {
        setSearchMessage("Enter a city or location first.", true);
        return;
    }

    ui.searchButton.disabled = true;
    ui.searchButton.textContent = "Searching…";
    ui.suggestions.innerHTML = "";
    setSearchMessage("Searching the Open-Meteo location catalogue…");

    try {
        const results = await searchCities(query);
        if (results.length === 0) {
            setSearchMessage("No matching locations found. Try a more specific city name.", true);
            return;
        }

        results.forEach(result => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "suggestion-button";
            const main = document.createElement("span");
            main.textContent = result.name || "Unknown place";
            const meta = document.createElement("small");
            meta.textContent = [result.admin1, result.country].filter(Boolean).join(" · ");
            button.append(main, meta);
            button.addEventListener("click", () => addLocation(result));
            ui.suggestions.appendChild(button);
        });

        setSearchMessage(`${results.length} matching location${results.length === 1 ? "" : "s"} found. Select one to add it to the map.`);
    } catch (error) {
        console.error(error);
        setSearchMessage(error.message || "Location search failed.", true);
    } finally {
        ui.searchButton.disabled = false;
        ui.searchButton.innerHTML = 'Find location <span>→</span>';
    }
}

function persistLocations() {
    const minimal = savedLocations.map(place => ({
        id: place.id,
        name: place.name,
        admin1: place.admin1 || "",
        country: place.country || "",
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: place.timezone
    }));
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
    } catch (error) {
        console.warn("Could not persist saved locations:", error);
        setSearchMessage("Your current locations remain available until this page closes, but browser storage is unavailable.", true);
    }
}

async function addLocation(result) {
    const latitude = Number(result.latitude);
    const longitude = Number(result.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        setSearchMessage("The selected location has invalid coordinates and cannot be added.", true);
        return;
    }

    if (savedLocations.length >= MAX_LOCATIONS) {
        setSearchMessage(`You can save up to ${MAX_LOCATIONS} locations. Remove one to add another.`, true);
        return;
    }

    const id = makeLocationId(latitude, longitude);
    if (pendingLocationAdds.has(id)) return;

    if (savedLocations.some(place => place.id === id)) {
        setSearchMessage("That location is already on your comparison map.");
        ui.suggestions.innerHTML = "";
        return;
    }

    pendingLocationAdds.add(id);
    try {
        const place = {
            id,
            name: result.name || "Unknown location",
            admin1: result.admin1 || "",
            country: result.country || "",
            latitude,
            longitude,
            timezone: result.timezone || "auto",
            forecast: null,
            loading: true,
            error: null,
            stale: false,
            requestToken: 0
        };

        savedLocations.push(place);
        selectedLocationId = place.id;
        persistLocations();
        renderLocationChips();
        renderComparison();
        updateMapMarkers();
        ui.suggestions.innerHTML = "";
        ui.search.value = "";
        setSearchMessage(`Added ${locationFullName(place)}. Loading its next 24 hours…`);
        await loadPlaceForecast(place, true);
        fitAllPins();
    } finally {
        pendingLocationAdds.delete(id);
    }
}

function removeLocation(locationId) {
    const place = savedLocations.find(item => item.id === locationId);
    if (!place) return;
    savedLocations = savedLocations.filter(item => item.id !== locationId);
    if (selectedLocationId === locationId) {
        selectedLocationId = savedLocations[0]?.id || null;
    }
    persistLocations();
    renderLocationChips();
    updateMapMarkers();
    renderComparison();

    if (selectedLocationId) {
        selectLocation(selectedLocationId);
    } else {
        clearSelectedLocation();
    }
    setSearchMessage(`${locationFullName(place)} removed from this browser's saved locations.`);
}

function renderLocationChips() {
    ui.locationCount.textContent = `${savedLocations.length} / ${MAX_LOCATIONS} LOCATIONS`;

    if (savedLocations.length === 0) {
        ui.locationChips.innerHTML = '<div class="inline-empty">No saved locations yet. Search for a city to begin.</div>';
        return;
    }

    ui.locationChips.innerHTML = "";
    savedLocations.forEach(place => {
        const row = document.createElement("div");
        row.className = `location-chip ${place.id === selectedLocationId ? "selected" : ""}`;

        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "location-pick";
        const dot = document.createElement("i");
        const copy = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = place.name;
        const meta = document.createElement("small");
        meta.textContent = place.forecast
            ? `P1 ${formatNumber(place.forecast.stats.plant1.peakPower, 1)} kW · P2 ${formatNumber(place.forecast.stats.plant2.peakPower, 1)} kW${place.stale ? " · last forecast retained" : ""}`
            : (place.loading ? "Both plant forecasts loading…" : (place.error || "Forecast not loaded"));
        copy.append(name, meta);
        pick.append(dot, copy);
        pick.addEventListener("click", () => selectLocation(place.id));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-location";
        remove.title = `Remove ${place.name}`;
        remove.setAttribute("aria-label", `Remove ${place.name}`);
        remove.textContent = "×";
        remove.addEventListener("click", () => removeLocation(place.id));

        row.append(pick, remove);
        ui.locationChips.appendChild(row);
    });
}


// =========================================
// HOURLY WEATHER -> MODEL INPUTS -> BATCH PREDICTION
// =========================================

async function fetchHourlyWeather(place) {
    const url = `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}`
        + "&hourly=temperature_2m,shortwave_radiation"
        + "&forecast_hours=24&temperature_unit=celsius&timezone=auto";

    const data = await requestJSON(url, { timeoutMs: 25000 });
    const hourly = data.hourly;
    if (!hourly || !Array.isArray(hourly.time) || hourly.time.length === 0) {
        throw new Error("Weather service did not return hourly forecast data.");
    }
    if (!Array.isArray(hourly.temperature_2m) || !Array.isArray(hourly.shortwave_radiation)) {
        throw new Error("Weather service omitted temperature or solar-radiation forecast values.");
    }
    if (hourly.temperature_2m.length !== hourly.time.length ||
        hourly.shortwave_radiation.length !== hourly.time.length) {
        throw new Error("Weather service returned mismatched hourly arrays. No forecast was calculated.");
    }
    if (!data.timezone) {
        throw new Error("Weather service did not identify the location timezone.");
    }
    return data;
}

async function predictHourlyRows(modelRows, plantId) {
    const data = await requestJSON(`${API_BASE}/batch-predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: modelRows, plant_id: plantId }),
        timeoutMs: 30000,
        retryable: true
    });
    if (Number(data.plant_id) !== Number(plantId)) {
        throw new Error(`Prediction backend returned Plant ${data.plant_id ?? "?"} when Plant ${plantId} was requested. Restart the updated dual-plant Flask backend.`);
    }
    const expectedModel = Number(plantId) === 1 ? "xgboost" : "random forest";
    if (String(data.model_name || "").toLowerCase() !== expectedModel) {
        throw new Error(`Plant ${plantId} is reporting model "${data.model_name || "unknown"}"; expected ${expectedModel}. Check the backend model files and restart Flask.`);
    }
    if (!Array.isArray(data.predictions) || data.predictions.length !== modelRows.length) {
        throw new Error(`Plant ${plantId} returned an unexpected number of hourly predictions.`);
    }
    const predictions = data.predictions.map(Number);
    if (!predictions.every(Number.isFinite)) {
        throw new Error(`Plant ${plantId} returned non-numeric results. No comparison forecast was displayed.`);
    }
    return predictions;
}



function buildForecastRows(weather) {
    const hourly = weather.hourly;
    const times = hourly.time || [];
    const temperatures = hourly.temperature_2m || [];
    const radiationValues = hourly.shortwave_radiation || [];
    const rows = [];
    const modelRows = [];
    const modelIndexes = [];

    times.forEach((time, index) => {
        const rawTemperature = temperatures[index];
        const rawRadiation = radiationValues[index];
        const temperature = Number(rawTemperature);
        const radiation = Number(rawRadiation);
        const valid = time && rawTemperature !== null && rawTemperature !== undefined
            && rawRadiation !== null && rawRadiation !== undefined
            && Number.isFinite(temperature) && Number.isFinite(radiation)
            && temperature >= -90 && temperature <= 70
            && radiation >= 0;

        const moduleTemperature = valid
            ? Math.max(temperature, temperature + radiation * 0.025)
            : null;
        rows.push({
            time,
            ambientTemperature: valid ? temperature : null,
            radiationWm2: valid ? radiation : null,
            irradiation: valid ? radiation / 1000 : null,
            moduleTemperature,
            plant1Power: null,
            plant2Power: null
        });

        if (valid) {
            const parts = timeFeatures(time);
            modelIndexes.push(index);
            modelRows.push({
                SOURCE_KEY_x: 0,
                AMBIENT_TEMPERATURE: temperature,
                MODULE_TEMPERATURE: moduleTemperature,
                IRRADIATION: radiation / 1000,
                HOUR: parts.HOUR,
                DAY: parts.DAY,
                MONTH: parts.MONTH,
                WEEKDAY: parts.WEEKDAY,
                IS_WEEKEND: parts.IS_WEEKEND
            });
        }
    });

    return { rows, modelRows, modelIndexes };
}



async function loadPlaceForecast(place, showStatus = false) {
    // A request token prevents an older refresh from overwriting newer data.
    const requestToken = Number(place.requestToken || 0) + 1;
    place.requestToken = requestToken;
    place.loading = true;
    place.error = null;
    renderLocationChips();
    renderComparison();
    updateMapMarkers();

    if (place.id === selectedLocationId && showStatus) {
        setForecastStatus("loading", "LOADING BOTH MODELS");
        ui.selectedMeta.textContent = place.forecast
            ? "Refreshing weather and both model predictions. The last successful comparison remains visible until the refresh completes…"
            : "Retrieving one shared 24-hour weather forecast and running Plant 1 XGBoost plus Plant 2 Random Forest…";
    }

    try {
        const weather = await fetchHourlyWeather(place);
        const built = buildForecastRows(weather);
        if (built.modelRows.length === 0) {
            throw new Error("The weather service returned no complete hourly input rows.");
        }
        if (built.modelRows.length > 48) {
            throw new Error("The forecast returned more hourly points than the prediction service accepts.");
        }

        // Both plant models receive exactly the same weather/time feature rows.
        const [plant1Predictions, plant2Predictions] = await Promise.all([
            predictHourlyRows(built.modelRows, 1),
            predictHourlyRows(built.modelRows, 2)
        ]);

        plant1Predictions.forEach((prediction, index) => {
            built.rows[built.modelIndexes[index]].plant1Power = prediction;
        });
        plant2Predictions.forEach((prediction, index) => {
            built.rows[built.modelIndexes[index]].plant2Power = prediction;
        });

        const validRows = built.rows.filter(row =>
            Number.isFinite(row.plant1Power) && Number.isFinite(row.plant2Power)
        );
        if (validRows.length === 0) {
            throw new Error("Neither plant returned valid hourly predictions.");
        }

        const summarizePlant = key => {
            const peakIndex = validRows.reduce(
                (best, row, index, array) => row[key] > array[best][key] ? index : best,
                0
            );
            return {
                peakPower: validRows[peakIndex][key],
                peakTime: validRows[peakIndex].time,
                approximateEnergy: validRows.reduce((sum, row) => sum + row[key], 0)
            };
        };
        const temperatures = validRows.map(row => row.ambientTemperature);
        const irradiations = validRows.map(row => row.radiationWm2);

        // Do not apply a response if the location was removed or refreshed again.
        const stillSaved = savedLocations.some(item => item.id === place.id);
        if (!stillSaved || place.requestToken !== requestToken) return;

        place.forecast = {
            rows: built.rows,
            timezone: weather.timezone || place.timezone,
            utcOffsetSeconds: weather.utc_offset_seconds ?? null,
            generatedAt: new Date().toISOString(),
            stats: {
                plant1: summarizePlant("plant1Power"),
                plant2: summarizePlant("plant2Power"),
                maxIrradiation: Math.max(...irradiations),
                minTemperature: Math.min(...temperatures),
                maxTemperature: Math.max(...temperatures),
                validPoints: validRows.length
            }
        };

        place.timezone = weather.timezone || place.timezone;
        place.loading = false;
        place.error = null;
        place.stale = false;

        if (place.id === selectedLocationId) {
            renderSelectedForecast(place);
            setForecastStatus("ready", "BOTH MODELS READY");
            setSearchMessage(`Loaded ${validRows.length} shared hourly points for Plant 1 XGBoost and Plant 2 Random Forest at ${locationFullName(place)}.`);
        }

        renderLocationChips();
        renderComparison();
        updateMapMarkers();

    } catch (error) {
        if (place.requestToken !== requestToken || !savedLocations.some(item => item.id === place.id)) return;

        console.error(`Dual-plant forecast failed for ${locationFullName(place)}:`, error);
        place.loading = false;
        place.error = error.message || "Forecast failed";
        place.stale = Boolean(place.forecast);

        if (place.id === selectedLocationId) {
            setForecastStatus("error", place.forecast ? "LAST COMPARISON RETAINED" : "FORECAST FAILED");
            if (place.forecast) {
                renderSelectedForecast(place);
                ui.selectedMeta.textContent += ` · Refresh failed: ${place.error}`;
                setSearchMessage(`Refresh failed for ${locationFullName(place)}. Showing the last successful dual-plant forecast: ${place.error}`, true);
            } else {
                ui.selectedMeta.textContent = place.error;
                clearForecastView();
                setSearchMessage(`Forecast unavailable for ${locationFullName(place)}: ${place.error}`, true);
            }
        }

        renderLocationChips();
        renderComparison();
        updateMapMarkers();
    }
}



// =========================================
// SELECTED LOCATION VIEW
// =========================================

function getSelectedPlace() {
    return savedLocations.find(place => place.id === selectedLocationId) || null;
}

function selectLocation(locationId) {
    forecastChartHoverIndex = null;
    hideForecastChartTooltip();
    const place = savedLocations.find(item => item.id === locationId);
    if (!place) return;

    selectedLocationId = place.id;
    renderLocationChips();
    updateMapMarkers();

    if (solarMap) {
        solarMap.panTo([place.latitude, place.longitude]);
    }

    if (place.forecast) {
        renderSelectedForecast(place);
        setForecastStatus("ready", "BOTH MODELS READY");
    } else if (place.loading) {
        ui.selectedName.textContent = locationFullName(place);
        ui.selectedMeta.textContent = "Loading the shared weather forecast and both plant models…";
        setForecastStatus("loading", "LOADING BOTH MODELS");
    } else {
        ui.selectedName.textContent = locationFullName(place);
        ui.selectedMeta.textContent = place.error || "Forecast not loaded.";
        setForecastStatus("error", "FORECAST NOT AVAILABLE");
    }
}

function clearSelectedLocation() {
    ui.selectedName.textContent = "Choose a location";
    ui.selectedMeta.textContent = "Add a city to generate its 24-hour outlook.";
    setForecastStatus("idle", "WAITING FOR LOCATION");
    ui.refreshForecast.disabled = true;
    clearForecastView();
}

function clearForecastView() {
    ui.plant1PeakPower.textContent = "—";
    ui.plant1PeakTime.textContent = "Peak time · Plant 1";
    ui.plant2PeakPower.textContent = "—";
    ui.plant2PeakTime.textContent = "Peak time · Plant 2";
    ui.plant1Energy.textContent = "—";
    ui.plant2Energy.textContent = "—";
    ui.chartSubtitle.textContent = "Select a location to load its 24-hour comparison profile.";
    ui.hourCount.textContent = "0 HOURLY POINTS";
    ui.hourlyTitle.textContent = "Hourly forecast data";
    ui.hourlyBody.innerHTML = '<tr><td colspan="7" class="empty-cell">Select a location to view hourly data.</td></tr>';
    ui.chartEmpty.style.display = "grid";
    forecastChartHoverIndex = null;
    hideForecastChartTooltip();
    drawForecastChart([]);
}



function renderSelectedForecast(place) {
    if (!place || !place.forecast) {
        clearSelectedLocation();
        return;
    }

    const stats = place.forecast.stats;
    const rows = place.forecast.rows;
    ui.selectedName.textContent = locationFullName(place);
    ui.selectedMeta.textContent = `${place.latitude.toFixed(4)}°, ${place.longitude.toFixed(4)}° · ${place.forecast.timezone || place.timezone} · Plant 1 XGBoost + Plant 2 Random Forest · Updated ${new Date(place.forecast.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}${place.stale ? " · STALE: refresh failed, showing the last successful comparison" : ""}`;

    ui.plant1PeakPower.textContent = `${formatNumber(stats.plant1.peakPower, 2)} kW`;
    ui.plant1PeakTime.textContent = `Peak around ${localTimeLabel(stats.plant1.peakTime, true)} local time`;
    ui.plant2PeakPower.textContent = `${formatNumber(stats.plant2.peakPower, 2)} kW`;
    ui.plant2PeakTime.textContent = `Peak around ${localTimeLabel(stats.plant2.peakTime, true)} local time`;
    ui.plant1Energy.textContent = `${formatNumber(stats.plant1.approximateEnergy, 1)} kWh`;
    ui.plant2Energy.textContent = `${formatNumber(stats.plant2.approximateEnergy, 1)} kWh`;
    ui.chartSubtitle.textContent = `${stats.validPoints} shared hourly weather points · Local timezone: ${place.forecast.timezone || place.timezone} · Same inputs used for both models`;
    ui.hourCount.textContent = `${stats.validPoints} SHARED HOURLY POINTS`;
    ui.hourlyTitle.textContent = `${place.name} · Plant 1 vs Plant 2 hourly forecast`;
    ui.refreshForecast.disabled = false;

    const rowsWithPredictions = rows.filter(row =>
        Number.isFinite(row.plant1Power) && Number.isFinite(row.plant2Power)
    );
    ui.hourlyBody.innerHTML = rowsWithPredictions.map(row => `
        <tr>
            <td>${escapeHTML(localTimeLabel(row.time, true))}</td>
            <td>${formatNumber(row.ambientTemperature, 1)}</td>
            <td>${formatNumber(row.radiationWm2, 0)}</td>
            <td>${formatNumber(row.irradiation, 3)}</td>
            <td>${formatNumber(row.moduleTemperature, 1)}</td>
            <td class="power-cell">${formatNumber(row.plant1Power, 2)} kW</td>
            <td class="power-cell plant2-power-cell">${formatNumber(row.plant2Power, 2)} kW</td>
        </tr>
    `).join("") || '<tr><td colspan="7" class="empty-cell">No complete hourly comparison readings were returned.</td></tr>';

    drawForecastChart(rows);
}


function metricConfig() {
    if (activeMetric === "irradiation") {
        return {
            label: "Shortwave radiation",
            unit: "W/m²",
            decimals: 0,
            series: [{ key: "radiationWm2", label: "Solar radiation", color: "#d8a52b", legendClass: "legend-gold" }]
        };
    }
    if (activeMetric === "temperature") {
        return {
            label: "Ambient temperature",
            unit: "°C",
            decimals: 1,
            series: [{ key: "ambientTemperature", label: "Ambient temperature", color: "#8754c9", legendClass: "legend-purple" }]
        };
    }
    return {
        label: "Predicted AC power",
        unit: "kW",
        decimals: 2,
        series: [
            { key: "plant1Power", label: "Plant 1 · XGBoost", color: "#2878d8", legendClass: "legend-blue" },
            { key: "plant2Power", label: "Plant 2 · Random Forest", color: "#239c68", legendClass: "legend-green" }
        ]
    };
}



function ensureForecastChartTooltip() {
    if (forecastChartTooltip) return forecastChartTooltip;

    const wrap = ui.chart.closest(".chart-wrap");
    forecastChartTooltip = document.createElement("div");
    forecastChartTooltip.className = "solar-chart-tooltip forecast-chart-tooltip";
    forecastChartTooltip.setAttribute("role", "tooltip");
    forecastChartTooltip.setAttribute("aria-hidden", "true");
    wrap.appendChild(forecastChartTooltip);

    if (!wrap.parentElement.querySelector(".chart-interaction-hint")) {
        const hint = document.createElement("div");
        hint.className = "chart-interaction-hint";
        hint.textContent = "Hover or tap any hour to inspect the complete forecast inputs and estimate";
        wrap.insertAdjacentElement("afterend", hint);
    }

    return forecastChartTooltip;
}

function positionForecastTooltip(point) {
    const tooltip = ensureForecastChartTooltip();
    const wrap = ui.chart.closest(".chart-wrap");
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;

    tooltip.hidden = false;
    tooltip.setAttribute("aria-hidden", "false");

    const rect = tooltip.getBoundingClientRect();
    let left = point.x + 14;
    if (left + rect.width > width - 8) left = point.x - rect.width - 14;
    left = Math.max(8, Math.min(left, width - rect.width - 8));

    let top = point.y - rect.height - 12;
    if (top < 8) top = point.y + 14;
    top = Math.max(8, Math.min(top, height - rect.height - 8));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function showForecastChartTooltip(index) {
    if (!forecastChartState || !forecastChartState.points[index]) return;

    const point = forecastChartState.points[index];
    const row = point.row;
    const config = forecastChartState.config;
    const tooltip = ensureForecastChartTooltip();
    const place = getSelectedPlace();
    const primary = activeMetric === "power"
        ? `<div class="chart-tooltip-models">
                <div><span>Plant 1 · XGBoost</span><strong>${escapeHTML(formatNumber(row.plant1Power, 2))} kW</strong></div>
                <div><span>Plant 2 · Random Forest</span><strong>${escapeHTML(formatNumber(row.plant2Power, 2))} kW</strong></div>
           </div>`
        : `<div class="chart-tooltip-primary">${escapeHTML(formatNumber(row[config.series[0].key], config.decimals))} ${escapeHTML(config.unit)}</div>`;

    tooltip.innerHTML = `
        <div class="chart-tooltip-kicker">HOURLY FORECAST · ${escapeHTML(config.label.toUpperCase())}</div>
        <div class="chart-tooltip-time">${escapeHTML(localTimeLabel(point.time, true))} · ${escapeHTML(place?.forecast?.timezone || place?.timezone || "Local time")}</div>
        ${primary}
        <div class="chart-tooltip-grid">
            <div><span>Shortwave radiation</span><strong>${escapeHTML(formatNumber(row.radiationWm2, 0))} W/m²</strong></div>
            <div><span>Model irradiation</span><strong>${escapeHTML(formatNumber(row.irradiation, 3))} kW/m²*</strong></div>
            <div><span>Ambient temperature</span><strong>${escapeHTML(formatNumber(row.ambientTemperature, 1))} °C</strong></div>
            <div><span>Estimated module temperature</span><strong>${escapeHTML(formatNumber(row.moduleTemperature, 1))} °C</strong></div>
        </div>
        <div class="chart-tooltip-footnote">*Scaled model input, not a separate irradiance measurement. Both plants use the same weather inputs.</div>
    `;
    positionForecastTooltip(point);
}



function hideForecastChartTooltip() {
    if (!forecastChartTooltip) return;
    forecastChartTooltip.hidden = true;
    forecastChartTooltip.setAttribute("aria-hidden", "true");
}

function handleForecastChartPointerMove(event) {
    if (!forecastChartState || !forecastChartState.points.length) return;

    const rect = ui.chart.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const geometry = forecastChartState.geometry;

    if (
        x < geometry.left - 4 ||
        x > geometry.right + 4 ||
        y < geometry.top - 4 ||
        y > geometry.bottom + 4
    ) {
        forecastChartHoverIndex = null;
        hideForecastChartTooltip();
        drawForecastChart(getSelectedPlace()?.forecast?.rows || []);
        return;
    }

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    forecastChartState.points.forEach((point, index) => {
        const distance = Math.abs(point.x - x);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });

    forecastChartHoverIndex = nearestIndex;
    drawForecastChart(getSelectedPlace()?.forecast?.rows || []);
    showForecastChartTooltip(nearestIndex);
}

function clearForecastChartHover() {
    if (forecastChartHoverIndex === null) return;
    forecastChartHoverIndex = null;
    hideForecastChartTooltip();
    drawForecastChart(getSelectedPlace()?.forecast?.rows || []);
}

function drawForecastChart(rows) {
    const canvas = ui.chart;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.clientWidth || 900;
    const height = canvas.clientHeight || 300;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const config = metricConfig();
    const validRows = rows.filter(row => config.series.some(series => Number.isFinite(Number(row[series.key]))));
    ui.chartEmpty.style.display = validRows.length ? "none" : "grid";
    ui.chartLegend.innerHTML = config.series.map(series =>
        `<span><i class="${series.legendClass}"></i> ${escapeHTML(series.label)}</span>`
    ).join("") + `<span class="chart-unit">${escapeHTML(config.unit)}</span>`;

    if (!validRows.length) {
        forecastChartState = null;
        hideForecastChartTooltip();
        return;
    }

    const left = 64, right = 22, top = 30, bottom = 48;
    const plotWidth = Math.max(1, width - left - right);
    const plotHeight = Math.max(1, height - top - bottom);
    const allValues = validRows.flatMap(row => config.series
        .map(series => Number(row[series.key]))
        .filter(Number.isFinite));
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    let min = rawMin >= 0 ? 0 : rawMin;
    let max = rawMax;
    if (max <= min) max = min + Math.max(Math.abs(min) * 0.08, 1);
    const pad = (max - min) * 0.10;
    if (rawMin < 0) min -= pad;
    max += pad;

    const x = index => validRows.length === 1 ? left + plotWidth / 2 : left + plotWidth * index / (validRows.length - 1);
    const y = value => top + plotHeight - ((value - min) / (max - min)) * plotHeight;
    const chartPoints = validRows.map((row, index) => ({
        index,
        row,
        time: row.time,
        x: x(index),
        y: y(Number(row[config.series[0].key]))
    }));
    const plottedSeries = config.series.map(series => ({
        ...series,
        points: validRows.map((row, index) => ({
            index,
            row,
            time: row.time,
            x: x(index),
            y: y(Number(row[series.key])),
            value: Number(row[series.key])
        })).filter(point => Number.isFinite(point.value))
    }));

    forecastChartState = {
        points: chartPoints,
        plottedSeries,
        config,
        geometry: {
            left,
            right: left + plotWidth,
            top,
            bottom: top + plotHeight,
            width,
            height
        }
    };

    if (forecastChartHoverIndex !== null && forecastChartHoverIndex >= chartPoints.length) {
        forecastChartHoverIndex = null;
        hideForecastChartTooltip();
    }

    // Axes and shared scale. Both plant curves use the same y-axis.
    ctx.font = "10px Inter, Arial, sans-serif";
    ctx.strokeStyle = "#e9eff4";
    ctx.fillStyle = "#8192a2";
    ctx.lineWidth = 1;
    ctx.textAlign = "left";
    ctx.fillText(`${config.label.toUpperCase()} · ${config.unit}`, left, 13);

    const decimals = max >= 100 ? 0 : max >= 10 ? 1 : config.decimals;
    for (let step = 0; step <= 4; step++) {
        const gridY = top + plotHeight * step / 4;
        const label = max - (max - min) * step / 4;
        ctx.beginPath();
        ctx.moveTo(left, gridY);
        ctx.lineTo(width - right, gridY);
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillStyle = "#8c9aa7";
        ctx.fillText(label.toFixed(decimals), left - 9, gridY + 3);
    }

    // Draw every series without independent scaling to preserve a fair comparison.
    plottedSeries.forEach(series => {
        const points = series.points;
        if (!points.length) return;

        if (activeMetric !== "power" && points.length > 1) {
            const gradient = ctx.createLinearGradient(0, top, 0, top + plotHeight);
            gradient.addColorStop(0, "rgba(216,165,43,.13)");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            ctx.beginPath();
            points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
            ctx.lineTo(points[points.length - 1].x, top + plotHeight);
            ctx.lineTo(points[0].x, top + plotHeight);
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        ctx.beginPath();
        points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
        ctx.strokeStyle = series.color;
        ctx.lineWidth = activeMetric === "power" ? 2.8 : 2.6;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();

        points.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 2.9, 0, Math.PI * 2);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 1.8;
            ctx.stroke();
        });
    });

    // Hover crosshair plus both model points at the selected timestamp.
    if (forecastChartHoverIndex !== null) {
        const point = chartPoints[forecastChartHoverIndex];
        if (point) {
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = "#7690a8";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(point.x, top);
            ctx.lineTo(point.x, top + plotHeight);
            ctx.stroke();
            ctx.restore();

            plottedSeries.forEach(series => {
                const selected = series.points.find(item => item.index === forecastChartHoverIndex);
                if (!selected) return;
                ctx.beginPath();
                ctx.arc(selected.x, selected.y, 7, 0, Math.PI * 2);
                ctx.fillStyle = `${series.color}24`;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(selected.x, selected.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = "#fff";
                ctx.fill();
                ctx.strokeStyle = series.color;
                ctx.lineWidth = 2.2;
                ctx.stroke();
            });
        }
    }

    const tickCount = Math.min(5, chartPoints.length);
    const indices = [...new Set(Array.from(
        { length: tickCount },
        (_, i) => tickCount === 1 ? 0 : Math.round(i * (chartPoints.length - 1) / (tickCount - 1))
    ))];
    ctx.fillStyle = "#8c9aa7";
    ctx.textAlign = "center";
    indices.forEach(index => ctx.fillText(localTimeLabel(chartPoints[index].time), chartPoints[index].x, height - 22));
    ctx.textAlign = "right";
    ctx.fillStyle = "#a0acb7";
    ctx.font = "8px Inter, Arial, sans-serif";
    ctx.fillText("FORECAST TIME · LOCAL", width - right, height - 5);

    canvas.setAttribute("tabindex", "0");
    canvas.setAttribute("aria-label", `${config.label} forecast chart. ${config.series.map(item => item.label).join(" compared with ")}. Hover or tap to inspect hourly forecast points.`);
}


function renderComparison() {
    if (savedLocations.length === 0) {
        ui.comparisonBody.innerHTML = '<tr><td colspan="9" class="empty-cell">Add locations to populate the comparison.</td></tr>';
        return;
    }

    ui.comparisonBody.innerHTML = savedLocations.map(place => {
        const stats = place.forecast?.stats;
        const status = place.loading ? "Loading both" : place.error ? "Unavailable" : stats ? "Ready" : "Pending";
        return `
            <tr>
                <td class="location-cell"><strong>${escapeHTML(place.name)}</strong><small>${escapeHTML([place.admin1, place.country].filter(Boolean).join(" · "))}</small></td>
                <td class="power-cell">${stats ? `${formatNumber(stats.plant1.peakPower, 2)} kW` : "—"}</td>
                <td class="plant2-power-cell">${stats ? `${formatNumber(stats.plant2.peakPower, 2)} kW` : "—"}</td>
                <td>${stats ? `${formatNumber(stats.plant1.approximateEnergy, 1)} kWh` : "—"}</td>
                <td>${stats ? `${formatNumber(stats.plant2.approximateEnergy, 1)} kWh` : "—"}</td>
                <td>${stats ? `P1 ${escapeHTML(localTimeLabel(stats.plant1.peakTime))} · P2 ${escapeHTML(localTimeLabel(stats.plant2.peakTime))}` : "—"}</td>
                <td>${stats ? `${formatNumber(stats.maxIrradiation, 0)} W/m²` : "—"}</td>
                <td>${escapeHTML(status)}</td>
                <td><button class="open-row" type="button" data-open-location="${escapeHTML(place.id)}">Inspect</button></td>
            </tr>
        `;
    }).join("");

    ui.comparisonBody.querySelectorAll("[data-open-location]").forEach(button => {
        button.addEventListener("click", () => selectLocation(button.dataset.openLocation));
    });
}


async function refreshSelectedForecast() {
    const place = getSelectedPlace();
    if (!place) {
        setSearchMessage("Select a saved location before refreshing its forecast.", true);
        return;
    }
    if (place.loading) {
        setSearchMessage("A forecast request for this location is already running.");
        return;
    }
    ui.refreshForecast.disabled = true;
    try {
        await loadPlaceForecast(place, true);
    } finally {
        ui.refreshForecast.disabled = false;
    }
}

function restoreSavedLocations() {
    let stored = [];
    try {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (error) {
        console.warn("Saved location list could not be read:", error);
    }

    if (!Array.isArray(stored)) stored = [];

    savedLocations = stored
        .filter(place => Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)))
        .slice(0, MAX_LOCATIONS)
        .map(place => ({
            ...place,
            latitude: Number(place.latitude),
            longitude: Number(place.longitude),
            id: place.id || makeLocationId(place.latitude, place.longitude),
            timezone: place.timezone || "auto",
            forecast: null,
            loading: false,
            error: null,
            stale: false,
            requestToken: 0
        }));
}

async function initialiseOutlook() {
    initialiseMap();
    restoreSavedLocations();
    renderLocationChips();
    renderComparison();

    if (savedLocations.length === 0) {
        try {
            const defaults = await searchCities("Chandigarh");
            if (defaults.length) {
                await addLocation(defaults[0]);
                return;
            }
        } catch (error) {
            console.warn("Could not load default location:", error);
        }
    }

    if (savedLocations.length > 0) {
        selectedLocationId = savedLocations[0].id;
        renderLocationChips();
        updateMapMarkers();
        fitAllPins();
        await Promise.all(savedLocations.map(place => loadPlaceForecast(place, place.id === selectedLocationId)));
        const selected = getSelectedPlace();
        if (selected?.forecast) renderSelectedForecast(selected);
    } else {
        clearSelectedLocation();
    }
}


// =========================================
// EVENT LISTENERS
// =========================================

ui.searchButton.addEventListener("click", runLocationSearch);
ui.search.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        runLocationSearch();
    }
});
ui.fitMap.addEventListener("click", fitAllPins);
ui.refreshForecast.addEventListener("click", refreshSelectedForecast);

ui.chart.addEventListener("pointermove", handleForecastChartPointerMove);
ui.chart.addEventListener("pointerdown", handleForecastChartPointerMove);
ui.chart.addEventListener("pointerleave", clearForecastChartHover);

document.querySelectorAll(".chart-tab").forEach(button => {
    button.addEventListener("click", () => {
        activeMetric = button.dataset.metric;
        forecastChartHoverIndex = null;
        hideForecastChartTooltip();
        document.querySelectorAll(".chart-tab").forEach(tab => tab.classList.toggle("active", tab === button));
        const place = getSelectedPlace();
        drawForecastChart(place?.forecast?.rows || []);
    });
});

window.addEventListener("resize", () => {
    const place = getSelectedPlace();
    drawForecastChart(place?.forecast?.rows || []);
    if (forecastChartHoverIndex !== null) showForecastChartTooltip(forecastChartHoverIndex);
    if (solarMap) solarMap.invalidateSize();
});

window.addEventListener("offline", () => {
    setSearchMessage("Internet connection lost. Existing map locations and the last successful forecasts remain visible; new searches and refreshes are unavailable.", true);
    setForecastStatus("error", "OFFLINE");
});

window.addEventListener("online", () => {
    setSearchMessage("Connection restored. Refresh a location to retrieve the latest weather forecast.");
    const place = getSelectedPlace();
    if (place && !place.loading) refreshSelectedForecast();
});

initialiseOutlook();
