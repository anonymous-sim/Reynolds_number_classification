from flask import Flask, request, jsonify, render_template
import numpy as np
import tensorflow as tf
import joblib
import os
import traceback
from sklearn.preprocessing import MinMaxScaler

app = Flask(__name__)

# Paths to model and scaler files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GAS_MODEL_PATH = os.path.join(BASE_DIR, 'gas', 'reynolds_model_gas_classification.keras')
LIQ_MODEL_PATH = os.path.join(BASE_DIR, 'liq', 'reynolds_model_liq_classification.keras')
GAS_SCALER_PATH = os.path.join(BASE_DIR, 'gas', 'feature_scaler_gas_classification.pkl')
LIQ_SCALER_PATH = os.path.join(BASE_DIR, 'liq', 'feature_scaler_liq_classification.pkl')

# Initialize dictionaries to store models and scalers
models = {}
scalers = {}

# Load gas model and scaler
try:
    models['gas'] = tf.keras.models.load_model(GAS_MODEL_PATH)
    scalers['gas'] = joblib.load(GAS_SCALER_PATH)
    print("Gas model and scaler loaded successfully")
except Exception as e:
    print(f"Error loading gas model or scaler: {str(e)}")
    models['gas'] = None
    scalers['gas'] = None

# Load liquid model and scaler
try:
    models['liquid'] = tf.keras.models.load_model(LIQ_MODEL_PATH)
    scalers['liquid'] = joblib.load(LIQ_SCALER_PATH)
    print("Liquid model and scaler loaded successfully")
except Exception as e:
    print(f"Error loading liquid model or scaler: {str(e)}")
    models['liquid'] = None
    scalers['liquid'] = None

# Fallback dummy scaler
#def get_dummy_scaler():
#    scaler = MinMaxScaler()
#    scaler.data_min_ = np.array([0.0953, 0.001, 0.0001, 5.8e-06])
#    scaler.data_max_ = np.array([6.9086, 2.3979, 0.0953, 0.693])
#    return scaler

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        density = float(data['density'])
        velocity = float(data['velocity'])
        diameter = float(data['diameter'])
        viscosity = float(data['viscosity'])
        medium = data.get('medium', 'liquid')

        # Validate medium
        if medium not in ['liquid', 'gas']:
            print(f"Invalid medium: {medium}")
            return jsonify({'error': 'Invalid medium specified'}), 400

        # Get model and scaler for the medium
        model = models.get(medium)
        feature_scaler = scalers.get(medium)

        if model is None:
            return jsonify({'error': f'{medium.capitalize()} model not loaded'}), 500
        if feature_scaler is None:
            print(f"{medium.capitalize()} scaler not found, using dummy scaler")
            feature_scaler = get_dummy_scaler()

        # Define ranges for validation
        ranges = {
            'liquid': {
                'density': {'min': 714.8070046892694, 'max': 1050.2098650991347},
                'velocity': {'min': 0, 'max': 8.451995705516785},
                'diameter': {'min': 0, 'max': 0.36748163999068206},
                'viscosity': {'min': 0, 'max': 0.01380828446991151}
            },
            'gas': {
                'density': {'min': 0, 'max': 20.36578206659651},
                'velocity': {'min': 0, 'max': 52.499443580940465},
                'diameter': {'min': 0, 'max': 0.5249885104741552},
                'viscosity': {'min': 6.100923200764568e-07, 'max': 2.8885055939928103e-05}
            }
        }

        # Validate inputs
        if density <= 0 or velocity <= 0 or diameter <= 0 or viscosity <= 0:
            print(f"Invalid input: Non-positive values: density={density}, velocity={velocity}, diameter={diameter}, viscosity={viscosity}")
            return jsonify({'error': 'All input values must be positive'}), 400

        range_vals = ranges[medium]
        if not (range_vals['density']['min'] <= density <= range_vals['density']['max']):
            print(f"Invalid {medium} density: {density}")
            return jsonify({'error': f"Density must be between {range_vals['density']['min']} and {range_vals['density']['max']} for {medium}"}), 400
        if not (range_vals['velocity']['min'] <= velocity <= range_vals['velocity']['max']):
            print(f"Invalid {medium} velocity: {velocity}")
            return jsonify({'error': f"Velocity must be between {range_vals['velocity']['min']} and {range_vals['velocity']['max']} for {medium}"}), 400
        if not (range_vals['diameter']['min'] <= diameter <= range_vals['diameter']['max']):
            print(f"Invalid {medium} diameter: {diameter}")
            return jsonify({'error': f"Diameter must be between {range_vals['diameter']['min']} and {range_vals['diameter']['max']} for {medium}"}), 400
        if not (range_vals['viscosity']['min'] <= viscosity <= range_vals['viscosity']['max']):
            print(f"Invalid {medium} viscosity: {viscosity}")
            return jsonify({'error': f"Viscosity must be between {range_vals['viscosity']['min']} and {range_vals['viscosity']['max']} for {medium}"}), 400

        print(f"Received inputs: density={density}, velocity={velocity}, diameter={diameter}, viscosity={viscosity}, medium={medium}")

        # Prepare input
        input_data = np.array([[density, velocity, diameter, viscosity]])
        input_log = np.log1p(input_data)
        print(f"Log-transformed input: {input_log}")

        # Scale input
        input_scaled = feature_scaler.transform(input_log)
        print(f"Scaled input: {input_scaled}")

        # Predict
        pred_probs = model.predict(input_scaled, verbose=0)[0]
        print(f"Model prediction probabilities: {pred_probs}")
        predicted_idx = np.argmax(pred_probs)
        regimes = ['Laminar', 'Transitional', 'Turbulent']
        predicted_regime = regimes[predicted_idx]

        # Calculate actual Re and regime
        actual_re = float((density * velocity * diameter) / viscosity)
        if actual_re < 2000:
            actual_regime = 'Laminar'
        elif 2000 <= actual_re <= 4000:
            actual_regime = 'Transitional'
        else:
            actual_regime = 'Turbulent'

        print(f"Final result: actual_regime={actual_regime}, predicted_regime={predicted_regime}")

        return jsonify({
            'actual_regime': actual_regime,
            'predicted_regime': predicted_regime,
            'density': density,
            'velocity': velocity,
            'diameter': diameter,
            'viscosity': viscosity,
            'medium': medium
        })
    except KeyError as e:
        print(f"KeyError: Missing parameter: {str(e)}")
        return jsonify({'error': f'Missing parameter: {str(e)}'}), 400
    except ValueError as e:
        print(f"ValueError: Invalid input: {str(e)}")
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        print(f"Prediction error: {str(e)}")
        return jsonify({'error': f'Prediction error: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)