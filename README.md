# ☀️ Solar Power Generation Prediction

An end-to-end machine-learning project for analyzing solar photovoltaic (PV) plant data and predicting inverter-level AC power generation. The project covers data understanding, cleaning, exploratory data analysis, feature engineering, model training, evaluation, and a web application that uses plant-specific trained models.

The final application supports two solar plants:

- **Plant 1 — XGBoost Regressor**
- **Plant 2 — Random Forest Regressor**

It combines live weather information, manual prediction inputs, saved prediction history, continuous weather-based analysis sessions, and multi-location solar outlook comparisons.

---

## Project features

### 1. Dashboard and prediction

The main dashboard provides two prediction modes:

- **Live prediction:** retrieves current weather information for a selected location through Open-Meteo, prepares the model inputs, and requests a prediction from the selected plant's model.
- **Manual prediction:** allows the user to enter the nine model features directly for a what-if prediction.

A plant selector determines which plant-specific model is used by both modes.

### 2. Prediction History

Manual predictions can be saved in the database and viewed later. The history interface displays the predicted AC power along with the selected plant and model, and supports filtering and CSV export.

### 3. Analysis Desk

The Analysis Desk creates monitoring sessions for a selected location. It periodically retrieves weather data and sends the prepared inputs to the plant models.

- The default mode compares **both plants in the same session** using shared weather inputs.
- Plant 1 predictions use XGBoost; Plant 2 predictions use Random Forest.
- Two side-by-side charts display the predictions using a common scale.
- Users can unlock single-plant mode when they need to monitor only one plant.
- Sessions and individual readings are stored in Supabase PostgreSQL. Session names, locations, notes, categories, and favorites are available in the interface; browser-local display metadata remains local to that browser.

### 4. Solar Outlook

Solar Outlook provides a 24-hour weather-based comparison across multiple locations.

- Search for cities and add up to six locations to the saved location portfolio.
- View saved locations on an interactive map.
- Retrieve one hourly Open-Meteo forecast per location.
- Send the same hourly weather and time features to both plant-specific models.
- Compare both AC-power curves, peak outputs, approximate 24-hour energy, and hourly inputs/outputs.

Saved Solar Outlook locations are stored in the browser's local storage. Forecasts are generated when the page loads or refreshes a location; they are not stored as database readings.

---

## Dataset

The project uses solar plant generation data and corresponding weather sensor data for two plants. The data includes inverter-level generation measurements and plant-level environmental observations.

### Raw dataset files

The `Data/Raw/` directory contains:

- `Plant_1_Generation_Data.csv`
- `Plant_1_Weather_Sensor_Data.csv`
- `Plant_2_Generation_Data.csv`
- `Plant_2_Weather_Sensor_Data.csv`

### Cleaned and feature-engineered files

The `Data/Cleaned/` directory contains cleaned generation and weather files and feature-engineered datasets for both plants:

- `Plant_1_Generation_Cleaned.csv`
- `Plant_1_Weather_Cleaned.csv`
- `Plant_1_Feature_Engineered.csv`
- `Plant_2_Generation_Cleaned.csv`
- `Plant_2_Weather_Cleaned.csv`
- `Plant_2_Feature_Engineered.csv`

### Important dataset fields

| Field | Description |
|---|---|
| `DATE_TIME` | Timestamp of a generation or weather observation |
| `PLANT_ID` | Identifier of the solar plant |
| `SOURCE_KEY` | Inverter identifier in generation data |
| `DC_POWER` | Direct-current power output |
| `AC_POWER` | Alternating-current power output; model target |
| `DAILY_YIELD` | Energy produced during the day |
| `TOTAL_YIELD` | Cumulative energy produced |
| `AMBIENT_TEMPERATURE` | Surrounding air temperature in °C |
| `MODULE_TEMPERATURE` | Solar module temperature in °C |
| `IRRADIATION` | Solar irradiation in kW/m² in the prepared dataset |

The generation and weather data are combined during feature engineering using the relevant plant and timestamp fields. Refer to `report/Data_Dictionary.md` for the detailed field descriptions.

---

## Machine-learning approach

The task is treated as a **supervised regression problem**. The target variable is `AC_POWER`.

### Model input features

Both plant-specific estimators expect the following nine numeric features:

```text
SOURCE_KEY_x
AMBIENT_TEMPERATURE
MODULE_TEMPERATURE
IRRADIATION
HOUR
DAY
MONTH
WEEKDAY
IS_WEEKEND
```

The time-based columns are derived from the observation timestamp. The inverter identifier is encoded as `SOURCE_KEY_x`. The feature-engineering notebooks prepare the plant-specific datasets for model training.

### Selected models and evaluation

The selected models and their reported random test-split results are:

| Plant | Selected model | MAE (kW) ↓ | RMSE (kW) ↓ | R² ↑ |
|---|---|---:|---:|---:|
| Plant 1 | XGBoost Regressor | 14.7004 | 40.4904 | 0.989538 |
| Plant 2 | Random Forest Regressor | 42.8340 | 120.9530 | 0.887328 |

The evaluation uses a random 80/20 train-test split with `random_state=14`, consistent with the model experiments. These metrics describe performance on that test split; they should not be interpreted as chronological or future-period forecasting performance.

**Metric definitions**

- **MAE (Mean Absolute Error):** average absolute difference between actual and predicted AC power.
- **RMSE (Root Mean Squared Error):** square root of the average squared prediction error; larger errors receive greater weight.
- **R² score:** proportion of the target variance explained by the model on the evaluated test data.

### Model artifacts

The Flask backend loads these two files from the root `models/` directory:

```text
models/
├── plant_1_xgboost.pkl
└── plant_2_random_forest.pkl
```

Both artifacts are required for the backend to start. The files contain the trained estimators; the backend supplies the nine prepared numeric input columns in the expected order. The old root-level `random_forest_model.pkl` is a legacy artifact and is not used by the current backend.

### Important modelling assumptions

- `AC_POWER` represents **inverter-level AC power**, not the total output of the entire solar plant.
- In live weather workflows, Open-Meteo provides ambient temperature and shortwave radiation. The application converts shortwave radiation from W/m² to the model's irradiation scale by dividing by 1,000.
- When module temperature is not measured, the application uses the project's approximation: `MODULE_TEMPERATURE = AMBIENT_TEMPERATURE + 0.025 × shortwave_radiation_Wm2`.
- Live weather workflows currently use numeric `SOURCE_KEY_x = 0`. The inverter identifiers were encoded independently for each plant, so code `0` is not guaranteed to represent the same physical inverter in Plant 1 and Plant 2.
- Weather-based predictions are model estimates based on forecast/current weather inputs, not measured inverter readings.
- Solar Outlook's approximate 24-hour energy value is calculated by summing hourly predicted kW values for one-hour intervals. It is an estimate, not a meter reading.

---

## Technology stack

| Area | Technologies |
|---|---|
| Programming language | Python |
| Data processing | Pandas, NumPy |
| Machine learning | scikit-learn, XGBoost |
| Model serialization | Joblib |
| Backend API | Flask, Flask-CORS |
| Database | Supabase PostgreSQL, Psycopg 3 |
| Frontend | HTML, CSS, JavaScript |
| Weather data | Open-Meteo Geocoding API and Forecast API |
| Mapping | Leaflet, MapLibre GL, OpenFreeMap |
| Data analysis | Jupyter Notebook, Matplotlib, Seaborn |
| Version control | Git, GitHub, Git LFS |

---

## Repository structure

```text
Solar/
├── .agents/                         # Local agent/tooling files (not required by the app)
├── backend/
│   ├── app.py                       # Flask API and plant-specific model loading
│   ├── database.py                  # Supabase PostgreSQL functions
│   └── test_db.py                   # Database connection/check script
├── Data/
│   ├── Raw/                         # Original Plant 1 and Plant 2 CSV files
│   └── Cleaned/                     # Cleaned and feature-engineered CSV files
├── frontend/
│   ├── index.html                   # Dashboard and prediction interface
│   ├── script.js
│   ├── style.css
│   ├── shared-ui.css
│   ├── history.html                 # Prediction history
│   ├── history.js
│   ├── history.css
│   ├── analysis.html                # Analysis Desk
│   ├── analysis.js
│   ├── analysis.css
│   ├── outlook.html                 # Solar Outlook
│   ├── outlook.js
│   └── outlook.css
├── models/
│   ├── plant_1_xgboost.pkl
│   └── plant_2_random_forest.pkl
├── Notebooks/                       # Data understanding, cleaning, EDA,
│   │                                # feature engineering, and ML notebooks
├── report/
│   └── Data_Dictionary.md
├── train_and_export_models.py       # Training and model export script
├── .env.example                     # Template for local environment variables
├── .gitattributes                   # Git LFS tracking rules
├── .gitignore
├── README.md
└── requirements.txt
```

If the SQL migration scripts are added to the repository, a recommended location is `database/migrations/`.

---

## Installation and setup

### Prerequisites

- Python 3.10 or later (use a version compatible with the installed XGBoost and other packages)
- Git
- Git LFS
- A modern web browser
- A Supabase project with PostgreSQL enabled

### 1. Clone the repository

```bash
git clone https://github.com/Shivansh1236/Solar.git
cd Solar
```

### 2. Create and activate a virtual environment

**Windows PowerShell:**

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

**macOS/Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Python dependencies

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

The requirements file should include Flask, Flask-CORS, Joblib, Pandas, NumPy, scikit-learn, XGBoost, `psycopg[binary]`, `python-dotenv`, and the notebook/visualization packages used by the project.

### 4. Retrieve the model files

Initialize Git LFS and download tracked model files:

```bash
git lfs install
git lfs pull
```

Confirm that both files exist and are actual model binaries (not Git LFS pointer text files):

```text
models/plant_1_xgboost.pkl
models/plant_2_random_forest.pkl
```

If the model files are not included in the repository, copy the two trained files into `models/` before starting Flask. Do not use the legacy `random_forest_model.pkl` file.

### 5. Configure the database

Create a local `.env` file in the project root. Start from `.env.example` and provide the connection string for your Supabase PostgreSQL database:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

Use the connection string and SSL settings provided by your Supabase project. The backend reads `DATABASE_URL` from the root `.env` file. **Never commit `.env` or publish the database connection string.**

The database must contain the tables used by the application, including `prediction_history`, `analysis_sessions`, and `analysis_readings`. Apply the SQL migration scripts supplied with the project in the intended order after the base tables exist:

1. `migration_add_plant_metadata.sql` — adds plant/model metadata to prediction history.
2. `migration_analysis_dual_plant.sql` — adds dual-plant comparison fields and session mode support to the Analysis Desk.

Run SQL migrations in the Supabase SQL Editor. Do not run a migration repeatedly unless it is designed to be rerunnable; follow the comments in each SQL file. Existing records are preserved by the provided migrations.

### 6. Start the Flask backend

Run this command from the repository root:

```bash
python backend/app.py
```

The local API runs at:

```text
http://127.0.0.1:5000
```

Keep this terminal open while using the application. The backend requires both plant model files and a valid database configuration for database-backed features.

### 7. Start the frontend

Open a second terminal from the repository root and run:

```bash
python -m http.server 5500 --directory frontend
```

Then open the following address in your browser:

```text
http://127.0.0.1:5500
```

Use the navigation bar to access Dashboard, Prediction History, Analysis Desk, and Solar Outlook. Keep both the Flask backend and frontend static server running.

---

## Backend API

The Flask application currently exposes these routes:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Backend health message |
| GET | `/models` | Returns the supported plant and model mapping |
| POST | `/predict` | Generates one prediction for the selected plant |
| POST | `/batch-predict` | Generates predictions for multiple rows for the selected plant |
| GET | `/history` | Retrieves saved manual prediction history |
| POST | `/analysis/sessions` | Creates a monitoring session |
| GET | `/analysis/sessions` | Lists analysis sessions |
| GET | `/analysis/sessions/<session_id>` | Retrieves one session |
| POST | `/analysis/sessions/<session_id>/readings` | Processes and saves a session reading; comparison mode evaluates both models |
| GET | `/analysis/sessions/<session_id>/readings` | Retrieves readings for a session |
| POST | `/analysis/sessions/<session_id>/stop` | Stops a monitoring session |

Prediction requests provide the nine model input fields and a `plant_id` (1 or 2). The selected plant determines which model is used. The batch endpoint also accepts a plant selection and is used by Solar Outlook to run both plant models on the same hourly weather inputs.

---

## Notebooks and workflow

The `Notebooks/` directory contains the analysis and model-development workflow for both plants. It includes notebooks for:

1. Data understanding
2. Data cleaning
3. Exploratory data analysis
4. Feature engineering
5. Machine-learning experiments and evaluation

Plant 2 has its own cleaning, EDA, feature-engineering, and machine-learning notebooks, alongside the corresponding Plant 1 notebooks. The `train_and_export_models.py` script exports the final plant-specific model artifacts to the `models/` directory.

---

## Testing checklist

After installation or a new deployment, verify the following:

- [ ] Backend starts and loads both plant-specific model files.
- [ ] `GET /models` returns Plant 1 / XGBoost and Plant 2 / Random Forest.
- [ ] Dashboard Live prediction works for both plant selections.
- [ ] Dashboard Manual prediction works for both plant selections.
- [ ] Manual predictions appear in Prediction History with the correct plant and model.
- [ ] A default Analysis Desk session generates and saves both plant predictions for each reading.
- [ ] Analysis Desk charts use the same scale for both plants.
- [ ] Optional single-plant mode works when unlocked.
- [ ] Existing analysis sessions and reports can still be opened.
- [ ] Solar Outlook loads both plant forecasts for a location.
- [ ] Solar Outlook can compare more than one saved location and display the map pins.

---

## Limitations and future work

- The reported evaluation uses a random train-test split. Chronological testing on later timestamps would provide a stronger assessment of future-period generalization.
- The model inputs use an encoded inverter identifier. The same numeric code in the two independently encoded plant datasets may not identify the same physical inverter.
- Weather-based predictions estimate module temperature and use a fixed numeric inverter code; real sensor values may differ.
- `AC_POWER` predictions are inverter-level estimates and should not be interpreted as total plant output.
- Additional validation on unseen inverters, real operational sensor data, and a wider range of weather conditions would strengthen the evaluation.
- Public deployment, authentication/authorization, and production database hardening are possible future improvements.

---


## 👨‍💻 Author

**Minor Project Team**  
Punjab Engineering College, Chandigarh
