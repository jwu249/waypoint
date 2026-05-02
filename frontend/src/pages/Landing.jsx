import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import CategoryIcon from '../components/CategoryIcon';

const HERO_PINS = [
  { x: 22, y: 70, label: 1 },
  { x: 48, y: 52, label: 2 },
  { x: 72, y: 40, label: 3 },
  { x: 30, y: 30, label: 4 },
  { x: 60, y: 70, label: 5 },
];

export default function Landing() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.landing-reveal'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
    );

    nodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, []);

  return (
    <div key={location.key} className="landing-page">
      <header className="landing-topbar landing-reveal landing-reveal-quick is-visible">
        <button
          className="brand brand-button"
          onClick={() => navigate('/', { state: { replay: Date.now() } })}
        >
          <BrandMark size={24} />
          <span>Waypoint</span>
        </button>
        <div className="landing-topbar-actions">
          <Link to="/auth?mode=signin" className="shell-btn shell-btn-ghost shell-btn-sm">
            Log in
          </Link>
          <Link to="/auth?mode=signup" className="shell-btn shell-btn-sm">
            Get started
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-inner landing-reveal landing-reveal-up is-visible">
          <p className="sidebar-label">INFO 490 · AI travel planner</p>
          <h1 className="landing-title">
            Plan your trip,
            <br />
            faster.
          </h1>
          <p className="landing-subtitle">
            Paste your notes, emails, or rough plans. Waypoint turns unstructured travel ideas into
            a structured day-by-day itinerary on a real map.
          </p>
          <div className="landing-hero-actions">
            <Link to="/auth?mode=signup" className="shell-btn landing-cta">
              Start planning — it&apos;s free
            </Link>
          </div>
          <div className="landing-note">No credit card · Sign in with Google or email</div>
        </div>

        <div className="landing-preview landing-reveal landing-reveal-up landing-reveal-delay-2 is-visible">
          <div className="landing-preview-write">
            <div className="sidebar-label">You write</div>
            <div className="landing-preview-copy">
              3 days in Kyoto mid-April.
              <br />
              day 1 — fushimi inari early, ramen lunch, gion walk.
              <br />
              day 2 — arashiyama bamboo, evening kaiseki near pontocho.
              <br />
              day 3 — kinkaku-ji, nishiki market, train to osaka 6pm.
            </div>
          </div>
          <div className="landing-preview-map">
            <div className="sidebar-label landing-preview-label">Waypoint builds</div>
            <div className="landing-preview-surface">
              <div className="landing-preview-grid" />
              {HERO_PINS.map((pin) => (
                <div
                  key={pin.label}
                  className="landing-preview-pin"
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                >
                  {pin.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-soft landing-reveal landing-reveal-up">
        <div className="landing-section-head">
          <div className="sidebar-label">How it works</div>
          <h2 className="landing-section-title">From paragraph to plan.</h2>
        </div>
        <div className="landing-steps landing-stagger-group">
          {[
            ['01', 'Write anything', 'Paste an email, brain dump, or bullet list. No specific format required.'],
            ['02', 'AI structures it', 'GPT extracts each stop, finds it on the map, and groups by day.'],
            ['03', 'Edit visually', 'Reorder, rename, or re-prompt any stop. Your map updates instantly.'],
          ].map(([n, t, d]) => (
            <article key={n} className="landing-card landing-card-animated landing-stagger-item">
              <div className="landing-step-no">{n}</div>
              <div className="landing-card-title">{t}</div>
              <p className="landing-card-copy">{d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section-features landing-reveal landing-reveal-up">
        <div className="landing-section-head">
          <div className="sidebar-label">What&apos;s inside</div>
          <h2 className="landing-section-title">Built for real trip planning.</h2>
        </div>
        <div className="landing-feature-grid landing-stagger-group">
          {[
            ['temple', 'Smart parsing', 'Any format works — even messy notes from your phone.'],
            ['walk', 'Interactive map', 'Real OpenStreetMap pins, day-colored routes, drag-to-reorder.'],
            ['food', 'Re-prompt any stop', 'Tell GPT "make this a vegetarian dinner" and it swaps the place.'],
            ['market', 'Trip library', 'Keep future trips organized, share with friends, revisit past trips anytime.'],
          ].map(([k, t, d]) => (
            <article key={t} className="landing-card landing-feature-card landing-card-animated landing-stagger-item">
              <div className="landing-icon-tile">
                <CategoryIcon kind={k} size={20} color="var(--mother-earth)" />
              </div>
              <div>
                <div className="landing-feature-title">{t}</div>
                <p className="landing-card-copy">{d}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final-cta landing-reveal landing-reveal-up">
        <h2 className="landing-section-title">Your next trip starts here.</h2>
        <p className="landing-subtitle landing-final-copy">
          Free to try. No credit card. Build your first itinerary in under a minute.
        </p>
        <Link to="/auth?mode=signup" className="shell-btn landing-cta">
          Get started
        </Link>
      </section>

      <footer className="landing-footer">
        <div className="brand landing-footer-brand">
          <BrandMark size={14} />
          <span>Waypoint</span>
        </div>
        <span>· INFO 490 student project · 2026</span>
      </footer>
    </div>
  );
}
