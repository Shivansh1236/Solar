from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID
import math
import os

import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

from database import (
    save_manual_prediction,
    get_manual_prediction_history,
    create_analysis_session,
    save_analysis_reading,
    finish_analysis_session,
    get_analysis_session,
    get_analysis_readings,
    get_analysis_sessions,
)


# =========================================
# FLASK CONFIGURATION
# =========================================

app = Flask(__name__)
CORS(app)


# =========================================
# LOAD PLANT-SPECIFIC MACHINE LEARNING MODELS
# =========================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "models")

MODEL_CONFIG = {
    "1": {
        "plant_id": 1,
        "plant_name": "Plant 1",
        "model_name": "XGBoost",
        "filename": "plant_1_xgboost.pkl",
    },
    "2": {
        "plant_id": 2,
        "plant_name": "Plant 2",
        "model_name": "Random Forest",
        "filename": "plant_2_random_forest.pkl",
    },
}

# Both new artifacts are required. Fail at startup with a clear message if
# either file has not been copied into the project's root/models directory.
MODELS = {}
for plant_id, config in MODEL_CONFIG.items():
    model_path = os.path.join(MODEL_DIR, config["filename"])
    if not os.path.isfile(model_path):
        raise FileNotFoundError(
            f"Missing model for {config['plant_name']}: {model_path}. "
            "Copy the trained PKL into the project's models folder."
        )
    MODELS[plant_id] = joblib.load(model_path)
    app.logger.info(
        "Loaded %s model for %s from %s",
        config["model_name"],
        config["plant_name"],
        model_path,
    )

FEATURE_COLUMNS = [
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


# =========================================
# HELPERS
# =========================================

def make_json_safe(value):
    if isinstance(value, dict):
        return {key: make_json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [make_json_safe(item) for item in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (Decimal,)):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    return value


def find_analysis_session(session_id):
    return get_analysis_session(session_id)


def parse_weather_time(value):
    """Convert the Open-Meteo local timestamp to a naive local datetime."""
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    # The database column is a timestamp without time zone. Keep the
    # observation's local wall-clock time instead of converting to UTC.
    if parsed.tzinfo is not None:
        parsed = parsed.replace(tzinfo=None)
    return parsed


def finite_number(value, field_name):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{field_name} must be a finite number.")
    return number


def resolve_plant_id(value):
    """Normalize accepted plant identifiers to the registry keys '1' or '2'."""
    if value is None:
        value = "1"

    normalized = str(value).strip().lower().replace("-", "_")
    aliases = {
        "1": "1",
        "plant1": "1",
        "plant_1": "1",
        "plant 1": "1",
        "2": "2",
        "plant2": "2",
        "plant_2": "2",
        "plant 2": "2",
    }

    if normalized not in aliases:
        raise ValueError("Invalid plant_id. Supported values are 1 and 2.")

    return aliases[normalized]


def get_plant_model(plant_value=None):
    """Return normalized plant ID, model object, and model configuration."""
    plant_id = resolve_plant_id(plant_value)
    return plant_id, MODELS[plant_id], MODEL_CONFIG[plant_id]


def plant_selection_from_payload(data):
    """Read plant_id, while accepting 'plant' as a compatibility alias."""
    return data.get("plant_id", data.get("plant", "1"))


# =========================================
# HOME ROUTE
# =========================================

@app.route("/")
def home():
    return "Solar Prediction Backend is running!"


@app.route("/models", methods=["GET"])
def available_models():
    """Expose the plant/model mapping for the frontend plant selector."""
    return jsonify({
        "models": [
            {
                "plant_id": config["plant_id"],
                "plant_name": config["plant_name"],
                "model_name": config["model_name"],
            }
            for config in MODEL_CONFIG.values()
        ]
    })


# =========================================
# PREDICTION ROUTE
# =========================================

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON request."}), 400

    prediction_mode = data.get("prediction_mode", "live")
    if prediction_mode not in ("live", "manual"):
        return jsonify({"error": "Invalid prediction mode."}), 400

    try:
        plant_id, selected_model, model_config = get_plant_model(
            plant_selection_from_payload(data)
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    missing = [name for name in FEATURE_COLUMNS if name not in data]
    if missing:
        return jsonify({
            "error": "Missing model inputs.",
            "missing_features": missing
        }), 400

    try:
        model_inputs = {
            "SOURCE_KEY_x": int(data["SOURCE_KEY_x"]),
            "AMBIENT_TEMPERATURE": finite_number(data["AMBIENT_TEMPERATURE"], "Ambient temperature"),
            "MODULE_TEMPERATURE": finite_number(data["MODULE_TEMPERATURE"], "Module temperature"),
            "IRRADIATION": finite_number(data["IRRADIATION"], "Irradiation"),
            "HOUR": int(data["HOUR"]),
            "DAY": int(data["DAY"]),
            "MONTH": int(data["MONTH"]),
            "WEEKDAY": int(data["WEEKDAY"]),
            "IS_WEEKEND": int(data["IS_WEEKEND"]),
        }
    except (ValueError, TypeError, OverflowError):
        return jsonify({"error": "Model inputs must be valid numeric values."}), 400

    features = pd.DataFrame([model_inputs], columns=FEATURE_COLUMNS)

    try:
        prediction = float(selected_model.predict(features)[0])
    except Exception:
        app.logger.exception("Model prediction failed for Plant %s.", plant_id)
        return jsonify({"error": "Could not generate prediction."}), 500

    response_data = {
        "predicted_ac_power": prediction,
        "plant_id": int(plant_id),
        "plant_name": model_config["plant_name"],
        "model_name": model_config["model_name"],
        "unit": "kW",
    }

    if prediction_mode == "manual":
        try:
            prediction_id = save_manual_prediction(
                model_inputs,
                prediction,
                plant_id=int(plant_id),
                model_name=model_config["model_name"],
            )
            response_data["history_saved"] = True
            response_data["prediction_id"] = prediction_id
            app.logger.info("Manual prediction saved. ID: %s", prediction_id)
        except Exception:
            app.logger.exception("Could not save manual prediction.")
            response_data["history_saved"] = False
            response_data["history_error"] = "Prediction generated, but could not be saved."

    return jsonify(response_data)


# =========================================
# BATCH PREDICTION FOR 24-HOUR OUTLOOK
# =========================================

@app.route("/batch-predict", methods=["POST"])
def batch_predict():
    """Predict a batch of hourly forecast feature rows without saving history."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON request."}), 400

    try:
        plant_id, selected_model, model_config = get_plant_model(
            plant_selection_from_payload(data)
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    rows = data.get("rows")
    if not isinstance(rows, list) or not rows:
        return jsonify({"error": "Provide a non-empty rows array."}), 400
    if len(rows) > 48:
        return jsonify({"error": "A maximum of 48 rows can be predicted per request."}), 400

    prepared_rows = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            return jsonify({"error": f"Row {index + 1} must be an object."}), 400

        missing = [name for name in FEATURE_COLUMNS if name not in row]
        if missing:
            return jsonify({
                "error": f"Row {index + 1} is missing model features.",
                "missing_features": missing
            }), 400

        try:
            prepared = {
                "SOURCE_KEY_x": int(row["SOURCE_KEY_x"]),
                "AMBIENT_TEMPERATURE": finite_number(row["AMBIENT_TEMPERATURE"], "Ambient temperature"),
                "MODULE_TEMPERATURE": finite_number(row["MODULE_TEMPERATURE"], "Module temperature"),
                "IRRADIATION": finite_number(row["IRRADIATION"], "Irradiation"),
                "HOUR": int(row["HOUR"]),
                "DAY": int(row["DAY"]),
                "MONTH": int(row["MONTH"]),
                "WEEKDAY": int(row["WEEKDAY"]),
                "IS_WEEKEND": int(row["IS_WEEKEND"]),
            }
        except (ValueError, TypeError, OverflowError) as error:
            return jsonify({"error": f"Invalid input in row {index + 1}: {error}"}), 400

        prepared_rows.append(prepared)

    features = pd.DataFrame(prepared_rows, columns=FEATURE_COLUMNS)

    try:
        predictions = selected_model.predict(features)
        values = [float(value) for value in predictions]
    except Exception:
        app.logger.exception("Batch prediction failed for Plant %s.", plant_id)
        return jsonify({"error": "Could not generate batch predictions."}), 500

    return jsonify({
        "predictions": values,
        "count": len(values),
        "saved_to_history": False,
        "plant_id": int(plant_id),
        "plant_name": model_config["plant_name"],
        "model_name": model_config["model_name"],
        "unit": "kW",
    })


# =========================================
# MANUAL PREDICTION HISTORY
# =========================================

@app.route("/history", methods=["GET"])
def prediction_history():
    try:
        limit = int(request.args.get("limit", 100))
        if limit < 1:
            return jsonify({"error": "Limit must be at least 1."}), 400
        history = get_manual_prediction_history(min(limit, 500))
        return jsonify({"history": make_json_safe(history), "count": len(history)})
    except ValueError:
        return jsonify({"error": "Invalid history limit."}), 400
    except Exception:
        app.logger.exception("Could not fetch prediction history.")
        return jsonify({"error": "Could not retrieve prediction history."}), 500


# =========================================
# CREATE ANALYSIS SESSION
# =========================================

@app.route("/analysis/sessions", methods=["POST"])
def start_analysis():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON request."}), 400

    try:
        location_name = str(data.get("location_name", "")).strip()
        latitude = finite_number(data.get("latitude"), "Latitude")
        longitude = finite_number(data.get("longitude"), "Longitude")
        timezone_name = str(data.get("timezone") or "").strip()
        interval_minutes = int(data.get("interval_minutes", 5))
        max_value = data.get("max_readings")
        max_readings = None if max_value in (None, "") else int(max_value)

        module_mode = data.get("module_temperature_mode", "estimated")
        source_mode = data.get("source_key_mode", "fixed")

        module_value = data.get("module_temperature_value")
        if module_mode == "manual":
            module_value = finite_number(module_value, "Manual module temperature")
        else:
            module_value = None

        source_value = data.get("source_key_value", 0)
        if source_mode == "manual":
            source_value = int(source_value)
        else:
            source_value = 0

        analysis_mode = str(data.get("analysis_mode", "comparison")).strip().lower()
        if analysis_mode not in ("comparison", "single"):
            raise ValueError("Analysis mode must be comparison or single.")
        selected_plant_id = data.get("selected_plant_id")
        if analysis_mode == "single":
            if selected_plant_id not in (1, 2, "1", "2"):
                raise ValueError("Select Plant 1 or Plant 2 for single-plant mode.")
            selected_plant_id = int(selected_plant_id)
        else:
            selected_plant_id = None

        if not location_name:
            raise ValueError("Location is required.")
        if not timezone_name:
            raise ValueError("Location timezone is required.")
        if not -90 <= latitude <= 90:
            raise ValueError("Invalid latitude.")
        if not -180 <= longitude <= 180:
            raise ValueError("Invalid longitude.")
        if not 1 <= interval_minutes <= 1440:
            raise ValueError("Collection interval must be between 1 and 1440 minutes.")
        if max_readings is not None and max_readings < 1:
            raise ValueError("Maximum readings must be at least 1.")
        if module_mode not in ("estimated", "auto", "manual"):
            raise ValueError("Invalid module temperature mode.")
        if source_mode not in ("fixed", "auto", "manual"):
            raise ValueError("Invalid source key mode.")

        config = {
            "location_name": location_name,
            "analysis_mode": analysis_mode,
            "selected_plant_id": selected_plant_id,
            "latitude": latitude,
            "longitude": longitude,
            "timezone": timezone_name,
            "interval_minutes": interval_minutes,
            "max_readings": max_readings,
            "module_temperature_mode": module_mode,
            "module_temperature_value": module_value,
            "source_key_mode": source_mode,
            "source_key_value": source_value,
        }

        session_id = create_analysis_session(config)
        return jsonify({
            "success": True,
            "session_id": str(session_id),
            "analysis_mode": analysis_mode,
            "selected_plant_id": selected_plant_id,
            "message": "Analysis session created successfully."
        }), 201

    except (ValueError, TypeError, KeyError, OverflowError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("Could not create analysis session.")
        return jsonify({"error": "Could not create analysis session."}), 500


# =========================================
# GET ALL ANALYSIS SESSIONS
# =========================================

@app.route("/analysis/sessions", methods=["GET"])
def analysis_session_list():
    try:
        limit = int(request.args.get("limit", 50))
        if limit < 1:
            return jsonify({"error": "Limit must be at least 1."}), 400
        sessions = get_analysis_sessions(min(limit, 200))
        safe_sessions = make_json_safe(sessions)
        return jsonify({"sessions": safe_sessions, "count": len(safe_sessions)})
    except Exception:
        app.logger.exception("Could not retrieve analysis sessions.")
        return jsonify({"error": "Could not retrieve analysis sessions."}), 500


# =========================================
# GET ONE ANALYSIS SESSION
# =========================================

@app.route("/analysis/sessions/<string:session_id>", methods=["GET"])
def analysis_session_detail(session_id):
    try:
        session = find_analysis_session(session_id)
        if session is None:
            return jsonify({"error": "Analysis session not found."}), 404
        return jsonify({"session": make_json_safe(session)})
    except Exception:
        app.logger.exception("Could not retrieve analysis session.")
        return jsonify({"error": "Could not retrieve analysis session."}), 500


# =========================================
# SAVE ONE ANALYSIS READING
# =========================================

@app.route("/analysis/sessions/<string:session_id>/readings", methods=["POST"])
def add_analysis_reading(session_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid JSON request."}), 400

    try:
        session = find_analysis_session(session_id)
        if session is None:
            return jsonify({"error": "Analysis session not found."}), 404
        if session.get("status") != "active":
            return jsonify({"error": "This analysis session is not active."}), 409

        previous_readings = get_analysis_readings(session_id)
        max_readings = session.get("max_readings")
        if max_readings is not None and len(previous_readings) >= int(max_readings):
            finish_analysis_session(session_id, "completed")
            return jsonify({"success": True, "completed": True, "message": "Maximum number of readings reached."})

        if session.get("source_key_mode") == "manual":
            source_key = session.get("manual_source_key")
        else:
            source_key = 0

        if session.get("module_temperature_mode") == "manual":
            module_temperature = session.get("manual_module_temperature")
        else:
            module_temperature = data.get("module_temperature")

        if module_temperature is None:
            raise ValueError("Module temperature is missing.")

        model_inputs = {
            "SOURCE_KEY_x": int(source_key),
            "AMBIENT_TEMPERATURE": finite_number(data.get("ambient_temperature"), "Ambient temperature"),
            "MODULE_TEMPERATURE": finite_number(module_temperature, "Module temperature"),
            "IRRADIATION": finite_number(data.get("irradiation"), "Irradiation"),
            "HOUR": int(data.get("hour")),
            "DAY": int(data.get("day")),
            "MONTH": int(data.get("month")),
            "WEEKDAY": int(data.get("weekday")),
            "IS_WEEKEND": int(data.get("is_weekend")),
        }
        shortwave_radiation = finite_number(
            data.get("shortwave_radiation_wm2"), "Shortwave radiation"
        )
        weather_time_local = parse_weather_time(data.get("weather_time_local"))
        features = pd.DataFrame([model_inputs], columns=FEATURE_COLUMNS)

        analysis_mode = str(session.get("analysis_mode") or "single").lower()
        selected_plant_id = int(session.get("selected_plant_id") or 1)
        plant_1_prediction = None
        plant_2_prediction = None
        plant_1_model_name = None
        plant_2_model_name = None

        if analysis_mode == "comparison":
            # Both plant models receive the same prepared weather/time inputs.
            plant_1_prediction = float(MODELS["1"].predict(features)[0])
            plant_2_prediction = float(MODELS["2"].predict(features)[0])
            plant_1_model_name = MODEL_CONFIG["1"]["model_name"]
            plant_2_model_name = MODEL_CONFIG["2"]["model_name"]
            legacy_prediction = plant_1_prediction
        else:
            plant_id, selected_model, model_config = get_plant_model(selected_plant_id)
            legacy_prediction = float(selected_model.predict(features)[0])
            if plant_id == "1":
                plant_1_prediction = legacy_prediction
                plant_1_model_name = model_config["model_name"]
            else:
                plant_2_prediction = legacy_prediction
                plant_2_model_name = model_config["model_name"]

        reading = {
            "fetched_at": datetime.now(timezone.utc),
            "weather_time_local": weather_time_local,
            "source_key": model_inputs["SOURCE_KEY_x"],
            "ambient_temperature": model_inputs["AMBIENT_TEMPERATURE"],
            "module_temperature": model_inputs["MODULE_TEMPERATURE"],
            "shortwave_radiation_wm2": shortwave_radiation,
            "irradiation": model_inputs["IRRADIATION"],
            "hour": model_inputs["HOUR"],
            "day": model_inputs["DAY"],
            "month": model_inputs["MONTH"],
            "weekday": model_inputs["WEEKDAY"],
            "is_weekend": model_inputs["IS_WEEKEND"],
            "predicted_ac_power": legacy_prediction,
            "plant_1_predicted_ac_power": plant_1_prediction,
            "plant_2_predicted_ac_power": plant_2_prediction,
            "plant_1_model_name": plant_1_model_name,
            "plant_2_model_name": plant_2_model_name,
        }

        reading_id = save_analysis_reading(session_id, reading)
        total_readings = len(get_analysis_readings(session_id))
        completed = max_readings is not None and total_readings >= int(max_readings)
        if completed:
            finish_analysis_session(session_id, "completed")

        return jsonify({
            "success": True,
            "reading_id": reading_id,
            "session_id": str(session_id),
            "predicted_ac_power": legacy_prediction,
            "plant_1_predicted_ac_power": plant_1_prediction,
            "plant_2_predicted_ac_power": plant_2_prediction,
            "plant_1_model_name": plant_1_model_name,
            "plant_2_model_name": plant_2_model_name,
            "analysis_mode": analysis_mode,
            "plant_id": selected_plant_id if analysis_mode == "single" else None,
            "total_readings": total_readings,
            "completed": completed,
            "unit": "kW",
        }), 201

    except (ValueError, TypeError, KeyError, OverflowError) as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        app.logger.exception("Could not save analysis reading.")
        return jsonify({"error": "Could not process analysis reading."}), 500


# =========================================
# GET READINGS FOR ONE SESSION
# =========================================

@app.route("/analysis/sessions/<string:session_id>/readings", methods=["GET"])
def analysis_reading_list(session_id):
    try:
        session = find_analysis_session(session_id)
        if session is None:
            return jsonify({"error": "Analysis session not found."}), 404
        readings = make_json_safe(get_analysis_readings(session_id))
        return jsonify({"session_id": str(session_id), "readings": readings, "count": len(readings)})
    except Exception:
        app.logger.exception("Could not retrieve analysis readings.")
        return jsonify({"error": "Could not retrieve analysis readings."}), 500


# =========================================
# STOP ANALYSIS SESSION
# =========================================

@app.route("/analysis/sessions/<string:session_id>/stop", methods=["POST"])
def stop_analysis(session_id):
    try:
        session = find_analysis_session(session_id)
        if session is None:
            return jsonify({"error": "Analysis session not found."}), 404
        if session.get("status") != "active":
            return jsonify({
                "error": "This session is not active.",
                "status": session.get("status")
            }), 409

        finish_analysis_session(session_id, "stopped")
        return jsonify({
            "success": True,
            "session_id": str(session_id),
            "status": "stopped",
            "message": "Analysis session stopped successfully."
        })
    except Exception:
        app.logger.exception("Could not stop analysis session.")
        return jsonify({"error": "Could not stop analysis session."}), 500


# =========================================
# RUN APPLICATION
# =========================================

if __name__ == "__main__":
    app.run(debug=True)
