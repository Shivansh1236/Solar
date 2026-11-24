
from pathlib import Path
import joblib
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor


# Project paths
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "Data" / "Cleaned"
MODEL_DIR = ROOT / "models"

FEATURES = [
    "SOURCE_KEY_x",
    "AMBIENT_TEMPERATURE",
    "MODULE_TEMPERATURE",
    "IRRADIATION",
    "HOUR",
    "DAY",
    "MONTH",
    "WEEKDAY",
    "IS_WEEKEND",
]

TARGET = "AC_POWER"

PLANTS = {
    "Plant 1": {
        "file": "Plant_1_Feature_Engineered.csv",
        "number": 1,
    },
    "Plant 2": {
        "file": "Plant_2_Feature_Engineered.csv",
        "number": 2,
    },
}


def create_models():
    return {
        "Random Forest": RandomForestRegressor(
            n_estimators=100,
            random_state=14,
            n_jobs=-1
        ),

        "Gradient Boosting": GradientBoostingRegressor(
            random_state=14
        ),

        "XGBoost": XGBRegressor(
            n_estimators=100,
            random_state=14,
            objective="reg:squarederror",
            n_jobs=-1
        ),
    }


def train_plant(plant_name, config):

    print("\n" + "=" * 65)
    print(f"TRAINING {plant_name.upper()}")
    print("=" * 65)

    file_path = DATA_DIR / config["file"]

    if not file_path.exists():
        raise FileNotFoundError(f"Dataset not found: {file_path}")

    df = pd.read_csv(file_path)

    required = FEATURES + [TARGET]
    missing = [col for col in required if col not in df.columns]

    if missing:
        raise ValueError(f"Missing columns: {missing}")

    # Keep only required numerical columns
    data = df[required].apply(pd.to_numeric, errors="coerce")

    valid_rows = np.isfinite(data.to_numpy(dtype=float)).all(axis=1)
    removed = len(data) - int(valid_rows.sum())

    if removed:
        print(f"Invalid rows removed: {removed}")

    data = data.loc[valid_rows]

    if data.empty:
        raise ValueError("No valid rows available for training.")

    X = data[FEATURES].copy()
    y = data[TARGET].copy()

    print(f"Dataset rows: {len(data):,}")
    print(f"Features: {len(FEATURES)}")

    # Same random 80/20 split as the original notebooks
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=14
    )

    results = []
    models = create_models()

    # Train and evaluate all three models
    for name, model in models.items():

        print(f"\nTraining {name}...")

        model.fit(X_train, y_train)
        predictions = model.predict(X_test)

        mae = mean_absolute_error(y_test, predictions)
        rmse = np.sqrt(mean_squared_error(y_test, predictions))
        r2 = r2_score(y_test, predictions)

        results.append({
            "Model": name,
            "MAE": mae,
            "RMSE": rmse,
            "R2": r2
        })

        print(f"MAE:  {mae:.4f}")
        print(f"RMSE: {rmse:.4f}")
        print(f"R2:   {r2:.6f}")

    # Display comparison
    comparison = pd.DataFrame(results).sort_values(
        by=["RMSE", "MAE"],
        ascending=True
    )

    print("\nMODEL COMPARISON")
    print(comparison.to_string(index=False))

    # Select the model with the lowest RMSE
    winner_name = comparison.iloc[0]["Model"]

    print(f"\nSelected model: {winner_name}")

    # Refit winning model on the complete dataset
    # The comparison metrics above remain based on the held-out 20%.
    final_model = create_models()[winner_name]

    print("Training selected model on the complete dataset...")
    final_model.fit(X, y)

    # Generate model-specific filename
    slug = {
        "Random Forest": "random_forest",
        "Gradient Boosting": "gradient_boosting",
        "XGBoost": "xgboost"
    }[winner_name]

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    output_path = MODEL_DIR / (
        f"plant_{config['number']}_{slug}.pkl"
    )

    # Save only the model PKL
    joblib.dump(final_model, output_path)

    # Verify the saved model
    loaded_model = joblib.load(output_path)
    test_predictions = loaded_model.predict(X.iloc[:5])

    assert np.isfinite(test_predictions).all()

    print(f"\nSaved successfully: {output_path}")
    print("PKL verification: PASSED")

    return winner_name, comparison


def main():

    print("SOLAR POWER GENERATION MODEL TRAINING")
    print("Random 80/20 split | random_state=14")
    print("Models: Random Forest, Gradient Boosting, XGBoost")

    for plant_name, config in PLANTS.items():
        winner, comparison = train_plant(plant_name, config)
        print(f"\n{plant_name} winner: {winner}")

    print("\n" + "=" * 65)
    print("MODEL TRAINING COMPLETED")
    print("=" * 65)


if __name__ == "__main__":
    main()
