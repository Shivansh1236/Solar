from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import os
import pandas as pd

app = Flask(__name__)

CORS(app)

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "random_forest_model.pkl"
)

model = joblib.load(MODEL_PATH)


@app.route("/")
def home():
    return "Solar Prediction Backend is running!"


@app.route("/predict", methods=["POST"])
def predict():

    data = request.get_json()

    features = pd.DataFrame([{
        "SOURCE_KEY_x": data["SOURCE_KEY_x"],
        "AMBIENT_TEMPERATURE": data["AMBIENT_TEMPERATURE"],
        "MODULE_TEMPERATURE": data["MODULE_TEMPERATURE"],
        "IRRADIATION": data["IRRADIATION"],
        "HOUR": data["HOUR"],
        "DAY": data["DAY"],
        "MONTH": data["MONTH"],
        "WEEKDAY": data["WEEKDAY"],
        "IS_WEEKEND": data["IS_WEEKEND"]
    }])

    prediction = model.predict(features)[0]

    return jsonify({
        "predicted_ac_power": float(prediction)
    })


if __name__ == "__main__":
    app.run(
        debug=True
    )