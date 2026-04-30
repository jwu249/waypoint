import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const EXAMPLE = `Day 1: Arrive in San Francisco. Check into hotel near Union Square.
Dinner at Tartine Manufactory on Alabama St.

Day 2: Morning coffee at Sightglass Coffee. Visit Golden Gate Park and de Young Museum.
Lunch at Zuni Cafe. Walk across the Golden Gate Bridge.
Evening: oysters at Hog Island Oyster Bar at the Ferry Building.

Day 3: Explore Mission District — Dolores Park, murals on Clarion Alley.
Burritos at La Taqueria. Drive to Twin Peaks for city views at sunset.`;

const STEP_LABELS = ['Trip Details', 'Paste Notes', 'Review Stops'];

function StepIndicator({ step }) {
  return (
    <div className="step-indicator">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={n} className="step-item">
            <div className={`step-dot ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
              {done ? '✓' : n}
            </div>
            <span className={`step-label ${active ? 'active' : ''}`}>{label}</span>
            {n < STEP_LABELS.length && <div className={`step-line ${done ? 'done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

function StopRow({ stop, index, onChange, onRemove }) {
  return (
    <div className="stop-row">
      <div className="stop-num">{index + 1}</div>
      <div className="stop-fields">
        <input
          className="form-input"
          placeholder="Stop name *"
          value={stop.name}
          onChange={(e) => onChange('name', e.target.value)}
        />
        <div className="stop-row-2">
          <input
            className="form-input"
            placeholder="Address (optional)"
            value={stop.address ?? ''}
            onChange={(e) => onChange('address', e.target.value)}
          />
          <input
            className="form-input day-input"
            type="number"
            min="1"
            placeholder="Day"
            value={stop.day ?? 1}
            onChange={(e) => onChange('day', parseInt(e.target.value) || 1)}
          />
        </div>
        <input
          className="form-input"
          placeholder="Notes (optional)"
          value={stop.notes ?? ''}
          onChange={(e) => onChange('notes', e.target.value)}
        />
      </div>
      <button className="btn-icon-danger" onClick={onRemove} title="Remove stop">
        ×
      </button>
    </div>
  );
}

export default function TripInput() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('');
  const [rawText, setRawText] = useState('');
  const [stops, setStops] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  async function handleParse() {
    if (!rawText.trim()) {
      setError('Please enter some trip notes to parse.');
      return;
    }
    setParsing(true);
    setError('');
    setWarning('');
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText, name: tripName }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.warning) setWarning(data.warning);
      setStops(data.stops ?? []);
      setStep(3);
    } catch (err) {
      setError(err.message || 'Failed to parse. Make sure the Flask server is running on :5000.');
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!tripName.trim()) {
      setError('Please enter a trip name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          name: tripName.trim(),
          destination: destination.trim() || null,
          raw_input: rawText || null,
          status: 'draft',
        })
        .select()
        .single();

      if (tripErr) throw tripErr;

      if (stops.length > 0) {
        const { error: stopsErr } = await supabase.from('stops').insert(
          stops
            .filter((s) => s.name?.trim())
            .map((s, i) => ({
              trip_id: trip.id,
              name: s.name.trim(),
              address: s.address?.trim() || null,
              day: s.day || 1,
              position: i,
              notes: s.notes?.trim() || null,
              category: s.category || 'other',
              lat: s.lat || null,
              lng: s.lng || null,
            }))
        );
        if (stopsErr) throw stopsErr;
      }

      navigate(`/trip/${trip.id}`);
    } catch (err) {
      setError(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function updateStop(index, field, value) {
    setStops((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function removeStop(index) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  function addStop() {
    setStops((prev) => [
      ...prev,
      { name: '', address: '', day: prev.length > 0 ? prev[prev.length - 1].day : 1, notes: '', category: 'other' },
    ]);
  }

  return (
    <div className="page input-page">
      <div className="input-container">
        <StepIndicator step={step} />

        {error && <div className="error-banner">{error}</div>}
        {warning && <div className="warning-banner">{warning}</div>}

        {/* Step 1 — Trip Details */}
        {step === 1 && (
          <div className="input-card">
            <h2>Name your trip</h2>
            <p className="input-hint">Give it a title so you can find it later.</p>
            <div className="form-group">
              <label>Trip Name *</label>
              <input
                className="form-input"
                placeholder="e.g. SF Weekend, Tokyo Summer, Road Trip 2025"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && tripName.trim() && setStep(2)}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Destination</label>
              <input
                className="form-input"
                placeholder="e.g. San Francisco, CA"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && tripName.trim() && setStep(2)}
              />
            </div>
            <button
              className="btn-primary btn-full"
              onClick={() => tripName.trim() && setStep(2)}
              disabled={!tripName.trim()}
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2 — Paste Notes */}
        {step === 2 && (
          <div className="input-card">
            <h2>Paste your trip notes</h2>
            <p className="input-hint">
              Drop in anything — emails, group chat summaries, bullet lists. AI will extract the
              stops automatically.
            </p>
            <textarea
              className="notes-textarea"
              placeholder={EXAMPLE}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={14}
              autoFocus
            />
            <div className="input-actions">
              <button className="btn-secondary" onClick={() => setStep(1)}>
                ← Back
              </button>
              <div className="input-actions-right">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setStops([{ name: '', address: '', day: 1, notes: '', category: 'other' }]);
                    setStep(3);
                  }}
                >
                  Add manually
                </button>
                <button
                  className="btn-primary"
                  onClick={handleParse}
                  disabled={parsing || !rawText.trim()}
                >
                  {parsing ? 'Parsing...' : '✨ Parse with AI'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Review Stops */}
        {step === 3 && (
          <div className="input-card">
            <h2>Review your stops</h2>
            <p className="input-hint">
              {stops.length > 0
                ? `AI found ${stops.length} stop${stops.length !== 1 ? 's' : ''}. Edit or remove as needed.`
                : 'Add stops to build your itinerary.'}
            </p>

            <div className="stops-list">
              {stops.map((stop, i) => (
                <StopRow
                  key={i}
                  stop={stop}
                  index={i}
                  onChange={(field, value) => updateStop(i, field, value)}
                  onRemove={() => removeStop(i)}
                />
              ))}
            </div>

            <button className="btn-secondary btn-add-stop" onClick={addStop}>
              + Add Stop
            </button>

            <div className="input-actions">
              <button className="btn-secondary" onClick={() => setStep(2)}>
                ← Back
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !tripName.trim()}
              >
                {saving ? 'Saving...' : 'Save Trip →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
