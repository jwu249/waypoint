import os
import json
from concurrent.futures import ThreadPoolExecutor
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import requests as http_requests

load_dotenv()

app = Flask(__name__)
CORS(app, origins=[
    'http://localhost:5173',
    'https://*.vercel.app',
])

GROQ_MODEL_ID = 'meta-llama/llama-4-scout-17b-16e-instruct'


def geocode_destination(destination):
    """Get the center coordinates for a destination city (used as bias for stop geocoding)."""
    if not destination:
        return None, None
    try:
        resp = http_requests.get(
            'https://photon.komoot.io/api/',
            params={'q': destination, 'limit': 1},
            headers={'User-Agent': 'Waypoint/1.0 (travel itinerary app)'},
            timeout=6,
        )
        features = resp.json().get('features', [])
        if features:
            coords = features[0]['geometry']['coordinates']
            return float(coords[1]), float(coords[0])
    except Exception:
        pass
    return None, None


def geocode_stop(name, address, destination, bias_lat=None, bias_lng=None):
    """Geocode a stop using Photon with location bias to anchor results near the destination."""
    # Always include destination in query for textual context, even if address is present
    parts = [p for p in [name, address, destination] if p]
    query = ', '.join(parts)

    params = {'q': query, 'limit': 1}

    if bias_lat is not None and bias_lng is not None:
        params['lat'] = bias_lat
        params['lon'] = bias_lng
        # Bounding box ±1.5° (~165 km) — tight enough to exclude other continents,
        # large enough to cover city day trips (e.g. ferry to Bainbridge Island)
        params['bbox'] = (
            f"{bias_lng - 1.5},{bias_lat - 1.5},{bias_lng + 1.5},{bias_lat + 1.5}"
        )

    try:
        resp = http_requests.get(
            'https://photon.komoot.io/api/',
            params=params,
            headers={'User-Agent': 'Waypoint/1.0 (travel itinerary app)'},
            timeout=6,
        )
        features = resp.json().get('features', [])
        if features:
            coords = features[0]['geometry']['coordinates']  # GeoJSON: [lng, lat]
            return float(coords[1]), float(coords[0])
    except Exception:
        pass
    return None, None


def geocode_stops(stops, destination):
    """Geocode the destination once, then geocode all stops in parallel with location bias."""
    bias_lat, bias_lng = geocode_destination(destination)

    def _geocode(item):
        i, stop = item
        lat, lng = geocode_stop(
            stop.get('name', ''),
            stop.get('address', ''),
            destination,
            bias_lat=bias_lat,
            bias_lng=bias_lng,
        )
        return i, lat, lng

    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(_geocode, enumerate(stops)))

    for i, lat, lng in results:
        stops[i]['lat'] = lat
        stops[i]['lng'] = lng

    return stops


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
    raw_text    = data.get('text', '').strip()
    trip_name   = data.get('name', 'My Trip')
    destination = data.get('destination', '')

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
        '"name" (string, required — short descriptive name of the place), '
        '"address" (string, most specific address or neighborhood mentioned — include city/country), '
        '"day" (integer, 1-indexed, infer from context or set to 1), '
        '"notes" (string, relevant details like hours, tips, why it was mentioned), '
        '"category" (one of: restaurant, attraction, hotel, activity, transport, other), '
        '"stop_time" (string, 24h format like "08:30" if time of day is mentioned or strongly implied, else null), '
        '"duration_minutes" (integer, estimated duration in minutes if mentioned or implied, else null). '
        'Do NOT include lat or lng — coordinates will be looked up separately. '
        'Order stops chronologically within each day. Return only valid JSON.'
    )

    response = client.chat.completions.create(
        model=GROQ_MODEL_ID,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': f'Trip name: {trip_name}\nDestination: {destination}\n\nNotes:\n{raw_text}'},
        ],
        response_format={'type': 'json_object'},
        temperature=0.2,
        max_tokens=2048,
    )

    result = json.loads(response.choices[0].message.content)
    stops  = result.get('stops', [])

    # Geocode every stop using Photon (real OSM coordinates)
    stops = geocode_stops(stops, destination or trip_name)

    return jsonify({'stops': stops, 'warning': result.get('warning')})


@app.route('/api/suggest', methods=['POST'])
def suggest_stops():
    """Generate itinerary suggestions from a natural language prompt."""
    data = request.get_json() or {}
    prompt = data.get('prompt', '').strip()
    trip_name = data.get('tripName', '')
    destination = data.get('destination', '')
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
        'Each stop has: "name", "address" (include city/country for geocoding), '
        '"day" (integer), "notes", "category", '
        '"stop_time" (string 24h like "09:00" or null), '
        '"duration_minutes" (integer or null). '
        'Do NOT include lat or lng. Return only valid JSON.'
    )

    response = client.chat.completions.create(
        model=GROQ_MODEL_ID,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': (
                f'Trip: {trip_name}\n'
                f'Destination: {destination}\n'
                f'Current stops: {current}\n'
                f'User request: {prompt}'
            )},
        ],
        response_format={'type': 'json_object'},
        temperature=0.4,
        max_tokens=1024,
    )

    result  = json.loads(response.choices[0].message.content)
    stops   = result.get('stops', [])
    stops   = geocode_stops(stops, destination or trip_name)
    return jsonify({'stops': stops})


@app.route('/api/explore', methods=['POST'])
def explore_places():
    """Return suggested places near a trip destination."""
    data = request.get_json() or {}
    destination = data.get('destination', '').strip()
    interests = data.get('interests', [])
    category = data.get('category', '')
    current_stops = data.get('stops', [])

    if not destination:
        return jsonify({'places': [], 'warning': 'No destination provided'})

    try:
        client = get_groq_client()
    except RuntimeError as e:
        return jsonify({'places': [], 'warning': str(e)})

    current = ', '.join(s['name'] for s in current_stops if s.get('name'))
    filter_hint = f' Focus on: {category}.' if category else ''
    interest_hint = f' User interests: {", ".join(interests)}.' if interests else ''

    system_prompt = (
        'You are a travel recommendation assistant. '
        'Return valid JSON with a "places" array of 6-8 recommended places. '
        'Each place has: '
        '"name" (string), "address" (string, neighborhood/district — include city/country), '
        '"category" (one of: restaurant, attraction, hotel, activity, other), '
        '"description" (1-2 sentences), '
        '"rating" (number 3.5-5.0), "price" (one of: $, $$, $$$), '
        '"hours" (string like "Open 9:00-17:00" or null). '
        'Do NOT include lat or lng. '
        'Return only valid JSON. Avoid places already in the current itinerary.'
    )

    response = client.chat.completions.create(
        model=GROQ_MODEL_ID,
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': (
                f'Destination: {destination}.{filter_hint}{interest_hint}\n'
                f'Already in itinerary: {current}'
            )},
        ],
        response_format={'type': 'json_object'},
        temperature=0.5,
        max_tokens=1200,
    )

    result = json.loads(response.choices[0].message.content)
    places = result.get('places', [])
    places = geocode_stops(places, destination)
    return jsonify({'places': places})


if __name__ == '__main__':
    app.run(debug=True, port=5001)
