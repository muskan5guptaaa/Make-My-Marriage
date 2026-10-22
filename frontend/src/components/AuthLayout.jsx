import { Link } from 'react-router-dom';

// The split screen from the Sign in design: dark brand panel on the left, form on the right.
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="brand-panel">
        <svg className="rings" width="320" height="320" viewBox="0 0 320 320" aria-hidden="true">
          <circle cx="160" cy="160" r="150" fill="none" stroke="#B8860B" strokeWidth="1" />
          <circle cx="160" cy="160" r="105" fill="none" stroke="#B8860B" strokeWidth="1" />
          <circle cx="160" cy="160" r="60" fill="none" stroke="#B8860B" strokeWidth="1" />
        </svg>

        <Link to="/" className="logo">
          <span className="logo-mark">M</span>
          <span className="logo-name">Make My Marriage</span>
        </Link>

        <div className="brand-copy">
          <h1>Every function, one place for the whole family.</h1>
          <p>
            Dashboard, guests, budget and photos &mdash; shared with everyone who&rsquo;s helping plan, and with
            everyone who&rsquo;s invited.
          </p>
        </div>

        <div className="brand-foot mono">&copy; 2026 Make My Marriage</div>
      </aside>

      <main className="form-panel">
        <div className="form-box">
          <h2>{title}</h2>
          <p className="subtitle">{subtitle}</p>
          {children}
          {footer}
        </div>
      </main>
    </div>
  );
}
