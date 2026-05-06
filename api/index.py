import os
import re
import json
from datetime import date
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
REQUEST_HEADERS = {'User-Agent': 'Waypoint/1.0 (travel itinerary app)'}
VALID_STOP_CATEGORIES = {'restaurant', 'attraction', 'hotel', 'activity', 'transport', 'other'}


def parse_iso_date(raw_value):
    if not raw_value or not isinstance(raw_value, str):
        return None
    try:
        return date.fromisoformat(raw_value.strip())
    except ValueError:
        return None


def infer_trip_day_count(start_date, end_date):
    if not start_date or not end_date:
        return None
    if end_date < start_date:
        return None
    return max(1, (end_date - start_date).days + 1)


def normalize_stop(stop, fallback_day=1):
    if not isinstance(stop, dict):
        return None

    raw_name = stop.get('name')
    name = raw_name.strip() if isinstance(raw_name, str) else ''
    name = name or 'Untitled stop'
    raw_day = stop.get('day', fallback_day)
    try:
        day = int(raw_day)
    except (TypeError, ValueError):
        day = fallback_day
    day = max(1, day)

    raw_category = stop.get('category')
    category = raw_category.strip().lower() if isinstance(raw_category, str) else 'other'
    if category not in VALID_STOP_CATEGORIES:
        category = 'other'

    stop_time = stop.get('stop_time')
    stop_time = str(stop_time).strip() if isinstance(stop_time, str) and stop_time.strip() else None

    duration_minutes = stop.get('duration_minutes')
    if duration_minutes in ('', None):
        duration_minutes = None
    else:
        try:
            duration_minutes = int(duration_minutes)
            if duration_minutes <= 0:
                duration_minutes = None
        except (TypeError, ValueError):
            duration_minutes = None

    address = stop.get('address')
    address = str(address).strip() if isinstance(address, str) and address.strip() else None
    notes = stop.get('notes')
    notes = str(notes).strip() if isinstance(notes, str) and notes.strip() else ''

    return {
        'name': name,
        'address': address,
        'day': day,
        'notes': notes,
        'category': category,
        'stop_time': stop_time,
        'duration_minutes': duration_minutes,
    }


def normalize_and_clamp_stops(stops, trip_day_count=None):
    normalized = []
    for stop in stops:
        item = normalize_stop(stop, fallback_day=1)
        if not item:
            continue
        if trip_day_count is not None:
            item['day'] = min(max(1, item['day']), trip_day_count)
        normalized.append(item)
    return normalized


def geocode_destination(destination):
    """Get the center coordinates for a destination city (used as bias for stop geocoding)."""
    if not destination:
        return None, None
    try:
        resp = http_requests.get(
            'https://photon.komoot.io/api/',
            params={'q': destination, 'limit': 1, 'lang': 'en'},
            headers=REQUEST_HEADERS,
            timeout=6,
        )
        features = resp.json().get('features', [])
        if features:
            coords = features[0]['geometry']['coordinates']
            return float(coords[1]), float(coords[0])
    except Exception:
        pass
    return None, None


def search_destinations(query):
    """Search destination suggestions using Photon."""
    if not query:
        return []

    try:
        resp = http_requests.get(
            'https://photon.komoot.io/api/',
            params={'q': query, 'limit': 5, 'lang': 'en'},
            headers=REQUEST_HEADERS,
            timeout=6,
        )
        features = resp.json().get('features', [])
        suggestions = []

        for feature in features:
            props = feature.get('properties', {})
            locality = (
                props.get('city')
                or props.get('name')
                or props.get('county')
                or props.get('state')
            )
            country = props.get('country')
            parts = [
                locality,
                country,
            ]
            label = ', '.join(dict.fromkeys(part for part in parts if part))
            if not label:
                continue

            suggestions.append({
                'label': label,
                'name': locality,
                'city': props.get('city') or props.get('name'),
                'country': country,
            })

        unique = []
        seen = set()
        for item in suggestions:
            key = item['label'].lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(item)

        return unique
    except Exception:
        return []


def category_from_props(props):
    osm_value = (props.get('osm_value') or '').lower()
    osm_key = (props.get('osm_key') or '').lower()

    if osm_value in {'restaurant', 'cafe', 'bar', 'fast_food', 'bakery', 'pub'}:
        return 'restaurant'
    if osm_value in {'hotel', 'hostel', 'guest_house'}:
        return 'hotel'
    if osm_value in {'bus_stop', 'station', 'tram_stop', 'ferry_terminal'}:
        return 'transport'
    if osm_value in {'museum', 'gallery', 'cinema', 'park', 'viewpoint'}:
        return 'activity'
    if osm_key in {'tourism', 'historic', 'leisure', 'amenity', 'shop', 'building'}:
        return 'attraction'
    return 'other'


def compose_feature_address(props):
    street = props.get('street')
    house_number = props.get('housenumber')
    locality = props.get('city') or props.get('district') or props.get('county') or props.get('state')
    country = props.get('country')
    address_parts = [
        ' '.join(part for part in [house_number, street] if part).strip() or None,
        locality,
        country,
    ]
    return ', '.join(part for part in address_parts if part)


def place_from_feature(feature, fallback_name='', fallback_address=''):
    props = feature.get('properties', {})
    coords = feature.get('geometry', {}).get('coordinates', [None, None])
    address = compose_feature_address(props)
    name = (
        props.get('name')
        or ' '.join(part for part in [props.get('housenumber'), props.get('street')] if part).strip()
        or props.get('street')
        or props.get('district')
        or props.get('city')
        or fallback_name
        or 'Untitled stop'
    )

    category = category_from_props(props)
    rating_hint = 4.7 if category == 'attraction' else 4.5

    return {
        'name': name,
        'address': address or fallback_address or None,
        'category': category,
        'description': props.get('osm_value') or props.get('type') or '',
        'rating': rating_hint,
        'lat': float(coords[1]) if coords[1] is not None else None,
        'lng': float(coords[0]) if coords[0] is not None else None,
    }


def search_places(query, destination):
    """Search place suggestions near a destination using Photon."""
    if not query:
        return []

    bias_lat, bias_lng = geocode_destination(destination)
    params = {'q': ', '.join(part for part in [query, destination] if part), 'limit': 5, 'lang': 'en'}

    if bias_lat is not None and bias_lng is not None:
        params['lat'] = bias_lat
        params['lon'] = bias_lng
        params['bbox'] = (
            f"{bias_lng - 1.5},{bias_lat - 1.5},{bias_lng + 1.5},{bias_lat + 1.5}"
        )

    try:
        resp = http_requests.get(
            'https://photon.komoot.io/api/',
            params=params,
            headers=REQUEST_HEADERS,
            timeout=6,
        )
        features = resp.json().get('features', [])
        places = []

        for feature in features:
            places.append(place_from_feature(feature, fallback_name=query, fallback_address=destination))

        unique = []
        seen = set()
        for place in places:
            key = f"{place['name']}|{place['address']}".lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(place)

        return unique
    except Exception:
        return []


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
            headers=REQUEST_HEADERS,
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


def groq_chat_completion(*, messages, temperature, max_tokens, response_format=None):
    client = get_groq_client()
    kwargs = {
        'model': GROQ_MODEL_ID,
        'messages': messages,
        'temperature': temperature,
        'max_tokens': max_tokens,
    }
    if response_format:
        kwargs['response_format'] = response_format
    response = client.chat.completions.create(**kwargs)
    content = response.choices[0].message.content
    if not content or not content.strip():
        raise RuntimeError('Groq returned empty content.')
    return content


def parse_json_object(content):
    if not isinstance(content, str):
        raise RuntimeError('Model returned non-text content.')
    try:
        result = json.loads(content)
    except (TypeError, ValueError, json.JSONDecodeError):
        raise RuntimeError('Model returned invalid JSON.')
    if not isinstance(result, dict):
        raise RuntimeError('Model returned JSON in an unexpected shape.')
    return result


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/destinations')
def destinations():
    query = request.args.get('q', '').strip()
    return jsonify({'destinations': search_destinations(query)})


@app.route('/api/place-search')
def place_search():
    query = request.args.get('q', '').strip()
    destination = request.args.get('destination', '').strip()
    return jsonify({'places': search_places(query, destination)})


@app.route('/api/parse', methods=['POST'])
def parse_trip():
    """Parse unstructured trip notes into structured stops using Groq / Llama 4."""
    data = request.get_json() or {}
    raw_text    = data.get('text', '').strip()
    trip_name   = data.get('name', 'My Trip')
    destination = data.get('destination', '')
    start_date = parse_iso_date(data.get('start_date'))
    end_date = parse_iso_date(data.get('end_date'))
    interests = data.get('interests', [])
    if not isinstance(interests, list):
        interests = []
    interests = [str(interest).strip() for interest in interests if str(interest).strip()]
    trip_day_count = infer_trip_day_count(start_date, end_date)

    if not raw_text:
        return jsonify({'error': 'No text provided'}), 400

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
        'Use the provided trip window to distribute stops into realistic day numbers when available. '
        'Use user interests to prioritize relevant stop categories and activities. '
        'Do NOT include lat or lng — coordinates will be looked up separately. '
        'Order stops chronologically within each day. Return only valid JSON.'
    )
    interest_hint = ', '.join(interests) if interests else 'none provided'
    trip_window = (
        f'{start_date.isoformat()} to {end_date.isoformat()} ({trip_day_count} days)'
        if trip_day_count is not None
        else 'not provided'
    )

    try:
        content = groq_chat_completion(
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': (
                    f'Trip name: {trip_name}\n'
                    f'Destination: {destination}\n'
                    f'Trip window: {trip_window}\n'
                    f'Interests: {interest_hint}\n\n'
                    f'Notes:\n{raw_text}'
                )},
            ],
            response_format={'type': 'json_object'},
            temperature=0.2,
            max_tokens=2048,
        )
    except RuntimeError as e:
        return jsonify({'stops': [], 'warning': str(e)})

    try:
        result = parse_json_object(content)
    except RuntimeError as e:
        return jsonify({'stops': [], 'warning': str(e)})
    stops = result.get('stops', [])
    if not isinstance(stops, list):
        stops = []
    stops = normalize_and_clamp_stops(stops, trip_day_count=trip_day_count)

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

    try:
        content = groq_chat_completion(
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
    except RuntimeError as e:
        return jsonify({'stops': [], 'warning': str(e)})

    try:
        result = parse_json_object(content)
    except RuntimeError as e:
        return jsonify({'stops': [], 'warning': str(e)})
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

    try:
        content = groq_chat_completion(
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
    except RuntimeError as e:
        return jsonify({'places': [], 'warning': str(e)})

    try:
        result = parse_json_object(content)
    except RuntimeError as e:
        return jsonify({'places': [], 'warning': str(e)})
    places = result.get('places', [])
    places = geocode_stops(places, destination)
    return jsonify({'places': places})


@app.route('/api/chat', methods=['POST'])
def chat_itinerary():
    """Conversational AI copilot for editing an itinerary."""
    data = request.get_json() or {}
    message = data.get('message', '').strip()
    destination = data.get('destination', '').strip()
    stops = data.get('stops', [])
    trip_name = data.get('tripName', '')
    history = data.get('history', [])

    if not message:
        return jsonify({'error': 'No message provided'}), 400

    current = json.dumps([
        {'name': s.get('name', ''), 'day': s.get('day', 1), 'category': s.get('category', 'other'),
         'address': s.get('address', ''), 'stop_time': s.get('stop_time'),
         'notes': s.get('notes', '')}
        for s in stops
    ], indent=1)

    system_prompt = (
        'You are an AI trip planning copilot embedded in an itinerary editor. '
        'The user has an itinerary and is asking you to help modify or improve it. '
        'You can suggest adding, removing, reordering, or editing stops. '
        'When suggesting changes, return valid JSON with an "actions" array. '
        'Each action is one of:\n'
        '  {"type":"add","stop":{"name":"...","address":"...","day":N,"category":"...","notes":"...","stop_time":"HH:MM" or null,"duration_minutes":N or null}}\n'
        '  {"type":"remove","name":"exact stop name to remove"}\n'
        '  {"type":"reorder","day":N,"order":["stop name 1","stop name 2",...]}\n'
        '  {"type":"edit","name":"exact stop name","updates":{"notes":"...","stop_time":"...","day":N}}\n'
        'Also include a "reply" field with a friendly natural language response to the user. '
        'If the user is just asking a question (not requesting changes), return empty actions and just the reply. '
        'Return only valid JSON with "reply" (string) and "actions" (array).'
    )

    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': (
            f'Trip: {trip_name}\nDestination: {destination}\n'
            f'Current itinerary:\n{current}\n\n'
        )},
    ]
    for entry in history[-6:]:
        messages.append({'role': entry.get('role', 'user'), 'content': entry.get('content', '')})
    messages.append({'role': 'user', 'content': message})

    try:
        content = groq_chat_completion(
            messages=messages,
            response_format={'type': 'json_object'},
            temperature=0.3,
            max_tokens=2048,
        )
    except RuntimeError as e:
        return jsonify({'reply': str(e), 'actions': []})

    try:
        result = parse_json_object(content)
    except RuntimeError:
        return jsonify({'reply': content, 'actions': []})

    actions = result.get('actions', [])
    for action in actions:
        if action.get('type') == 'add' and action.get('stop'):
            stop = action['stop']
            lat, lng = geocode_stop(
                stop.get('name', ''), stop.get('address', ''),
                destination, *geocode_destination(destination),
            )
            stop['lat'] = lat
            stop['lng'] = lng

    return jsonify({
        'reply': result.get('reply', ''),
        'actions': actions,
    })


@app.route('/api/optimize', methods=['POST'])
def optimize_itinerary():
    """Optimize stop order by proximity, meal timing, and opening hours."""
    data = request.get_json() or {}
    destination = data.get('destination', '').strip()
    stops = data.get('stops', [])
    trip_name = data.get('tripName', '')
    start_date = data.get('startDate', '')
    end_date = data.get('endDate', '')

    if not stops:
        return jsonify({'stops': [], 'summary': 'No stops to optimize.'})

    current = json.dumps([
        {'name': s.get('name', ''), 'day': s.get('day', 1), 'category': s.get('category', 'other'),
         'address': s.get('address', ''), 'lat': s.get('lat'), 'lng': s.get('lng'),
         'stop_time': s.get('stop_time'), 'duration_minutes': s.get('duration_minutes'),
         'notes': s.get('notes', '')}
        for s in stops
    ], indent=1)

    system_prompt = (
        'You are a trip schedule optimizer. Given a list of stops with coordinates, '
        'reorder them to create the most efficient and enjoyable itinerary. Consider:\n'
        '1. Geographic proximity — minimize travel between consecutive stops each day\n'
        '2. Meal timing — restaurants/cafes near breakfast, lunch, dinner times\n'
        '3. Logical flow — start days with outdoor/morning activities, end with dinner/evening\n'
        '4. Category grouping — keep nearby attractions together\n\n'
        'Return valid JSON with:\n'
        '  "stops": array of ALL the same stops but reordered, each with updated "day", "position" (0-indexed within day), '
        'and "stop_time" (suggested time as "HH:MM" or null). Keep all original fields intact.\n'
        '  "summary": a brief 1-2 sentence explanation of what you changed and why.\n'
        'Do NOT add or remove any stops. Return only valid JSON.'
    )

    try:
        content = groq_chat_completion(
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': (
                    f'Trip: {trip_name}\nDestination: {destination}\n'
                    f'Dates: {start_date} to {end_date}\n\n'
                    f'Stops to optimize:\n{current}'
                )},
            ],
            response_format={'type': 'json_object'},
            temperature=0.2,
            max_tokens=3000,
        )
    except RuntimeError as e:
        return jsonify({'stops': stops, 'summary': f'Optimization unavailable: {e}'})

    try:
        result = parse_json_object(content)
    except RuntimeError as e:
        return jsonify({'stops': stops, 'summary': f'Could not parse result: {e}'})

    optimized = result.get('stops', stops)
    name_to_original = {s.get('name', '').lower(): s for s in stops}
    merged = []
    for opt in optimized:
        original = name_to_original.get(opt.get('name', '').lower(), {})
        merged_stop = {**original, **opt}
        if original.get('lat') is not None:
            merged_stop['lat'] = original['lat']
        if original.get('lng') is not None:
            merged_stop['lng'] = original['lng']
        if original.get('id'):
            merged_stop['id'] = original['id']
        merged.append(merged_stop)

    return jsonify({
        'stops': merged,
        'summary': result.get('summary', 'Itinerary optimized.'),
    })


@app.route('/api/import-url', methods=['POST'])
def import_from_url():
    """Import trip stops from a URL (blog post, article, etc.)."""
    data = request.get_json() or {}
    url = data.get('url', '').strip()
    destination = data.get('destination', '').strip()
    trip_name = data.get('tripName', '')

    if not url:
        return jsonify({'error': 'No URL provided'}), 400

    try:
        resp = http_requests.get(url, headers={
            'User-Agent': 'Waypoint/1.0 (travel itinerary importer)',
        }, timeout=12)
        resp.raise_for_status()
        html = resp.text[:12000]
    except Exception as e:
        return jsonify({'stops': [], 'warning': f'Could not fetch URL: {e}'})

    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = text[:6000]

    system_prompt = (
        'You are a trip planning assistant. Extract all places, stops, and activities '
        'from the following web page content. Return valid JSON with a "stops" array. '
        'Each stop must have: "name", "address" (include city/country), '
        '"day" (integer, infer from context or 1), "notes", '
        '"category" (one of: restaurant, attraction, hotel, activity, transport, other), '
        '"stop_time" (24h format or null), "duration_minutes" (integer or null). '
        'Do NOT include lat or lng. Return only valid JSON.'
    )

    try:
        content = groq_chat_completion(
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': (
                    f'Trip: {trip_name}\nDestination: {destination}\n'
                    f'Source URL: {url}\n\n'
                    f'Page content:\n{text}'
                )},
            ],
            response_format={'type': 'json_object'},
            temperature=0.2,
            max_tokens=2048,
        )
    except RuntimeError as e:
        return jsonify({'stops': [], 'warning': str(e)})

    try:
        result = parse_json_object(content)
    except RuntimeError as e:
        return jsonify({'stops': [], 'warning': str(e)})

    raw_stops = result.get('stops', [])
    if not isinstance(raw_stops, list):
        raw_stops = []
    stops_out = normalize_and_clamp_stops(raw_stops)
    stops_out = geocode_stops(stops_out, destination or trip_name)

    return jsonify({'stops': stops_out, 'warning': result.get('warning')})


if __name__ == '__main__':
    app.run(debug=True, port=5001, use_reloader=False)
