import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const nextMode = params.get('mode');
    if (nextMode === 'signup' || nextMode === 'signin') {
      setMode(nextMode);
      setError('');
    }
  }, [params]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split('@')[0] } },
        });

        if (signUpError) throw signUpError;
        if (data.user && !data.session) {
          setMessage('Check your email to confirm your account.');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (authError) {
      setError(authError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-grid">
        <section className="auth-showcase">
          <div className="brand">
            <BrandMark size={26} />
            <span>Waypoint</span>
          </div>

          <div className="auth-showcase-copy">
            <p className="sidebar-label">Travel itinerary studio</p>
            <h1 className="auth-title">Plan rough notes into a route you can actually use.</h1>
            <p className="auth-subtitle">
              Capture scattered plans, shape them into an itinerary, and share the trip with collaborators.
            </p>
          </div>

          <div className="auth-feature-list">
            <div className="auth-feature-card">
              <span className="auth-feature-label">01</span>
              <p>Paste emails, lists, or travel notes and turn them into structured stops.</p>
            </div>
            <div className="auth-feature-card">
              <span className="auth-feature-label">02</span>
              <p>See day-by-day itineraries and mapped routes in one workspace.</p>
            </div>
            <div className="auth-feature-card">
              <span className="auth-feature-label">03</span>
              <p>Explore nearby places and drop them into the trip without breaking flow.</p>
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="section-head">
            <h2 className="section-title">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="section-copy">
              {mode === 'signin'
                ? 'Sign in to access your trip library.'
                : 'Start planning and sharing trips with Waypoint.'}
            </p>
          </div>

          {error && <div className="banner banner-error">{error}</div>}
          {message && <div className="banner banner-warning">{message}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label className="form-label">
                Name
                <input
                  className="form-input"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </label>
            )}

            <label className="form-label">
              Email
              <input
                className="form-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus={mode === 'signin'}
              />
            </label>

            <label className="form-label">
              Password
              <input
                className="form-input"
                type="password"
                placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Your password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <button className="shell-btn auth-submit" type="submit" disabled={loading}>
              {loading ? 'Loading…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-toggle">
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button onClick={() => { setMode('signup'); setError(''); }}>
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => { setMode('signin'); setError(''); }}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
