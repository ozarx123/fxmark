import React from 'react';
import { Link } from 'react-router-dom';
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

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" className="landing-logo">FXMARK Global</Link>
        <nav className="landing-nav">
          <a href="#features">Features</a>
          <a href="#markets">Markets</a>
          <a href="#about">About</a>
          <Link to="/dashboard" className="btn btn-login">Login</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-bg">
          <img
            src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1920&q=80"
            alt="Trading"
            className="hero-bg-img"
          />
          <div className="hero-overlay" />
        </div>
        <div className="hero-content">
          <h1>Trade Forex with Confidence</h1>
          <p className="hero-tagline">
            FXMARK Global — a London-based forex platform. Regulated, transparent, built for serious traders.
          </p>
          <div className="hero-cta">
            <Link to="/dashboard" className="btn btn-primary btn-hero">Open Account</Link>
            <Link to="/dashboard" className="btn btn-login btn-hero-outline">Login</Link>
          </div>
          <p className="hero-location">Based in London, United Kingdom</p>
        </div>
      </section>

      <section className="landing-section landing-features" id="features">
        <h2>Why FXMARK Global</h2>
        <p className="section-sub">Regulated execution, tight spreads, and 24/5 support from the heart of London.</p>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-img-wrap">
              <img src="https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=600&q=80" alt="Markets" />
            </div>
            <h3>Major & minor pairs</h3>
            <p>Trade EUR/USD, GBP/USD, and 50+ forex pairs with institutional-grade execution.</p>
          </div>
          <div className="feature-card">
            <div className="feature-img-wrap">
              <img src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&q=80" alt="Charts" />
            </div>
            <h3>Live charts & analysis</h3>
            <p>Real-time data, advanced charting, and tools to support your strategy.</p>
          </div>
          <div className="feature-card">
            <div className="feature-img-wrap">
              <img src="https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&q=80" alt="London" />
            </div>
            <h3>London-based</h3>
            <p>Headquartered in London, UK — one of the world’s leading forex hubs.</p>
          </div>
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
                      <stop offset="5%" stopColor="#de1414" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#de1414" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#1a0a0a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                  <Area type="monotone" dataKey="eurusd" stroke="#de1414" strokeWidth={2} fill="url(#colorEur)" name="EUR/USD" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="chart-card">
            <h3>GBP/USD</h3>
            <div className="chart-container" style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={samplePrices} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#1a0a0a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                  <Line type="monotone" dataKey="gbpusd" stroke="#ff6b35" strokeWidth={2} dot={false} name="GBP/USD" />
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
              and robust risk management. Whether you trade manually or use PAMM and copy trading,
              we provide the tools and support you need.
            </p>
            <p>Regulated and headquartered in London, United Kingdom.</p>
            <Link to="/dashboard" className="btn btn-primary">Get started</Link>
          </div>
          <div className="about-img">
            <img src="https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80" alt="London" />
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-inner">
          <span className="footer-logo">FXMARK Global</span>
          <p>Forex platform · London, United Kingdom</p>
          <p className="footer-legal">Trading forex carries risk. Past performance is not indicative of future results.</p>
        </div>
      </footer>
    </div>
  );
}
