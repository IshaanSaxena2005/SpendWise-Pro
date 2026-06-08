import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split  # Split data into training and testing sets
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def train_and_predict(history):
    """
    Trains a Linear Regression model on the provided spending history,
    evaluates it on a held‑out test set, and predicts next month's spending.

    Returns:
        predicted_spending (float): Forecast for the next month.
        trend_direction (str): 'Increasing', 'Decreasing', or 'Stable' based on the model slope.
        mae (float or None): Mean Absolute Error on the test set.
        rmse (float or None): Root Mean Squared Error on the test set.
        r2_score (float or None): R² score on the test set.
    """
    if not history:
        raise ValueError("History cannot be empty")

    n = len(history)

    # If we only have a single data point we cannot split or compute metrics.
    if n == 1:
        # No model training needed – return the single value as a naive prediction.
        return float(history[0]), "Stable", None, None, None

    # X represents the time steps (months 1, 2, 3, ...)
    X = np.array(range(1, n + 1)).reshape(-1, 1)
    # y represents the historical spending amounts
    y = np.array(history)

    # ------------------------------------------------------------
    # 1️⃣ Split the data: 80% training, 20% testing
    # ------------------------------------------------------------
    # train_test_split shuffles the data by default; we set shuffle=False
    # because the time series order matters for this simple regression.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, shuffle=False
    )

    # ------------------------------------------------------------
    # 2️⃣ Train the Linear Regression model on the training set
    # ------------------------------------------------------------
    model = LinearRegression()
    model.fit(X_train, y_train)

    # ------------------------------------------------------------
    # 3️⃣ Evaluate on the test set
    # ------------------------------------------------------------
    y_pred_test = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred_test)          # Mean Absolute Error
    mse = mean_squared_error(y_test, y_pred_test)          # Mean Squared Error
    rmse = mse ** 0.5                                      # Root Mean Squared Error
    r2 = r2_score(y_test, y_pred_test)                     # R² Score (coefficient of determination)

    # ------------------------------------------------------------
    # 4️⃣ Predict the next month using the trained model
    # ------------------------------------------------------------
    next_month = np.array([[n + 1]])
    predicted = model.predict(next_month)[0]

    # ------------------------------------------------------------
    # 5️⃣ Determine trend direction from the model's slope (coefficient)
    # ------------------------------------------------------------
    slope = model.coef_[0]
    if slope > 0.01:
        trend = "Increasing"
    elif slope < -0.01:
        trend = "Decreasing"
    else:
        trend = "Stable"

    return float(predicted), trend, mae, rmse, r2
