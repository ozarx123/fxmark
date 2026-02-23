import React from 'react';
import { Link } from 'react-router-dom';
import FxmarkLogo from '../../components/FxmarkLogo';
import {
  ChartLineUp,
  ShieldCheck,
  Lightning,
  Headset,
  TrendUp,
  Copy,
  Plugs,
  Cpu,
  Robot,
  Quotes,
  CurrencyDollar,
  Bank,
  ClockCounterClockwise,
  List,
  X,
} from '@phosphor-icons/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

const samplePrices = [
  { time: '00:00', eurusd: 1.0842, gbpusd: 1.2641 },
  { time: '04:00', eurusd: 1.0856, gbpusd: 1.2655 },
  { time: '08:00', eurusd: 1.0871, gbpusd: 1.2632 },
  { time: '12:00', eurusd: 1.0862, gbpusd: 1.2668 },
  { time: '16:00', eurusd: 1.0889, gbpusd: 1.2682 },
  { time: '20:00', eurusd: 1.0895, gbpusd: 1.2691 },
  { time: '24:00', eurusd: 1.0901, gbpusd: 1.2702 },
];

const CORE_FEATURES = [
  {
    icon: Lightning,
    title: 'Fast execution',
    description: 'Institutional-grade order execution with minimal latency. Trade when it matters.',
  },
  {
    icon: ChartLineUp,
    title: 'Live charts & analysis',
    description: 'Real-time data, advanced charting, and tools to support your strategy across 50+ pairs.',
  },
  {
    icon: ShieldCheck,
    title: 'Regulated & secure',
    description: 'UK-regulated platform. Your funds and data protected to the highest standards.',
  },
  {
    icon: Headset,
    title: '24/5 support',
    description: 'Dedicated support from London. Get help when you need it, in your timezone.',
  },
];

const BENEFITS = [
  { icon: CurrencyDollar, label: 'Tight spreads', detail: 'Competitive pricing on majors and minors' },
  { icon: Bank, label: 'Segregated funds', detail: 'Client money held in top-tier banks' },
  { icon: ClockCounterClockwise, label: 'Transparent history', detail: 'Full audit trail and reporting' },
  { icon: TrendUp, label: 'Scale with you', detail: 'From retail to professional accounts' },
];

const ADVANCED = [
  { icon: Copy, title: 'Copy trading', description: 'Follow proven strategies. Automate your portfolio with top traders.' },
  { icon: Cpu, title: 'PAMM accounts', description: 'Manage investor capital or invest in professional managers.' },
  { icon: Plugs, title: 'API & integration', description: 'Connect your systems. Build algos and dashboards with our API.' },
];

const TESTIMONIALS = [
  {
    quote: 'Execution is rock-solid. I moved from a larger broker and the difference in fills and support is night and day.',
    name: 'James K.',
    role: 'Proprietary trader',
    location: 'London',
  },
  {
    quote: 'The PAMM setup let me scale without hiring a team. My investors get transparency; I get one dashboard.',
    name: 'Sarah M.',
    role: 'Fund manager',
    location: 'Dubai',
  },
  {
    quote: 'API documentation is clear, and the team helped us go live in weeks. We run our quant strategies here.',
    name: 'Alex T.',
    role: 'Quant developer',
    location: 'Singapore',
  },
];

export default function Landing() {
  const [navOpen, setNavOpen] = React.useState(false);

  const closeNav = () => setNavOpen(false);

  return (
    <div className="landing">
      <header className="landing-header">
        <FxmarkLogo className="landing-logo" />
        <button
          type="button"
          className="landing-nav-toggle"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
        >
          {navOpen ? <X weight="bold" size={24} /> : <List weight="bold" size={24} />}
        </button>
        <nav className={`landing-nav ${navOpen ? 'nav-open' : ''}`}>
          <a href="#features" onClick={closeNav}>Features</a>
          <a href="#benefits" onClick={closeNav}>Benefits</a>
          <a href="#advanced" onClick={closeNav}>Advanced</a>
          <a href="#ai" onClick={closeNav}>AI Trading</a>
          <a href="#testimonials" onClick={closeNav}>Testimonials</a>
          <a href="#markets" onClick={closeNav}>Markets</a>
          <a href="#about" onClick={closeNav}>About</a>
          <Link to="/auth" className="btn btn-login" onClick={closeNav}>Login</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-bg">
          <img
            src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1920&q=80"
            alt=""
            className="hero-bg-img"
          />
          <div className="hero-overlay" />
        </div>
        <div className="hero-content">
          <h1>Trade with confidence</h1>
          <p className="hero-tagline">
            FXMARK Global — a London-based forex platform. Regulated, transparent, built for serious traders and funds.
          </p>
          <div className="hero-cta">
            <Link to="/auth" className="btn btn-primary btn-hero">Open account</Link>
            <Link to="/auth" className="btn btn-hero-outline">Login</Link>
          </div>
          <p className="hero-trust">Regulated in the UK · Segregated client funds · 24/5 support</p>
        </div>
      </section>

      <section className="landing-section landing-features" id="features">
        <h2>Core features</h2>
        <p className="section-sub">Everything you need to trade forex seriously — execution, tools, and support.</p>
        <div className="features-grid features-grid-icons">
          {CORE_FEATURES.map((f) => (
            <div key={f.title} className="feature-card feature-card-icon">
              <span className="feature-icon-wrap">
                <f.icon weight="duotone" size={32} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-benefits" id="benefits">
        <h2>Why traders choose us</h2>
        <p className="section-sub">Trust, transparency, and technology at the heart of every trade.</p>
        <div className="benefits-grid">
          {BENEFITS.map((b) => (
            <div key={b.label} className="benefit-card">
              <span className="benefit-icon">
                <b.icon weight="duotone" size={28} />
              </span>
              <div className="benefit-text">
                <strong>{b.label}</strong>
                <span>{b.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-advanced" id="advanced">
        <h2>Advanced capabilities</h2>
        <p className="section-sub">PAMM, copy trading, and API — for funds and professional traders.</p>
        <div className="advanced-grid">
          {ADVANCED.map((a) => (
            <div key={a.title} className="advanced-card">
              <span className="advanced-icon">
                <a.icon weight="duotone" size={36} />
              </span>
              <h3>{a.title}</h3>
              <p>{a.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-ai" id="ai">
        <div className="ai-inner">
          <div className="ai-content">
            <span className="ai-badge">AI & automation</span>
            <h2>AI-powered trading tools</h2>
            <p className="ai-lead">
              Deploy strategies that adapt. Our platform supports algorithmic trading, signals, and AI-driven analysis — so you can automate execution and focus on edge.
            </p>
            <ul className="ai-list">
              <li>Algorithmic execution and custom strategies</li>
              <li>API access for quant and ML pipelines</li>
              <li>Signal integration and copy-trading automation</li>
              <li>Risk controls and position sizing built in</li>
            </ul>
            <Link to="/auth" className="btn btn-primary">Explore AI trading</Link>
          </div>
          <div className="ai-visual">
            <span className="ai-visual-icon" aria-hidden>
              <Robot weight="duotone" size={120} />
            </span>
          </div>
        </div>
      </section>

      <section className="landing-section landing-testimonials" id="testimonials">
        <h2>Trusted by traders worldwide</h2>
        <p className="section-sub">See what professionals say about trading with FXMARK Global.</p>
        <div className="testimonials-grid">
          {TESTIMONIALS.map((t, i) => (
            <blockquote key={i} className="testimonial-card">
              <Quotes weight="duotone" size={28} className="testimonial-quote-icon" />
              <p className="testimonial-quote">"{t.quote}"</p>
              <footer className="testimonial-footer">
                <span className="testimonial-name">{t.name}</span>
                <span className="testimonial-role">{t.role} · {t.location}</span>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      <section className="landing-section landing-charts" id="markets">
        <h2>Live market movement</h2>
        <p className="section-sub">Sample forex indices (illustrative).</p>
        <div className="charts-row">
          <div className="chart-card">
            <h3>EUR/USD</h3>
            <div className="chart-container" style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={samplePrices} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEur" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E10600" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#E10600" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                  <XAxis dataKey="time" stroke="rgba(0,0,0,0.2)" tick={{ fill: 'var(--fxmark-text-muted)', fontSize: 11 }} />
                  <YAxis stroke="rgba(0,0,0,0.2)" tick={{ fill: 'var(--fxmark-text-muted)', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--fxmark-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--fxmark-text)' }} />
                  <Area type="monotone" dataKey="eurusd" stroke="#E10600" strokeWidth={2} fill="url(#colorEur)" name="EUR/USD" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="chart-card">
            <h3>GBP/USD</h3>
            <div className="chart-container" style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={samplePrices} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                  <XAxis dataKey="time" stroke="rgba(0,0,0,0.2)" tick={{ fill: 'var(--fxmark-text-muted)', fontSize: 11 }} />
                  <YAxis stroke="rgba(0,0,0,0.2)" tick={{ fill: 'var(--fxmark-text-muted)', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--fxmark-border)', borderRadius: 8 }} labelStyle={{ color: 'var(--fxmark-text)' }} />
                  <Line type="monotone" dataKey="gbpusd" stroke="#FF6A00" strokeWidth={2} dot={false} name="GBP/USD" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-about" id="about">
        <div className="about-content">
          <div className="about-text">
            <h2>Trusted in the heart of London</h2>
            <p>
              FXMARK Global is a UK-based forex platform offering competitive spreads, fast execution,
              and robust risk management. Whether you trade manually, use PAMM and copy trading, or run algos,
              we provide the tools and support you need.
            </p>
            <p>Regulated and headquartered in London, United Kingdom.</p>
            <Link to="/auth" className="btn btn-primary">Get started</Link>
          </div>
          <div className="about-img">
            <img src="https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80" alt="London" />
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-columns">
            <div className="footer-col footer-col-left">
              <FxmarkLogo useLink={true} className="footer-logo" />
              <p className="footer-tagline">Forex platform · London, United Kingdom</p>
              <div className="footer-company">
                <p className="footer-company-name">FX MARK GLOBAL LTD</p>
                <p className="footer-company-number">Company number 16935066</p>
                <p className="footer-company-address">
                  Registered office address: 2nd Floor College House, 17 King Edwards Road, Ruislip, London, United Kingdom, HA4 7AE
                </p>
              </div>
            </div>
            <div className="footer-col footer-col-right">
              <div className="footer-disclaimer">
                <p className="footer-disclaimer-title">Disclaimer</p>
                <p>
                  Trading forex and CFDs carries a high level of risk and may not be suitable for all investors. 
                  Leverage can work against you. Past performance is not indicative of future results. 
                  You should only trade with capital you can afford to lose. Before trading, please consider your experience, 
                  objectives and seek independent advice if necessary.
                </p>
              </div>
              <div className="footer-investor">
                <p className="footer-investor-title">Investor information</p>
                <p>
                  Products and services are offered by FX MARK GLOBAL LTD. The value of your investment may go down as well as up. 
                  Regulatory requirements and investor protection may vary by jurisdiction. 
                  For further information, please contact us or refer to our terms and risk disclosures.
                </p>
              </div>
            </div>
          </div>
          <p className="footer-legal">© {new Date().getFullYear()} FX MARK GLOBAL LTD. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
