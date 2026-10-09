# ☀️ Solar Power Generation Prediction

## 📌 Project Overview

This project focuses on analyzing and predicting **AC power generation** in a Solar Photovoltaic (PV) plant using Machine Learning.

The project follows an end-to-end Data Science and application development pipeline, including:

- Data Understanding
- Data Cleaning
- Exploratory Data Analysis (EDA)
- Feature Engineering
- Machine Learning
- Model Evaluation
- Frontend Development
- Backend Development
- ML Model Integration

The objective is to identify important factors affecting solar power generation and develop a regression model that predicts AC power from environmental conditions, inverter information, and time-based features.

The trained model is integrated into a web application that supports manual predictions and estimated predictions using weather data retrieved through the Open-Meteo API.

---

## 📂 Dataset

The project uses the **Solar Power Generation Dataset**, consisting of plant generation data and weather sensor data.

### Key Features

- Plant ID
- Inverter ID
- AC Power
- DC Power
- Daily Yield
- Total Yield
- Ambient Temperature
- Module Temperature
- Irradiation
- Date and Time

AC Power (`AC_POWER`) is the target variable that the machine learning models are trained to predict.

---

## 🛠 Tech Stack

- **Programming Language:** Python
- **Data Analysis:** Pandas, NumPy
- **Visualization:** Matplotlib, Seaborn
- **Machine Learning:** Scikit-learn
- **Development Environment:** Jupyter Notebook
- **Backend:** Flask, Flask-CORS
- **Model Serialization:** Joblib
- **Frontend:** HTML, CSS, JavaScript
- **Weather API:** Open-Meteo API
- **Version Control:** Git, GitHub, Git LFS

---

## 📁 Project Structure

```text
Solar/
│
├── Data/
│   ├── Raw/
│   │   ├── Plant_1_Generation_Data.csv
│   │   ├── Plant_1_Weather_Sensor_Data.csv
│   │   ├── Plant_2_Generation_Data.csv
│   │   └── Plant_2_Weather_Sensor_Data.csv
│   │
│   └── Cleaned/
│       ├── Plant_1_Generation_Cleaned.csv
│       ├── Plant_1_Weather_Cleaned.csv
│       └── Plant_1_Feature_Engineered.csv
│
├── Notebooks/
│   ├── Data_understanding.ipynb
│   ├── Data_cleaning.ipynb
│   ├── EDA.ipynb
│   ├── Feature_Engineering.ipynb
│   └── Machine_Learning.ipynb
│
├── backend/
│   └── app.py
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── report/
│   └── Data_Dictionary.md
│
├── random_forest_model.pkl
├── .gitattributes
├── .gitignore
├── README.md
└── requirements.txt
```

---

## 🚀 Project Workflow

### 1. Data Understanding

- Loaded and inspected the generation and weather datasets.
- Examined dataset dimensions, column names, and data types.
- Checked missing values and duplicate records.
- Prepared a data dictionary to describe the dataset features.

### 2. Data Cleaning

- Converted date-time columns into a suitable datetime format.
- Inspected data quality and prepared cleaned datasets.
- Organized the data for exploratory analysis and feature engineering.

### 3. Exploratory Data Analysis (EDA)

Exploratory Data Analysis was performed to understand patterns in solar power generation and its relationship with environmental conditions.

The analysis included:

- AC Power Distribution
- Ambient and Module Temperature Distribution
- Irradiation Distribution
- Correlation Analysis
- Hourly Power Generation
- Daily Power Generation Patterns
- Weather Trends
- Relationships between Weather Parameters and AC Power

### 4. Feature Engineering

The feature engineering stage prepares the input variables required by the machine learning models.

- Combined generation and weather data.
- Extracted time-based features:
  - `HOUR`
  - `DAY`
  - `MONTH`
  - `WEEKDAY`
  - `IS_WEEKEND`
- Encoded the inverter identifier as `SOURCE_KEY_x`.
- Removed `DC_POWER`, `DAILY_YIELD`, `TOTAL_YIELD`, `SOURCE_KEY_y`, and `PLANT_ID` from the model inputs.

These exclusions reduce dependence on variables that may be highly correlated with generation output or are not useful for the intended prediction setup.

### 5. Machine Learning

The project formulates solar power prediction as a **supervised regression problem**.

The target variable is:

```text
y = AC_POWER
```

The input features are:

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

Three regression algorithms were implemented and compared:

- Linear Regression
- Decision Tree Regressor
- Random Forest Regressor

The dataset is split into training and testing subsets using an **80/20 train-test split**, with `random_state=14`.

The models are evaluated using Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), and the R² score.

The Random Forest Regressor was selected as the final model. It is saved as `random_forest_model.pkl` and loaded by the Flask backend for predictions.

---

## 📊 Model Performance

The following results are from the latest execution of `Machine_Learning.ipynb`.

| Model | MAE ↓ | RMSE ↓ | R² Score ↑ |
|---|---:|---:|---:|
| Linear Regression | 26.4128 | 58.5295 | 0.9781 |
| Decision Tree Regressor | 18.7859 | 57.0004 | 0.9793 |
| **Random Forest Regressor** | **15.1446** | **47.5217** | **0.9856** |

**Evaluation metrics:**

- **Mean Absolute Error (MAE):** Measures the average absolute difference between actual and predicted AC power.
- **Root Mean Squared Error (RMSE):** Measures prediction error while penalizing larger errors more heavily.
- **R² Score:** Indicates how much variation in the target variable is explained by the model.

The Random Forest Regressor achieved the lowest MAE and RMSE and the highest R² score among the three models.

Its test-set R² score of **0.9856** indicates that it explains approximately 98.56% of the variance in the test targets under the current evaluation setup.

These results are based on the notebook's random 80/20 split. Further validation on later timestamps or unseen inverters would help assess generalization to new operating conditions.

---

## 📈 Feature Importance

Feature importance was extracted from the trained Random Forest Regressor to identify which input features contributed most to its predictions.

| Feature | Importance |
|---|---:|
| `IRRADIATION` | 98.4938% |
| `SOURCE_KEY_x` | 0.7463% |
| `MODULE_TEMPERATURE` | 0.2115% |
| `AMBIENT_TEMPERATURE` | 0.1637% |
| `DAY` | 0.1279% |
| `HOUR` | 0.1179% |
| `WEEKDAY` | 0.0976% |
| `MONTH` | 0.0267% |
| `IS_WEEKEND` | 0.0146% |

### Key Findings

- **Irradiation is the dominant predictor**, accounting for approximately 98.49% of the model's reported feature importance.
- The inverter identifier contributes a smaller proportion of the model's feature importance.
- Module temperature and ambient temperature have comparatively smaller importance scores.
- Time-based features contribute relatively little to the model's reported feature importance.

These values represent the Random Forest's relative feature-importance scores; they do not establish causation or guarantee that the same importance pattern will hold for other datasets.

---

## 🌐 Web Application

The project includes a web application that integrates the trained machine learning model with a user-friendly interface.

### Frontend

The frontend is developed using HTML, CSS, and JavaScript.

- **HTML:** Defines the structure of the application.
- **CSS:** Provides styling and layout.
- **JavaScript:** Handles user interactions, weather data retrieval, input preparation, and communication with the backend API.

The interface provides options for live-weather-based predictions and manual predictions.

### Backend

The backend is developed using **Flask**, a lightweight Python web framework, with Flask-CORS for cross-origin communication.

The backend exposes a `/predict` API endpoint that:

1. Receives model input features from the frontend.
2. Arranges the input data in the format expected by the trained model.
3. Loads the saved Random Forest model.
4. Generates an AC power prediction.
5. Returns the predicted value as a JSON response.

Example response:

```json
{
  "predicted_ac_power": 12.34
}
```

The value shown above is only an illustrative example, not an actual model result.

### Live Weather Integration

The application uses the **Open-Meteo API** to retrieve weather information for a selected location.

The live prediction workflow is:

1. The user selects or enters a location.
2. The frontend retrieves the relevant weather information.
3. Ambient temperature and irradiation-related inputs are prepared.
4. Module temperature is estimated, and the configured inverter key is supplied.
5. Time-based features are derived from the selected date and time.
6. The prepared inputs are sent to the Flask `/predict` endpoint.
7. The backend uses the trained Random Forest model to predict AC power.
8. The prediction is displayed in the frontend.

Some model inputs are estimated or fixed because they are not directly available from the weather API. Consequently, live predictions are estimates under the selected model configuration.

### Manual Prediction

The manual prediction interface allows users to provide the model's input features directly.

The inputs are sent to the same Flask prediction endpoint, and the resulting AC power prediction is displayed by the application.

---

## ⚙️ Installation and Setup

### Prerequisites

- Python installed on the system
- A modern web browser
- Git
- Git LFS to retrieve the saved model when cloning the repository

### 1. Clone the Repository

```bash
git clone https://github.com/Shivansh1236/Solar.git
cd Solar
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Retrieve the Model

The saved model is tracked using Git LFS because of its large file size.

```bash
git lfs install
git lfs pull
```

Ensure that `random_forest_model.pkl` contains the actual model file and not an LFS pointer before starting the backend.

### 4. Start the Backend

From the project root directory, run:

```bash
python backend/app.py
```

The Flask server is expected to run at:

```text
http://127.0.0.1:5000
```

Keep the terminal running while using the prediction functionality.

### 5. Open the Frontend

Open `frontend/index.html` in a web browser.

The frontend interface may load independently, but prediction requests require the Flask backend to be running on the same computer.

---

## 💡 Key Insights

- Solar irradiation is the dominant feature in the trained Random Forest model.
- Random Forest outperformed Linear Regression and Decision Tree on the three reported test metrics.
- The model achieved an R² score of 0.9856 on the current random test split.
- Combining a trained regression model with a Flask API makes predictions accessible through a web interface.
- Weather API integration provides a way to prepare estimated environmental inputs for live prediction.

---

## 🔮 Future Improvements

- Evaluate the model using chronological train-test splitting to assess performance on future timestamps.
- Validate predictions on unseen inverters and different operating conditions.
- Improve module-temperature estimation using additional sensor measurements.
- Deploy the frontend and backend for public access.
- Add prediction history and downloadable prediction results.
- Perform further testing across different weather conditions and irradiation levels.

---

## 👨‍💻 Author

**Minor Project Team**  
Punjab Engineering College, Chandigarh
