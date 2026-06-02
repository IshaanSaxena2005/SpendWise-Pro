import numpy as np
from sklearn.linear_model import LinearRegression

def train_and_predict(history):
    """
    Trains a linear regression model on the given history and predicts the next month's spending.
    """
    if not history:
        raise ValueError("History cannot be empty")
        
    n = len(history)
    
    # Handle the case where we only have one data point
    if n == 1:
        return float(history[0]), "Stable"
        
    # X represents the time steps (months 1, 2, 3, etc.)
    X = np.array(range(1, n + 1)).reshape(-1, 1)
    
    # y represents the historical spending amounts
    y = np.array(history)
    
    # Initialize and train the Linear Regression model
    model = LinearRegression()
    model.fit(X, y)
    
    # Predict the spending for the next month
    next_month = np.array([[n + 1]])
    predicted = model.predict(next_month)[0]
    
    # Determine the trend direction based on the slope (coefficient) of the line
    slope = model.coef_[0]
    
    # We use a small threshold to classify as 'Stable' if the change is negligible
    if slope > 0.01:
        trend = "Increasing"
    elif slope < -0.01:
        trend = "Decreasing"
    else:
        trend = "Stable"
        
    return float(predicted), trend
