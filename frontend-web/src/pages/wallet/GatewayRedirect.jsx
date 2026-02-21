import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function GatewayRedirect() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'deposit';
  const amount = searchParams.get('amount');
  const gateway = searchParams.get('gateway') || searchParams.get('method');

  return (
    <div className="page wallet-page">
      <header className="page-header">
        <h1>Payment gateway</h1>
        <p className="page-subtitle">Complete your {type} with the payment provider</p>
      </header>
      <section className="page-content">
        <div className="section-block gateway-redirect-block">
          <p className="gateway-message">
            You would be redirected to the <strong>{gateway || 'payment'} gateway</strong> to complete your {type}.
            {amount && (
              <span> Amount: <strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(amount))}</strong></span>
            )}
          </p>
          <p className="muted">In production, the backend creates a session and returns a redirect URL (Stripe Checkout, PayPal, etc.). The browser then opens that URL for payment.</p>
          <div className="gateway-actions">
            <Link to="/wallet" className="btn btn-primary">Back to Wallet</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
