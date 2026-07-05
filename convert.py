import tensorflow as tf
from tensorflow.keras.models import load_model
from tensorflow.keras.metrics import MeanSquaredError

# Suppress oneDNN warnings for cleaner output
import os
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

# Paths to input and output files
h5_model_path = r"D:\Reynolds_number_classification\liq\reynolds_model_liq_classification.h5"
keras_model_path = r"D:\Reynolds_number_classification\liq\reynolds_model_liq_classification.keras"

try:
    # Define custom objects to handle 'mse' metric
    custom_objects = {'mse': MeanSquaredError()}

    # Load the .h5 model with custom objects
    model = load_model(h5_model_path, custom_objects=custom_objects)
    print("Model loaded successfully from .h5 format")

    # Save the model in .keras format
    model.save(keras_model_path)
    print(f"Model saved successfully as {keras_model_path}")

except Exception as e:
    print(f"Error during conversion: {str(e)}")
