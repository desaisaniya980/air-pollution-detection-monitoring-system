import os
import sys
import joblib
import numpy as np


def usage():
    print("Usage: python predict.py <air_quality> <temperature> <humidity>")


def main():
    if len(sys.argv) != 4:
        usage()
        sys.exit(1)

    air_quality = float(sys.argv[1])
    temperature = float(sys.argv[2])
    humidity = float(sys.argv[3])

    if not os.path.exists("model.pkl"):
        print("model.pkl not found. Please run train_model.py first.")
        sys.exit(1)
    if not os.path.exists("labels.pkl"):
        print("labels.pkl not found. Please create labels.pkl when training the model.")
        sys.exit(1)

    try:
        model = joblib.load("model.pkl")
    except Exception as e:
        print(f"Failed to load model.pkl: {e}")
        sys.exit(1)

    try:
        le = joblib.load("labels.pkl")
    except Exception as e:
        print(f"Failed to load labels.pkl: {e}")
        le = None

    X = np.asarray([[air_quality, temperature, humidity]], dtype=np.float64)

    raw_pred = model.predict(X)[0]

    pred_label = None
    try:
        pred_int = int(raw_pred)
    except Exception:
        pred_int = None

    if le is not None and pred_int is not None:
        try:
            pred_label = le.inverse_transform([pred_int])[0]
        except Exception:
            pred_label = str(raw_pred)
    else:
        pred_label = str(raw_pred)

    print(pred_label)


if __name__ == "__main__":
    main()

