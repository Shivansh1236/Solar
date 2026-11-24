import os
from datetime import datetime, timezone

import psycopg
from psycopg import sql
from dotenv import load_dotenv


# =========================================
# ENVIRONMENT CONFIGURATION
# =========================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)
DATABASE_URL = os.getenv("DATABASE_URL")


# =========================================
# DATABASE CONNECTION
# =========================================

def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not found. Check your root .env file.")

    return psycopg.connect(DATABASE_URL, sslmode="require")


def get_table_columns(table_name):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                """,
                (table_name,)
            )
            return {row[0] for row in cursor.fetchall()}
    finally:
        connection.close()


def insert_dynamic_record(table_name, values):
    """Insert only supplied values whose columns exist in the table."""
    allowed_columns = get_table_columns(table_name)
    filtered_values = {
        key: value
        for key, value in values.items()
        if key in allowed_columns and value is not None
    }

    if not filtered_values:
        raise RuntimeError(f"No matching columns found in {table_name}.")

    columns = list(filtered_values)
    parameters = list(filtered_values.values())

    query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING id").format(
        sql.Identifier(table_name),
        sql.SQL(", ").join(sql.Identifier(column) for column in columns),
        sql.SQL(", ").join(sql.Placeholder() for _ in columns)
    )

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, parameters)
            record_id = cursor.fetchone()[0]
        connection.commit()
        return record_id
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def test_connection():
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database(), current_user;")
            database_name, user_name = cursor.fetchone()
            return {
                "database": database_name,
                "user": user_name,
                "connected": True
            }
    finally:
        connection.close()


# =========================================
# MANUAL PREDICTION HISTORY
# =========================================

def save_manual_prediction(data, prediction, plant_id=1, model_name="Random Forest (legacy)"):
    """Save a manual prediction with the plant and model that produced it."""
    plant_id = int(plant_id)
    if plant_id not in (1, 2):
        raise ValueError("plant_id must be 1 or 2.")

    model_name = str(model_name).strip()
    if not model_name:
        raise ValueError("model_name is required.")

    # Fail clearly if the one-time SQL migration has not been applied.
    required_columns = {"plant_id", "model_name"}
    existing_columns = get_table_columns("prediction_history")
    missing_columns = required_columns - existing_columns
    if missing_columns:
        raise RuntimeError(
            "prediction_history is missing columns: "
            + ", ".join(sorted(missing_columns))
            + ". Run migration_add_plant_metadata.sql in Supabase first."
        )

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO prediction_history (
                    plant_id,
                    model_name,
                    source_key,
                    ambient_temperature,
                    module_temperature,
                    irradiation,
                    hour,
                    day,
                    month,
                    weekday,
                    is_weekend,
                    predicted_ac_power
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (
                    plant_id,
                    model_name,
                    int(data["SOURCE_KEY_x"]),
                    float(data["AMBIENT_TEMPERATURE"]),
                    float(data["MODULE_TEMPERATURE"]),
                    float(data["IRRADIATION"]),
                    int(data["HOUR"]),
                    int(data["DAY"]),
                    int(data["MONTH"]),
                    int(data["WEEKDAY"]),
                    int(data["IS_WEEKEND"]),
                    float(prediction)
                )
            )
            prediction_id = cursor.fetchone()[0]
        connection.commit()
        return prediction_id
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_manual_prediction_history(limit=100):
    limit = max(1, min(int(limit), 500))
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    created_at,
                    plant_id,
                    model_name,
                    source_key,
                    ambient_temperature,
                    module_temperature,
                    irradiation,
                    hour,
                    day,
                    month,
                    weekday,
                    is_weekend,
                    predicted_ac_power
                FROM prediction_history
                ORDER BY created_at DESC
                LIMIT %s;
                """,
                (limit,)
            )
            rows = cursor.fetchall()
            return [
                {
                    "id": row[0],
                    "created_at": row[1].isoformat() if row[1] else None,
                    "plant_id": row[2],
                    "plant_name": f"Plant {row[2]}",
                    "model_name": row[3],
                    "source_key": row[4],
                    "ambient_temperature": row[5],
                    "module_temperature": row[6],
                    "irradiation": row[7],
                    "hour": row[8],
                    "day": row[9],
                    "month": row[10],
                    "weekday": row[11],
                    "is_weekend": row[12],
                    "predicted_ac_power": row[13]
                }
                for row in rows
            ]
    finally:
        connection.close()


# =========================================
# ANALYSIS SESSIONS
# =========================================

def create_analysis_session(config):
    """Create an analysis session using the exact Supabase CHECK values."""
    now = datetime.now(timezone.utc)

    interval_minutes = int(
        config.get("interval_minutes", config.get("interval", 5))
    )
    allowed_intervals = (1, 5, 10, 15, 30, 60)
    if interval_minutes not in allowed_intervals:
        raise ValueError(
            "Collection interval must be one of: 1, 5, 10, 15, 30, or 60 minutes."
        )

    location_name = config.get(
        "location_name",
        config.get("location")
    )

    analysis_mode = str(config.get("analysis_mode", "comparison")).strip().lower()
    if analysis_mode not in ("comparison", "single"):
        raise ValueError("Analysis mode must be comparison or single.")
    selected_plant_id = config.get("selected_plant_id")
    if analysis_mode == "single":
        if selected_plant_id not in (1, 2, "1", "2"):
            raise ValueError("Select Plant 1 or Plant 2 for single-plant mode.")
        selected_plant_id = int(selected_plant_id)
    else:
        selected_plant_id = None

    # Supabase constraint: module_temperature_mode = 'auto' or 'manual'.
    module_mode = config.get("module_temperature_mode", "estimated")
    if module_mode == "estimated":
        module_mode = "auto"
    if module_mode not in ("auto", "manual"):
        raise ValueError("Module temperature mode must be auto or manual.")

    module_value = config.get("module_temperature_value")
    if module_mode == "manual":
        if module_value in (None, ""):
            raise ValueError(
                "Manual module temperature is required in manual mode."
            )
        module_value = float(module_value)
    else:
        # CHECK constraint requires NULL when mode is auto.
        module_value = None

    # Supabase constraint: source_key_mode = 'default' or 'manual'.
    # The UI calls the default selection 'fixed'; map it to 'default'.
    requested_source_mode = config.get("source_key_mode", "fixed")
    if requested_source_mode in ("fixed", "auto", "default"):
        source_mode = "default"
        manual_source_key = None
    elif requested_source_mode == "manual":
        source_mode = "manual"
        raw_source_key = config.get("source_key_value")
        if raw_source_key in (None, ""):
            raise ValueError("Manual source key is required in manual mode.")
        manual_source_key = int(raw_source_key)
    else:
        raise ValueError("Source key mode must be default or manual.")

    values = {
        "location_name": location_name,
        "analysis_mode": analysis_mode,
        "selected_plant_id": selected_plant_id,
        "latitude": float(config["latitude"]),
        "longitude": float(config["longitude"]),
        "timezone": config.get("timezone"),
        "interval_minutes": interval_minutes,
        "max_readings": config.get("max_readings"),
        "status": "active",
        "module_temperature_mode": module_mode,
        "manual_module_temperature": module_value,
        "source_key_mode": source_mode,
        "manual_source_key": manual_source_key,
        "started_at": now,
        "stopped_at": None,
        "last_activity_at": now,
    }

    required_columns = {"analysis_mode", "selected_plant_id"}
    available_columns = get_table_columns("analysis_sessions")
    if not required_columns.issubset(available_columns):
        raise RuntimeError(
            "Analysis comparison database migration is missing. "
            "Run migration_analysis_dual_plant.sql in Supabase first."
        )

    return insert_dynamic_record("analysis_sessions", values)


def get_analysis_session(session_id):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM analysis_sessions WHERE id = %s",
                (str(session_id),)
            )
            row = cursor.fetchone()
            if row is None:
                return None
            column_names = [description.name for description in cursor.description]
            return dict(zip(column_names, row))
    finally:
        connection.close()


def get_analysis_sessions(limit=50):
    limit = max(1, min(int(limit), 200))
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM analysis_sessions ORDER BY started_at DESC LIMIT %s",
                (limit,)
            )
            column_names = [description.name for description in cursor.description]
            return [dict(zip(column_names, row)) for row in cursor.fetchall()]
    finally:
        connection.close()


def update_session_activity(session_id):
    columns = get_table_columns("analysis_sessions")
    if "last_activity_at" not in columns:
        return

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE analysis_sessions SET last_activity_at = NOW() WHERE id = %s",
                (str(session_id),)
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def finish_analysis_session(session_id, status="stopped"):
    allowed_statuses = ("active", "stopped", "completed", "interrupted")
    if status not in allowed_statuses:
        raise ValueError("Invalid analysis session status.")

    columns = get_table_columns("analysis_sessions")
    updates = {}
    if "status" in columns:
        updates["status"] = status

    now = datetime.now(timezone.utc)
    if "stopped_at" in columns:
        updates["stopped_at"] = now
    if "last_activity_at" in columns:
        updates["last_activity_at"] = now

    if not updates:
        raise RuntimeError("No session update columns found.")

    assignments = [
        sql.SQL("{} = %s").format(sql.Identifier(column))
        for column in updates
    ]
    query = sql.SQL("UPDATE analysis_sessions SET {} WHERE id = %s").format(
        sql.SQL(", ").join(assignments)
    )

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, list(updates.values()) + [str(session_id)])
            if cursor.rowcount == 0:
                raise ValueError("Analysis session not found.")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


# =========================================
# ANALYSIS READINGS
# =========================================

def save_analysis_reading(session_id, reading):
    """Save one shared weather observation with one or both plant predictions."""
    now = datetime.now(timezone.utc)
    values = {
        "session_id": str(session_id),
        "fetched_at": reading.get("fetched_at", now),
        "weather_time_local": reading.get("weather_time_local"),
        "source_key": reading.get("source_key", reading.get("SOURCE_KEY_x")),
        "ambient_temperature": reading.get("ambient_temperature", reading.get("AMBIENT_TEMPERATURE")),
        "module_temperature": reading.get("module_temperature", reading.get("MODULE_TEMPERATURE")),
        "shortwave_radiation_wm2": reading.get("shortwave_radiation_wm2"),
        "irradiation": reading.get("irradiation", reading.get("IRRADIATION")),
        "hour": reading.get("hour", reading.get("HOUR")),
        "day": reading.get("day", reading.get("DAY")),
        "month": reading.get("month", reading.get("MONTH")),
        "weekday": reading.get("weekday", reading.get("WEEKDAY")),
        "is_weekend": reading.get("is_weekend", reading.get("IS_WEEKEND")),
        # Legacy field remains populated for older reports/API consumers.
        "predicted_ac_power": reading.get("predicted_ac_power"),
        "plant_1_predicted_ac_power": reading.get("plant_1_predicted_ac_power"),
        "plant_2_predicted_ac_power": reading.get("plant_2_predicted_ac_power"),
        "plant_1_model_name": reading.get("plant_1_model_name"),
        "plant_2_model_name": reading.get("plant_2_model_name"),
    }

    required = [
        "session_id", "weather_time_local", "source_key",
        "ambient_temperature", "module_temperature",
        "shortwave_radiation_wm2", "irradiation", "hour",
        "day", "month", "weekday", "is_weekend",
    ]
    missing = [key for key in required if values.get(key) is None]
    if missing:
        raise ValueError("Missing analysis reading fields: " + ", ".join(missing))

    has_plant_prediction = (
        values["plant_1_predicted_ac_power"] is not None
        or values["plant_2_predicted_ac_power"] is not None
    )
    if not has_plant_prediction and values["predicted_ac_power"] is None:
        raise ValueError("At least one plant prediction is required.")

    required_comparison_columns = {
        "plant_1_predicted_ac_power",
        "plant_2_predicted_ac_power",
        "plant_1_model_name",
        "plant_2_model_name",
    }
    available_columns = get_table_columns("analysis_readings")
    if not required_comparison_columns.issubset(available_columns):
        raise RuntimeError(
            "Analysis comparison reading columns are missing. "
            "Run migration_analysis_dual_plant.sql in Supabase first."
        )

    reading_id = insert_dynamic_record("analysis_readings", values)
    update_session_activity(session_id)
    return reading_id


def get_analysis_readings(session_id):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT *
                FROM analysis_readings
                WHERE session_id = %s
                ORDER BY fetched_at ASC
                """,
                (str(session_id),)
            )
            column_names = [description.name for description in cursor.description]
            return [dict(zip(column_names, row)) for row in cursor.fetchall()]
    finally:
        connection.close()
