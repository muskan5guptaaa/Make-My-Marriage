import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  DashboardIcon, ExpensesIcon, FunctionsIcon, GalleryIcon, GuestsIcon, TasksIcon,
} from '../../components/icons.jsx';
import { COMPARISON, EVENTS, FAQ, FEATURES, PRIVACY, ROLES, STEPS } from './homeContent.js';
import { Check, Cross, Heart, Lock, Menu } from './homeIcons.jsx';
import useReveal from './useReveal.js';
import './home.css';

const FEATURE_ICONS = { DashboardIcon, ExpensesIcon, FunctionsIcon, GalleryIcon, GuestsIcon, TasksIcon };

// Always the homepage at "/". Signed-in people get "Open my wedding" instead of sign-in buttons.
export default function Home() {
  const { user, logout } = useAuth();
  const signedIn = Boolean(user);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const primaryCta = signedIn ? (
    <Link to="/app" className="hm-btn hm-btn-primary">Open my wedding <span aria-hidden="true">&rarr;</span></Link>
  ) : (
    <Link to="/register" className="hm-btn hm-btn-primary">Create your wedding <span aria-hidden="true">&rarr;</span></Link>
  );

  const navItems = [
    ['#features', 'Features'],
    ['#guests', 'For guests'],
    ['#how', 'How it works'],
    ['#faq', 'Questions'],
  ];

  return (
    <div className="hm" id="top">
      <a className="hm-skip" href="#main">Skip to content</a>

      <header className={`hm-nav${scrolled ? ' scrolled' : ''}`} onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}>
        <div className="hm-wrap hm-nav-in">
          <a href="#top" className="hm-logo" aria-label="Make My Marriage, back to top">
            <span className="hm-logo-mark">M</span>
            <span className="hm-logo-name">Make My Marriage</span>
          </a>
          <nav className="hm-links" aria-label="Main">
            {navItems.map(([href, label]) => (
              <a key={href} href={href} className="hm-link">{label}</a>
            ))}
          </nav>
          <div className="hm-actions">
            {signedIn ? (
              <>
                <button type="button" className="hm-link hm-link-button hide-sm" onClick={logout}>Sign out</button>
                <Link to="/app" className="hm-btn hm-btn-primary hm-btn-sm">Open my wedding</Link>
              </>
            ) : (
              <>
                <Link to="/signin" className="hm-link hide-sm">Sign in</Link>
                <Link to="/register" className="hm-btn hm-btn-primary hm-btn-sm">Get started</Link>
              </>
            )}
            <button
              type="button"
              className="hm-menu-btn"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="hm-mobile-nav"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Menu open={menuOpen} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="hm-mobile-nav" className="hm-mobile-nav" aria-label="Mobile">
            {navItems.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
            {signedIn ? (
              <button type="button" className="hm-link-button" onClick={logout}>Sign out</button>
            ) : (
              <Link to="/signin">Sign in</Link>
            )}
          </nav>
        )}
      </header>

      <main id="main">
        {/* ---------- hero ---------- */}
        <section className="hm-hero">
          <div className="hm-wrap hm-hero-in">
            <span className="hm-badge"><i aria-hidden="true" /> Made for Indian weddings</span>
            <h1 className="hm-h1">
              Plan every function.
              <br />
              Welcome every guest.
              <br />
              <em>Track every rupee.</em>
            </h1>
            <p className="hm-lede">
              One shared workspace for haldi to reception: for the family who help plan, and for guests who only
              need a link.
            </p>
            <div className="hm-cta-row">
              {primaryCta}
              <a href="#how" className="hm-btn hm-btn-outline">See how it works</a>
            </div>
            <ul className="hm-reassure">
              <li><Check /> Guests need no account</li>
              <li><Check /> Family plans with you</li>
              <li><Check /> Every amount in rupees</li>
            </ul>
            {signedIn && <p className="hm-fine">Signed in as {user.name}.</p>}
          </div>

          <div className="hm-wrap hm-reveal">
            <DashboardPreview />
          </div>
          <p className="hm-hero-note"><Heart /> Less coordinating. More celebrating.</p>
        </section>

        {/* ---------- before / after ---------- */}
        <section className="hm-section hm-tint">
          <div className="hm-wrap">
            <SectionHead eyebrow="Sound familiar?" title={<>A wedding shouldn&rsquo;t live in <em>twelve WhatsApp groups.</em></>}>
              The guest list is in one spreadsheet, the budget in another, and the latest plan is in someone&rsquo;s
              chat. Bring it all into one place.
            </SectionHead>
            <div className="hm-compare hm-reveal">
              <article className="hm-compare-card before">
                <span className="hm-compare-label mono">How it usually goes</span>
                <h3>So many details.<br />So many places.</h3>
                <ul>
                  {COMPARISON.before.map((t) => (
                    <li key={t}><Cross /> {t}</li>
                  ))}
                </ul>
              </article>
              <article className="hm-compare-card after">
                <span className="hm-compare-label mono">With Make My Marriage</span>
                <h3>One shared place.<br />A lot more calm.</h3>
                <ul>
                  {COMPARISON.after.map((t) => (
                    <li key={t}><Check /> {t}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ---------- features ---------- */}
        <section id="features" className="hm-section">
          <div className="hm-wrap">
            <SectionHead eyebrow="Everything in one place" title={<>Six tools. <em>One wedding.</em></>}>
              Simple tools for the big decisions and the hundred small ones.
            </SectionHead>
            <div className="hm-features">
              {FEATURES.map(({ icon, label, title, text, sample }) => {
                const Icon = FEATURE_ICONS[icon];
                return (
                  <article key={title} className="hm-feature hm-reveal">
                    <div className="hm-feature-top">
                      <span className="hm-icon"><Icon /></span>
                      <span className="hm-feature-label mono">{label}</span>
                    </div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                    <span className="hm-sample"><i aria-hidden="true" />{sample}</span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- event timeline ---------- */}
        <section className="hm-section hm-tint">
          <div className="hm-wrap">
            <div className="hm-split-head">
              <div>
                <div className="hm-eyebrow mono">More than a single day</div>
                <h2 className="hm-h2">An Indian wedding is <em>never just one event.</em></h2>
              </div>
              <p className="hm-sub">
                Give every function its own date, venue, dress code and guest list, then watch the countdown move from one
                to the next.
              </p>
            </div>
            <ol className="hm-timeline hm-reveal">
              {EVENTS.map((e) => (
                <li key={e.name} className={`hm-event ${e.tone}`}>
                  <span className="hm-event-dot" aria-hidden="true" />
                  <div className="hm-date-tile">
                    <span className="mono">{e.month}</span>
                    <b>{e.day}</b>
                  </div>
                  <h3>{e.name}</h3>
                  <p className="hm-event-lead">{e.lead}</p>
                  <p className="hm-event-meta">{e.time} &middot; {e.venue}</p>
                  <span className="hm-event-dress mono">Dress code &middot; {e.dress}</span>
                </li>
              ))}
            </ol>
            <p className="hm-caption-line mono">Add your own too: Roka, Tilak, Cocktail night, Grihapravesh&hellip;</p>
          </div>
        </section>

        {/* ---------- guest journey ---------- */}
        <section id="guests" className="hm-section">
          <div className="hm-wrap">
            <SectionHead eyebrow="A warm welcome, without the work" title={<>Simple for your <em>guests</em>, too.</>}>
              No app to download and no account to create. Just a private link, the functions they&rsquo;re invited to,
              and a quick &ldquo;yes, we&rsquo;ll be there.&rdquo;
            </SectionHead>
            <div className="hm-phones hm-reveal">
              <PhoneInvite />
              <PhoneDetails />
              <PhoneRsvp />
            </div>
          </div>
        </section>

        {/* ---------- how it works ---------- */}
        <section id="how" className="hm-section hm-tint">
          <div className="hm-wrap">
            <SectionHead eyebrow="How it works" title={<>Ready in <em>an evening.</em></>} />
            <ol className="hm-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="hm-step hm-reveal">
                  <span className="hm-step-n">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- roles ---------- */}
        <section className="hm-section">
          <div className="hm-wrap">
            <div className="hm-split-head">
              <div>
                <div className="hm-eyebrow mono">A family affair</div>
                <h2 className="hm-h2">One shared plan. <em>Many helping hands.</em></h2>
              </div>
              <p className="hm-sub">Your wedding brings everyone together. Planning it should too, with the right access for each person.</p>
            </div>
            <div className="hm-roles">
              {ROLES.map((r) => (
                <article key={r.who} className={`hm-role hm-reveal ${r.tone}`}>
                  <span className="hm-role-tag mono">{r.tag}</span>
                  <h3>{r.who}</h3>
                  <p className="hm-role-people">{r.people}</p>
                  <p>{r.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- privacy ---------- */}
        <section className="hm-section hm-tint">
          <div className="hm-wrap">
            <SectionHead eyebrow="Thoughtfully built" title={<>For your family. <em>For your peace of mind.</em></>} />
            <div className="hm-privacy">
              {PRIVACY.map((p) => (
                <div key={p.title} className="hm-privacy-item hm-reveal">
                  <span className="hm-privacy-icon"><Lock /></span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="hm-section">
          <div className="hm-wrap hm-faq-wrap">
            <div className="hm-faq-head">
              <div className="hm-eyebrow mono">Questions</div>
              <h2 className="hm-h2">Before you <em>start.</em></h2>
              <p className="hm-sub">Something else on your mind? Create your wedding and look around. It takes a minute.</p>
            </div>
            <div className="hm-faq">
              {FAQ.map((f) => (
                <details key={f.q} className="hm-qa">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- closing ---------- */}
        <section className="hm-final">
          <svg className="hm-rings" width="460" height="460" viewBox="0 0 320 320" aria-hidden="true">
            <circle cx="160" cy="160" r="150" fill="none" stroke="#B8860B" strokeWidth="1" />
            <circle cx="160" cy="160" r="105" fill="none" stroke="#B8860B" strokeWidth="1" />
            <circle cx="160" cy="160" r="60" fill="none" stroke="#B8860B" strokeWidth="1" />
          </svg>
          <div className="hm-wrap hm-final-in hm-reveal">
            <span className="hm-final-heart"><Heart size={26} /></span>
            <div className="hm-eyebrow mono gold">Here&rsquo;s to the beginning</div>
            <h2 className="hm-h2">Your wedding already has enough <em>moving parts.</em></h2>
            <p>Bring them together in one organised place, and make a little more room for the joy.</p>
            <div className="hm-cta-row center">
              {signedIn ? (
                <Link to="/app" className="hm-btn hm-btn-gold">Open my wedding <span aria-hidden="true">&rarr;</span></Link>
              ) : (
                <>
                  <Link to="/register" className="hm-btn hm-btn-gold">Create your wedding <span aria-hidden="true">&rarr;</span></Link>
                  <Link to="/signin" className="hm-btn hm-btn-ghost">Sign in</Link>
                </>
              )}
            </div>
            <ul className="hm-final-notes">
              <li><Check /> Made for Indian weddings</li>
              <li><Check /> Better with your family</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="hm-foot">
        <div className="hm-wrap">
          <div className="hm-foot-top">
            <div className="hm-foot-brand">
              <a href="#top" className="hm-logo">
                <span className="hm-logo-mark">M</span>
                <span className="hm-logo-name">Make My Marriage</span>
              </a>
              <p>One wedding. A thousand little details. One place to keep them together.</p>
            </div>
            <div className="hm-foot-col">
              <h4 className="mono">Explore</h4>
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <a href="#faq">Questions</a>
            </div>
            <div className="hm-foot-col">
              <h4 className="mono">For you</h4>
              <a href="#guests">For guests</a>
              {signedIn ? <Link to="/app">My wedding</Link> : <Link to="/signin">Sign in</Link>}
              {!signedIn && <Link to="/register">Create your wedding</Link>}
            </div>
            <div className="hm-foot-note">
              <Heart size={20} />
              <p>Less coordinating.<br /><em>More celebrating.</em></p>
              <a href="#top">Back to top &uarr;</a>
            </div>
          </div>
          <div className="hm-foot-bottom mono">
            <span>&copy; {new Date().getFullYear()} Make My Marriage</span>
            <span>Made for the moments that matter.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, children }) {
  return (
    <div className="hm-section-head hm-reveal">
      <div className="hm-eyebrow mono">{eyebrow}</div>
      <h2 className="hm-h2">{title}</h2>
      {children && <p className="hm-sub">{children}</p>}
    </div>
  );
}

// A drawing of the dashboard with example data. Decorative, so screen readers skip it.
function DashboardPreview() {
  const upcoming = [
    ['OCT', '24', 'Sangeet', 'The Grand Lawns · 7:00 PM', '142 guests', 'rose'],
    ['OCT', '26', 'Wedding & pheras', 'Amber Fort Gardens · 10:00 AM', '160 guests', 'gold'],
    ['OCT', '27', 'Reception', 'The Grand Lawns · 7:30 PM', '210 guests', 'rose'],
  ];
  const tasks = [
    ['Book caterer for Sangeet', 'Rohan', 'RM', 'Done', true],
    ['Finalise Reception guest list', 'Aisha', 'AS', '16 Oct', false],
    ['Confirm DJ for Sangeet', 'Rekha', 'RK', '22 Oct', false],
  ];
  return (
    <figure className="hm-preview">
      <div className="hm-window" aria-hidden="true">
        <div className="hm-window-bar">
          <span className="hm-dots"><i /><i /><i /></span>
          <span className="hm-window-title">Our wedding workspace</span>
          <span className="hm-window-private"><Lock size={12} /> Private to your family</span>
        </div>
        <div className="hm-window-body">
          <div className="pv-head">
            <div>
              <span className="pv-eyebrow mono">The countdown is on</span>
              <h3 className="pv-title">Aisha &amp; Rohan&rsquo;s wedding</h3>
              <p className="pv-meta"><b>4 days</b> until Sangeet &middot; Jaipur</p>
            </div>
            <div className="pv-family">
              <span className="pv-avatars"><i>AS</i><i>RM</i><i>RK</i></span>
              <small>Planning together</small>
            </div>
          </div>

          <div className="pv-stats">
            <div className="pv-stat"><span className="mono">Functions</span><b>5</b><small>Haldi to Reception</small></div>
            <div className="pv-stat">
              <span className="mono">Tasks done</span><b>32 <em>/ 48</em></b>
              <span className="pv-progress"><span style={{ width: '67%' }} /></span>
            </div>
            <div className="pv-stat"><span className="mono">Guests invited</span><b>142</b><small>98 said yes</small></div>
            <div className="pv-stat">
              <span className="mono">Budget used</span><b>₹8.2L <em>/ ₹12L</em></b>
              <span className="pv-progress gold"><span style={{ width: '68%' }} /></span>
            </div>
          </div>

          <div className="pv-cols">
            <div className="pv-panel">
              <div className="pv-panel-head"><b>Coming up</b><span className="mono">The celebrations</span></div>
              {upcoming.map(([mon, day, name, where, count, tone]) => (
                <div key={name} className="pv-event">
                  <span className={`pv-tile ${tone}`}><small>{mon}</small><b>{day}</b></span>
                  <span className="pv-event-text"><b>{name}</b><small>{where}</small></span>
                  <span className="pv-count">{count}</span>
                </div>
              ))}
            </div>
            <div className="pv-panel">
              <div className="pv-panel-head"><b>Closer to the big day</b><Check /></div>
              {tasks.map(([title, who, initials, due, done]) => (
                <div key={title} className={`pv-task${done ? ' done' : ''}`}>
                  <span className="pv-box">{done && <Check size={11} />}</span>
                  <span className="pv-task-text"><b>{title}</b><small>{who} &middot; {due}</small></span>
                  <span className="pv-avatar">{initials}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pv-foot">
            <span><i className="pv-live" /> One wedding, one shared workspace</span>
            <span>Example data</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

const Phone = ({ step, caption, raised, children, demo }) => (
  <figure className={`hm-phone-fig${raised ? ' raised' : ''}`}>
    <div className="hm-phone" {...(demo ? { role: 'group', 'aria-label': 'Try the RSVP. This is a preview and nothing is sent.' } : { 'aria-hidden': true })}>
      <span className="hm-speaker" />
      <div className="hm-screen">{children}</div>
    </div>
    <figcaption className="hm-phone-cap mono"><b>{step}</b> {caption}</figcaption>
  </figure>
);

function PhoneInvite() {
  return (
    <Phone step="01" caption="A personal invitation">
      <span className="ph-eyebrow mono">You&rsquo;re invited</span>
      <span className="ph-heart"><Heart size={22} /></span>
      <span className="ph-couple">Aisha<br /><em>&amp; Rohan</em></span>
      <span className="ph-text">With full hearts, we invite you to celebrate our wedding in Jaipur.</span>
      <span className="ph-for">
        <small className="mono">With love, for</small>
        <b>The Mehta family</b>
        <small>You can bring up to 2 guests</small>
      </span>
      <span className="ph-button">Open your invitation</span>
    </Phone>
  );
}

function PhoneDetails() {
  return (
    <Phone step="02" caption="Only their functions" raised>
      <span className="ph-eyebrow mono">Your invitations</span>
      <span className="ph-title">A place for you<br />at every moment.</span>
      {[
        ['24 OCT', 'Sangeet', '7:00 PM onwards', 'The Grand Lawns, Jaipur', 'Gold & emerald'],
        ['27 OCT', 'Reception', '7:30 PM onwards', 'The Grand Lawns, Jaipur', 'Cocktail, any colour'],
      ].map(([date, name, time, venue, dress]) => (
        <span key={name} className="ph-event">
          <small className="ph-event-date mono">{date}</small>
          <b>{name}</b>
          <small>{time}</small>
          <small>{venue}</small>
          <small className="ph-dress mono">Dress code · {dress}</small>
        </span>
      ))}
      <span className="ph-foot">You only see the functions you&rsquo;re invited to.</span>
    </Phone>
  );
}

// The one interactive phone: tap to answer. Local only; nothing is saved or sent.
function PhoneRsvp() {
  const [attending, setAttending] = useState(true);
  const [count, setCount] = useState(2);
  const [meal, setMeal] = useState('Veg');
  const [sent, setSent] = useState(false);
  const change = (fn) => (...args) => {
    setSent(false);
    fn(...args);
  };

  return (
    <Phone step="03" caption="Try it: an RSVP in two taps" demo>
      <span className="ph-eyebrow mono">Sangeet &middot; 24 Oct</span>
      <span className="ph-title">Will you join<br />the celebration?</span>
      <div className="ph-choices">
        <button type="button" className="ph-choice" aria-pressed={attending} onClick={change(() => setAttending(true))}>
          <Check size={14} /> Joyfully attending
        </button>
        <button type="button" className="ph-choice" aria-pressed={!attending} onClick={change(() => setAttending(false))}>
          Can&rsquo;t make it
        </button>
      </div>
      {attending && (
        <>
          <span className="ph-label">How many of you are coming?</span>
          <div className="ph-numbers" role="group" aria-label="Number of people">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" aria-pressed={count === n} onClick={change(() => setCount(n))}>{n}</button>
            ))}
          </div>
          <span className="ph-label">Meal</span>
          <div className="ph-meals" role="group" aria-label="Meal preference">
            {['Veg', 'Non-veg', 'Jain'].map((m) => (
              <button key={m} type="button" aria-pressed={meal === m} onClick={change(() => setMeal(m))}>{m}</button>
            ))}
          </div>
        </>
      )}
      <button type="button" className={`ph-button${sent ? ' sent' : ''}`} onClick={() => setSent(true)}>
        {sent ? <><Check size={13} /> {attending ? `See you there, ${count} of you` : 'Thanks for letting us know'}</> : 'Send my RSVP'}
      </button>
      <span className="ph-foot" aria-live="polite">{sent ? 'Preview only. Nothing was sent.' : 'Plans change? The answer can too.'}</span>
    </Phone>
  );
}
