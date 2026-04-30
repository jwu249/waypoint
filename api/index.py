import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, origins=[
    'http://localhost:5173',
    'https://*.vercel.app',
])

GROQ_MODEL_ID = 'meta-llama/llama-4-scout-17b-16e-instruct'


def get_groq_client():
    api_key = os.environ.get('GROQ_API_KEY', '').strip()
    if not api_key:
        raise RuntimeError('GROQ_API_KEY is not configured.')
    from groq import Groq
    return Groq(api_key=api_key)


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/parse', methods=['POST'])
def parse_trip():
    """Parse unstructured trip notes into structured stops using Groq / Llama 4."""
    data = request.get_json() or {}
    raw_text = data.get('text', '').strip()
    trip_name = data.get('name', 'My Trip')

    if not raw_text:
        return jsonify({'error': 'No text provided'}), 400

    try:
        client = get_groq_client()
    except RuntimeError as e:
        return jsonify({'stops': [], 'warning': str(e)})

    system_prompt = (
        'You are a trip planning assistant. Extract all places, stops, and activities '
        'from unstructured trip notes. Return valid JSON with a "stops" array. '
        'Each stop object must have: '
        '"name" (string, required), '
        '"address" (string, full address if mentioned), '
        '"day" (integer, 1-indexed, infer from context or set to 1), '
        '"notes" (string, relevant details like hours, tips, why it was mentioned), '
        '"category" (one of: restaurant, attraction, hotel, activity, transport, other), '
        '"lat" (number, decimal degrees for well-known places, else null), '
        '"lng" (number, decimal degrees for well-known places, else null). '
        'Order stops chronologically within each day. Return only valid JSON.'
    )

    response = client.chat.completions.create(
        model=GROQ_MODEL_ID,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': f'Trip name: {trip_name}\n\nNotes:\n{raw_text}'},
        ],
        response_format={'type': 'json_object'},
        temperature=0.2,
        max_tokens=2048,
    )

    result = json.loads(response.choices[0].message.content)
    return jsonify(result)


@app.route('/api/suggest', methods=['POST'])
def suggest_stops():
    """Generate itinerary suggestions from a natural language prompt."""
    data = request.get_json() or {}
    prompt = data.get('prompt', '').strip()
    trip_name = data.get('tripName', '')
    current_stops = data.get('stops', [])

    if not prompt:
        return jsonify({'error': 'No prompt provided'}), 400

    try:
        client = get_groq_client()
    except RuntimeError as e:
        return jsonify({'stops': [], 'warning': str(e)})

    current = ', '.join(s['name'] for s in current_stops if s.get('name'))
    system_prompt = (
        'You are a trip planning assistant helping edit an itinerary. '
        'Based on the user\'s request, return valid JSON with a "stops" array '
        'of new stops to add. '
        'Each stop has: "name", "address", "day" (integer), "notes", "category", '
        '"lat" (number or null), "lng" (number or null). Return only valid JSON.'
    )

    response = client.chat.completions.create(
        model=GROQ_MODEL_ID,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': (
                f'Trip: {trip_name}\n'
                f'Current stops: {current}\n'
                f'User request: {prompt}'
            )},
        ],
        response_format={'type': 'json_object'},
        temperature=0.4,
        max_tokens=1024,
    )

    result = json.loads(response.choices[0].message.content)
    return jsonify(result)


if __name__ == '__main__':
    app.run(debug=True, port=5001)
