import os
import joblib
import numpy as np
import mysql.connector
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder


STATUS_TO_INT = {
    "GOOD": 0,
    "MODERATE": 1,
    "POOR": 2,
}


def get_db_config():
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", "root"),
        "database": os.getenv("DB_NAME", "air_pollution"),
    }


def fetch_data(conn):
    query = (
        "SELECT air_quality, temperature, humidity, status "
        "FROM sensor_data"
    )
    cur = conn.cursor()
    cur.execute(query)
    rows = cur.fetchall()
    cur.close()
    return rows


def main():
    db_cfg = get_db_config()
    conn = mysql.connector.connect(**db_cfg)
    try:
        rows = fetch_data(conn)
    finally:
        conn.close()

    if not rows:
        raise RuntimeError("No rows found in sensor_data. Cannot train model.")

    X = []
    y_raw = []

    for air_quality, temperature, humidity, status in rows:
        status_str = str(status).strip().upper() if status is not None else ""
        if status_str not in STATUS_TO_INT:
            # Skip unknown statuses instead of failing training.
            continue

        X.append([float(air_quality), float(temperature), float(humidity)])
        y_raw.append(status_str)

    if not X:
        raise RuntimeError("No valid rows with status in {GOOD, MODERATE, POOR} were found.")

    X = np.asarray(X, dtype=np.float64)

    # Encode status with fixed mapping.
    y = np.asarray([STATUS_TO_INT[s] for s in y_raw], dtype=np.int64)

    # Train/test split (80/20)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=300,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"Model accuracy (test set): {acc:.4f}")

    # Save model and label encoder.
    # We still create a LabelEncoder for a robust mapping and saving as labels.pkl.
    le = LabelEncoder()
    le.fit(["GOOD", "MODERATE", "POOR"])

    joblib.dump(model, "model.pkl")
    joblib.dump(le, "labels.pkl")


if __name__ == "__main__":
    main()

