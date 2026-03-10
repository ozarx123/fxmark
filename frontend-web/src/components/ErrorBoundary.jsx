import React from 'react';

export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '2rem',
          maxWidth: 600,
          margin: '2rem auto',
          fontFamily: 'system-ui, sans-serif',
          background: '#1a0a0a',
          color: '#eee',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.2)',
        }}>
          <h1 style={{ margin: '0 0 1rem', fontSize: '1.25rem' }}>Something went wrong</h1>
          <pre style={{
            margin: 0,
            padding: '1rem',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 4,
            fontSize: '0.8rem',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
            Check the browser console (F12) for more details.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              background: '#de1414',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
