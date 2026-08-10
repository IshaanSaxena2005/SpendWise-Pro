from flask import Flask, request, jsonify
from model import train_and_predict
from anomaly import detect_anomaly
from classifier import predict_category, load_classifier

app = Flask(__name__)


@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})


@app.route('/forecast', methods=['POST'])
def forecast():
    try:
        # Parse the incoming JSON payload
        data = request.get_json()
        
        # Validate that 'history' is provided
        if not data or 'history' not in data:
            return jsonify({'error': 'Missing "history" field in JSON body'}), 400
            
        history = data['history']
        
        # Validate that 'history' is a list of numbers
        if not isinstance(history, list) or not all(isinstance(x, (int, float)) for x in history):
            return jsonify({'error': '"history" must be a list of numbers'}), 400
            
        if len(history) == 0:
             return jsonify({'error': '"history" cannot be empty'}), 400
            
        # Use the machine learning model to get prediction, trend, and evaluation metrics
        predicted_spending, trend_direction, mae, rmse, r2_score = train_and_predict(history)
        import math

        if r2_score is not None:
            if isinstance(r2_score, float) and (math.isnan(r2_score) or math.isinf(r2_score)):
                r2_score = None
                
        # Return the response including the new evaluation metrics
        return jsonify({
            'predicted_spending': round(predicted_spending, 2), # Round to 2 decimal places for currency
            'trend_direction': trend_direction,
            'mae': round(mae, 2) if mae is not None else None,
            'rmse': round(rmse, 2) if rmse is not None else None,
            'r2_score': round(r2_score, 2) if r2_score is not None else None
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/anomaly', methods=['POST'])
def anomaly():
    try:
        data = request.get_json()
        # Validate required fields
        if not data or 'history' not in data or 'current_expense' not in data:
            return jsonify({'error': 'Missing "history" or "current_expense" fields'}), 400
        history = data['history']
        current_expense = data['current_expense']
        # Validate history list
        if not isinstance(history, list) or len(history) == 0 or not all(isinstance(x, (int, float)) for x in history):
            return jsonify({'error': '"history" must be a non‑empty list of numbers'}), 400
        # Validate current_expense numeric
        if not isinstance(current_expense, (int, float)):
            return jsonify({'error': '"current_expense" must be a number'}), 400
        # Run Isolation Forest detection
        result = detect_anomaly(history, current_expense)
        return jsonify({
            'is_anomaly': result['is_anomaly'],
            'anomaly_score': round(result['anomaly_score'], 4) if result['anomaly_score'] is not None else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/categorize', methods=['POST'])
def categorize():
    try:
        data = request.get_json(silent=True)
        if not data or 'description' not in data:
            return jsonify({'error': 'Missing "description" field in JSON body'}), 400
        description = data.get('description')
        if not isinstance(description, str):
            return jsonify({'error': '"description" must be a string'}), 400

        result = predict_category(description)
        return jsonify({
            'category': result.get('category'),
            'confidence': float(result.get('confidence') or 0.0),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Warm-load the classifier artifacts (blocks server start until ready)
    try:
        load_classifier()
    except Exception as e:
        print('[warn] Failed to preload classifier:', e)
    # Run the Flask app on port 5001
    app.run(host='0.0.0.0', port=5001, debug=True)
