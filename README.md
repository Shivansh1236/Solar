# ☀️ Solar Power Generation Prediction

## 📌 Project Overview

This project focuses on analyzing and predicting **AC Power Generation** in a Solar Photovoltaic (PV) Plant using Machine Learning.

The project follows a complete end-to-end Data Science pipeline, including:

- Data Understanding
- Data Cleaning
- Exploratory Data Analysis (EDA)
- Feature Engineering
- Machine Learning
- Model Evaluation
- Frontend Development
- Backend Development
- ML Model Integration

The objective is to identify the key factors affecting solar power generation and develop an accurate predictive model. The trained model is integrated into a web application that uses current weather data to estimate AC power generation under the given conditions.

---

# 📂 Dataset

The project uses the **Solar Power Generation Dataset** containing:

- Plant Generation Data
- Weather Sensor Data

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
- Date & Time

---

# 🛠 Tech Stack

- Python
- Pandas
- NumPy
- Matplotlib
- Seaborn
- Scikit-learn
- Jupyter Notebook
- Flask
- Flask-CORS
- HTML
- CSS
- JavaScript
- Open-Meteo API
- Git
- GitHub
- Git LFS

---

# 📁 Project Structure

```text
SOLAR/
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

# 🚀 Project Workflow

## 1️⃣ Data Understanding

- Loaded generation and weather datasets.
- Explored dataset dimensions and data types.
- Identified missing values and duplicate records.
- Created a comprehensive data dictionary.

---

## 2️⃣ Data Cleaning

- Converted date-time columns to datetime format.
- Verified missing values and duplicates.
- Prepared cleaned datasets for further analysis.

---

## 3️⃣ Exploratory Data Analysis (EDA)

Performed detailed visual analysis, including:

- AC Power Distribution
- Temperature Distribution
- Irradiation Distribution
- Correlation Analysis
- Hourly Power Generation
- Daily Power Generation
- Weather Trends
- Relationship between weather parameters and power generation

---

## 4️⃣ Feature Engineering

- Merged generation and weather datasets.
- Created new time-based features:
  - Hour
  - Day
  - Month
  - Weekday
  - Is Weekend
- Encoded categorical variables.
- Removed highly correlated and non-informative features before model training.

---

## 5️⃣ Machine Learning

Implemented and compared three regression models:

- Linear Regression
- Decision Tree Regressor
- Random Forest Regressor

Evaluation Metrics:

- Mean Absolute Error (MAE)
- Root Mean Squared Error (RMSE)
- R² Score

The **Random Forest Regressor** was selected as the final model based on the evaluation results.

The trained model is saved as `random_forest_model.pkl` and used by the backend for predictions.

---

# 📊 Model Performance

| Model | MAE | RMSE | R² Score |
|------|------:|------:|---------:|
| Linear Regression | 0.6730 | 1.2059 | 0.999991 |
| Decision Tree | 0.1653 | 0.8716 | 0.999995 |
| **Random Forest** | **0.1304** | **0.8229** | **0.999996** |

The **Random Forest Regressor** achieved the best predictive performance among the three models.

---

# 📈 Feature Importance

To build a more meaningful predictive model, the following features were excluded:

- DC_POWER
- DAILY_YIELD
- TOTAL_YIELD
- SOURCE_KEY_y
- PLANT_ID

### Key Findings

- **Irradiation** is the most influential feature affecting AC Power generation.
- **Inverter ID** contributes slightly to prediction accuracy.
- **Module Temperature** and **Ambient Temperature** have smaller contributions.
- Time-based features have comparatively lower importance.

---

# 🌐 Web Application

The project includes a web application that integrates the trained machine learning model with a user-friendly interface.

### Frontend

The frontend is developed using:

- HTML for page structure
- CSS for styling and responsive layout
- JavaScript for interactions, weather data retrieval, and API communication

The interface provides live-weather-based prediction and manual prediction options.

### Backend

The backend is developed using **Flask**, a lightweight Python web framework.

It provides a `/predict` API endpoint that:

- Receives input features from the frontend.
- Prepares the input data in the format expected by the trained model.
- Loads and uses the saved Random Forest model.
- Returns the predicted AC power as a JSON response.

### Live Weather Integration

The application uses the **Open-Meteo API** to retrieve current weather information for a selected location.

The live prediction workflow is:

1. The user enters a location.
2. The application retrieves current weather data.
3. Relevant model features, including temperature, irradiation, and time-based features, are prepared.
4. Module temperature is estimated, and the configured inverter key is supplied where required.
5. The prepared features are sent to the Flask backend.
6. The trained Random Forest model predicts AC power.
7. The prediction is displayed on the website.

Some model inputs are estimated or fixed because they are not directly available from the live weather API. Therefore, live predictions are estimates under the selected model configuration.

### Manual Prediction

Users can also enter the model input features manually and obtain a prediction through the same backend API.

---

# ⚙️ Installation and Setup

### Prerequisites

- Python installed on the system
- A modern web browser
- Git, if cloning the repository
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

### 3. Start the Backend

From the project root directory, run:

```bash
python backend/app.py
```

The Flask server should start at:

```text
http://127.0.0.1:5000
```

Keep the terminal running while using the prediction feature.

### 4. Open the Frontend

Open `frontend/index.html` in a web browser.

The frontend can display its interface independently, but the prediction feature requires the Flask backend to be running on the same computer.

**Note:** The saved model is tracked using Git LFS because of its large file size. Make sure the actual model file is downloaded before starting the backend. If necessary, run:

```bash
git lfs install
git lfs pull
```

---

# 💡 Key Insights

- Solar irradiation is the primary driver of AC power generation.
- Weather conditions significantly influence solar energy production.
- Random Forest effectively captures the nonlinear relationship between environmental variables and power generation.
- Integrating the trained model with a web application makes predictions accessible through a simple user interface.

---

# 🔮 Future Improvements

- Cross-validation and further evaluation on unseen dates and inverters.
- Online deployment of the frontend and backend for public access.
- Improved module-temperature estimation using additional sensor data.
- Prediction history and downloadable prediction results.
- Further validation of model performance under different weather conditions.

---

# 👨‍💻 Author

Minor Team 
Punjab Engineering College, Chandigarh