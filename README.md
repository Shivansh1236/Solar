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

The objective is to identify the key factors affecting solar power generation and develop an accurate predictive model.

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
- Scikit-learn
- Jupyter Notebook
- Git
- GitHub

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
├── models/
│
├── Notebooks/
│   ├── Data_understanding.ipynb
│   ├── Data_cleaning.ipynb
│   ├── EDA.ipynb
│   ├── Feature_Engineering.ipynb
│   └── Machine_Learning.ipynb
│
├── Powerbi/
│
├── report/
│   └── Data_Dictionary.md
│
├── sql/
├── src/
│
├── README.md
├── requirements.txt
└── .gitignore
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

---

# 📊 Model Performance

| Model | MAE | RMSE | R² Score |
|------|------:|------:|---------:|
| Linear Regression | 0.6730 | 1.2059 | 0.999991 |
| Decision Tree | 0.1653 | 0.8716 | 0.999995 |
| **Random Forest** | **0.1304** | **0.8229** | **0.999996** |

The **Random Forest Regressor** achieved the best predictive performance.

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

# 💡 Key Insights

- Solar irradiation is the primary driver of AC power generation.
- Weather conditions significantly influence solar energy production.
- Random Forest effectively captures the nonlinear relationship between environmental variables and power generation.

---

# 🔮 Future Improvements

- Cross-validation
- Interactive Power BI dashboard
- Save trained models
- Real-time solar power prediction

---

# 👨‍💻 Author

**Arush Bisht**

B.Tech – Computer Science & Engineering (Data Science)

Punjab Engineering College, Chandigarh