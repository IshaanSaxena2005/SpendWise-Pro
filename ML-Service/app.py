from flask import Flask, request, jsonify
from model import train_and_predict

app = Flask(__name__)

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
            
        # Use the machine learning model to get the prediction and trend
        predicted_spending, trend_direction = train_and_predict(history)
        
        # Return the response in the specified format
        return jsonify({
            'predicted_spending': round(predicted_spending, 2), # Round to 2 decimal places for currency
            'trend_direction': trend_direction
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Run the Flask app on port 5000
    app.run(host='0.0.0.0', port=5001, debug=True)
