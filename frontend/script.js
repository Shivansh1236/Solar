const API_URL = "http://127.0.0.1:5000/predict";


// =========================================
// LIVE DATA
// =========================================

let liveWeatherData = null;

let liveTimeData = null;

let liveModuleTemperature = null;


// The current trained model requires SOURCE_KEY_x.
// We keep the selected configuration fixed at 0.
const liveSourceKey = 0;


// =========================================
// SLOW SMOOTH SCROLL
// =========================================

function smoothScrollTo(
    targetElement,
    duration = 1400
) {

    if (!targetElement) {
        return;
    }


    const startPosition =
        window.scrollY;


    const targetPosition =
        targetElement.getBoundingClientRect().top +
        window.scrollY -
        90;


    const distance =
        targetPosition -
        startPosition;


    let startTime = null;


    function easeInOutCubic(t) {

        return t < 0.5

            ? 4 * t * t * t

            : 1 -
              Math.pow(
                  -2 * t + 2,
                  3
              ) / 2;
    }


    function animation(currentTime) {

        if (!startTime) {
            startTime = currentTime;
        }


        const elapsed =
            currentTime -
            startTime;


        const progress =
            Math.min(
                elapsed / duration,
                1
            );


        const eased =
            easeInOutCubic(
                progress
            );


        window.scrollTo(
            0,
            startPosition +
            distance * eased
        );


        if (progress < 1) {

            requestAnimationFrame(
                animation
            );

        }

    }


    requestAnimationFrame(
        animation
    );
}


// =========================================
// NAVIGATION
// =========================================

document
    .querySelectorAll(
        'a[href^="#"]'
    )
    .forEach(
        function (link) {

            link.addEventListener(
                "click",
                function (event) {

                    const targetId =
                        this.getAttribute(
                            "href"
                        );


                    const target =
                        document.querySelector(
                            targetId
                        );


                    if (!target) {
                        return;
                    }


                    event.preventDefault();


                    smoothScrollTo(
                        target,
                        1400
                    );

                }
            );

        }
    );


// =========================================
// PREDICTION TABS
// =========================================

const predictionTabs =
    document.querySelectorAll(
        ".prediction-tab"
    );


const predictionPanels =
    document.querySelectorAll(
        ".prediction-panel"
    );


predictionTabs.forEach(
    function (tab) {

        tab.addEventListener(
            "click",
            function () {

                const mode =
                    this.dataset.mode;


                predictionTabs.forEach(
                    function (item) {

                        item.classList.remove(
                            "active"
                        );

                    }
                );


                predictionPanels.forEach(
                    function (panel) {

                        panel.classList.remove(
                            "active"
                        );

                    }
                );


                this.classList.add(
                    "active"
                );


                const selectedPanel =
                    document.getElementById(
                        `${mode}-panel`
                    );


                if (selectedPanel) {

                    selectedPanel.classList.add(
                        "active"
                    );

                }

            }
        );

    }
);


// =========================================
// LOCATION SEARCH
// =========================================

async function findLocation(
    locationName
) {

    const url =
        "https://geocoding-api.open-meteo.com/v1/search" +
        `?name=${encodeURIComponent(
            locationName
        )}` +
        "&count=1" +
        "&language=en" +
        "&format=json";


    const response =
        await fetch(url);


    if (!response.ok) {

        throw new Error(
            "Location search failed."
        );

    }


    const data =
        await response.json();


    if (
        !data.results ||
        data.results.length === 0
    ) {

        throw new Error(
            "Location not found."
        );

    }


    return data.results[0];
}


// =========================================
// WEATHER API
// =========================================

async function fetchWeather(
    latitude,
    longitude
) {

    const url =
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${latitude}` +
        `&longitude=${longitude}` +
        "&current=" +
        "temperature_2m," +
        "shortwave_radiation" +
        "&temperature_unit=celsius" +
        "&timezone=auto";


    const response =
        await fetch(url);


    if (!response.ok) {

        throw new Error(
            "Weather request failed."
        );

    }


    const data =
        await response.json();


    return data;
}


// =========================================
// TIME FEATURES
// =========================================

function getTimeFeatures(
    weatherData
) {

    /*
        Open-Meteo returns local time.

        Example:

        2026-09-25T21:00

        We use that location-local
        date/time directly.
    */


    const timeString =
        weatherData.current.time;


    const datePart =
        timeString.split("T")[0];


    const timePart =
        timeString.split("T")[1];


    const dateParts =
        datePart.split("-");


    const timeParts =
        timePart.split(":");


    const year =
        Number(
            dateParts[0]
        );


    const month =
        Number(
            dateParts[1]
        );


    const day =
        Number(
            dateParts[2]
        );


    const hour =
        Number(
            timeParts[0]
        );


    /*
        JavaScript:

        Sunday = 0
        Monday = 1
        ...
        Saturday = 6

        Model:

        Monday = 0
        ...
        Sunday = 6
    */


    const javascriptDay =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day
            )
        ).getUTCDay();


    const weekday =
        javascriptDay === 0

            ? 6

            : javascriptDay - 1;


    /*
        This is required internally
        by the existing Random Forest.

        We do NOT display it.
    */

    const isWeekend =
        javascriptDay === 0 ||
        javascriptDay === 6

            ? 1

            : 0;


    return {

        HOUR: hour,

        DAY: day,

        MONTH: month,

        WEEKDAY: weekday,

        IS_WEEKEND: isWeekend

    };
}


// =========================================
// MODULE TEMPERATURE
// =========================================

function estimateModuleTemperature(
    ambientTemperature,
    irradiationWm2
) {

    /*
        Actual module temperature
        is not supplied by the weather API.

        Therefore it is estimated from
        ambient temperature and irradiation.
    */


    const estimated =
        ambientTemperature +
        irradiationWm2 * 0.025;


    return Math.max(
        ambientTemperature,
        estimated
    );
}


// =========================================
// UPDATE LIVE UI
// =========================================

function updateLiveUI(
    weatherData,
    timeFeatures
) {

    const current =
        weatherData.current;


    const temperature =
        Number(
            current.temperature_2m
        );


    const irradiationWm2 =
        Number(
            current.shortwave_radiation
        );


    /*
        Open-Meteo gives:

        W/m²

        The training dataset uses
        irradiation on approximately
        a 0–1 scale.

        Therefore:

        500 W/m² -> 0.5
    */


    const irradiationForModel =
        irradiationWm2 / 1000;


    const moduleTemperature =
        estimateModuleTemperature(
            temperature,
            irradiationWm2
        );


    liveWeatherData = {

        ambientTemperature:
            temperature,

        irradiationWm2:
            irradiationWm2,

        irradiationForModel:
            irradiationForModel

    };


    liveTimeData =
        timeFeatures;


    liveModuleTemperature =
        moduleTemperature;


    // =====================================
    // DISPLAY API / TIME VALUES
    // =====================================

    document.getElementById(
        "liveTemperature"
    ).textContent =
        temperature.toFixed(1);


    document.getElementById(
        "liveIrradiation"
    ).textContent =
        irradiationWm2.toFixed(0);


    document.getElementById(
        "liveHour"
    ).textContent =
        String(
            timeFeatures.HOUR
        ).padStart(
            2,
            "0"
        );


    document.getElementById(
        "liveDay"
    ).textContent =
        timeFeatures.DAY;


    document.getElementById(
        "liveMonth"
    ).textContent =
        timeFeatures.MONTH;


    document.getElementById(
        "liveWeekday"
    ).textContent =
        timeFeatures.WEEKDAY;


    // =====================================
    // DISPLAY ASSUMPTIONS
    // =====================================

    document.getElementById(
        "assumedModuleTemperature"
    ).textContent =
        `${moduleTemperature.toFixed(1)} °C`;


    document.getElementById(
        "assumedSourceKey"
    ).textContent =
        liveSourceKey;
}


// =========================================
// FETCH WEATHER
// =========================================

const weatherButton =
    document.getElementById(
        "weatherButton"
    );


weatherButton.addEventListener(
    "click",
    async function () {

        const locationInput =
            document.getElementById(
                "location"
            );


        const message =
            document.getElementById(
                "liveMessage"
            );


        const locationName =
            locationInput.value.trim();


        if (!locationName) {

            message.textContent =
                "Enter a location first.";

            return;
        }


        weatherButton.disabled =
            true;


        weatherButton.innerHTML =
            "Fetching...";


        message.textContent =
            "Finding location and retrieving current solar conditions...";


        try {

            // Find location

            const location =
                await findLocation(
                    locationName
                );


            // Fetch weather

            const weather =
                await fetchWeather(
                    location.latitude,
                    location.longitude
                );


            // Get time

            const timeFeatures =
                getTimeFeatures(
                    weather
                );


            // Update UI

            updateLiveUI(
                weather,
                timeFeatures
            );


            message.textContent =
                `Live conditions loaded for ${location.name}.`;

        } catch (error) {

            console.error(
                error
            );


            message.textContent =
                "Could not fetch live conditions. Check the location or internet connection.";

        } finally {

            weatherButton.disabled =
                false;


            weatherButton.innerHTML =
                "Fetch weather <span>→</span>";

        }

    }
);


// =========================================
// LIVE PREDICTION
// =========================================

const livePredictButton =
    document.getElementById(
        "livePredict"
    );


livePredictButton.addEventListener(
    "click",
    async function () {

        const result =
            document.getElementById(
                "liveResult"
            );


        const message =
            document.getElementById(
                "liveMessage"
            );


        // Weather must be fetched first

        if (
            !liveWeatherData ||
            !liveTimeData ||
            liveModuleTemperature === null
        ) {

            message.textContent =
                "Fetch weather conditions first.";

            return;
        }


        livePredictButton.disabled =
            true;


        message.textContent =
            "Running Random Forest prediction...";


        /*
            The existing trained model
            expects exactly these 9 features.

            The website displays only
            the useful/relevant ones.

            IS_WEEKEND remains internal.
        */


        const predictionData = {


            // ASSUMPTION

            SOURCE_KEY_x:
                liveSourceKey,


            // OPEN-METEO

            AMBIENT_TEMPERATURE:
                liveWeatherData
                    .ambientTemperature,


            // ASSUMPTION

            MODULE_TEMPERATURE:
                liveModuleTemperature,


            // OPEN-METEO

            IRRADIATION:
                liveWeatherData
                    .irradiationForModel,


            // TIME

            HOUR:
                liveTimeData.HOUR,


            DAY:
                liveTimeData.DAY,


            MONTH:
                liveTimeData.MONTH,


            WEEKDAY:
                liveTimeData.WEEKDAY,


            // INTERNAL ONLY

            IS_WEEKEND:
                liveTimeData.IS_WEEKEND

        };


        try {

            const response =
                await fetch(
                    API_URL,
                    {

                        method:
                            "POST",

                        headers:
                            {
                                "Content-Type":
                                    "application/json"
                            },

                        body:
                            JSON.stringify(
                                predictionData
                            )

                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Prediction request failed."
                );

            }


            const data =
                await response.json();


            const prediction =
                Number(
                    data.predicted_ac_power
                );


            result.textContent =
                prediction.toFixed(2);


            message.textContent =
                "Prediction generated from the current solar conditions.";


        } catch (error) {

            console.error(
                error
            );


            message.textContent =
                "Could not connect to the prediction backend.";

        } finally {

            livePredictButton.disabled =
                false;

        }

    }
);


// =========================================
// MANUAL INPUTS
// =========================================

function getManualInputs() {

    return {

        SOURCE_KEY_x:
            document.getElementById(
                "sourceKey"
            ).value,


        AMBIENT_TEMPERATURE:
            document.getElementById(
                "ambientTemperature"
            ).value,


        MODULE_TEMPERATURE:
            document.getElementById(
                "moduleTemperature"
            ).value,


        IRRADIATION:
            document.getElementById(
                "irradiation"
            ).value,


        HOUR:
            document.getElementById(
                "hour"
            ).value,


        DAY:
            document.getElementById(
                "day"
            ).value,


        MONTH:
            document.getElementById(
                "month"
            ).value,


        WEEKDAY:
            document.getElementById(
                "weekday"
            ).value,


        IS_WEEKEND:
            document.getElementById(
                "isWeekend"
            ).value

    };

}


// =========================================
// VALIDATE MANUAL INPUTS
// =========================================

function validateManualInputs(
    data
) {

    for (
        const key in data
    ) {

        if (
            data[key] === "" ||
            data[key] === null ||
            data[key] === undefined
        ) {

            return false;

        }

    }


    return true;
}


// =========================================
// CONVERT MANUAL INPUTS
// =========================================

function convertManualInputs(
    data
) {

    Object.keys(data).forEach(
        function (key) {

            data[key] =
                Number(
                    data[key]
                );

        }
    );


    return data;
}


// =========================================
// MANUAL PREDICTION
// =========================================

const manualPredictButton =
    document.getElementById(
        "manualPredict"
    );


manualPredictButton.addEventListener(
    "click",
    async function () {

        const result =
            document.getElementById(
                "manualResult"
            );


        const message =
            document.getElementById(
                "manualMessage"
            );


        let data =
            getManualInputs();


        if (
            !validateManualInputs(
                data
            )
        ) {

            message.textContent =
                "Please fill in all model inputs.";

            return;
        }


        data =
            convertManualInputs(
                data
            );


        manualPredictButton.disabled =
            true;


        message.textContent =
            "Running Random Forest prediction...";


        try {

            const response =
                await fetch(
                    API_URL,
                    {

                        method:
                            "POST",

                        headers:
                            {
                                "Content-Type":
                                    "application/json"
                            },

                        body:
                            JSON.stringify(
                                data
                            )

                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Prediction request failed."
                );

            }


            const responseData =
                await response.json();


            const prediction =
                Number(
                    responseData
                        .predicted_ac_power
                );


            result.textContent =
                prediction.toFixed(2);


            message.textContent =
                "Prediction generated successfully.";


        } catch (error) {

            console.error(
                error
            );


            message.textContent =
                "Could not connect to the prediction backend.";

        } finally {

            manualPredictButton.disabled =
                false;

        }

    }
);