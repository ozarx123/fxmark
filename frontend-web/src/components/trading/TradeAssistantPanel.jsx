import React from 'react';
import AiInsightCard from './AiInsightCard';
import RiskSuggestionCard from './RiskSuggestionCard';
import MarketContextCard from './MarketContextCard';

/**
 * AI-ready trading assistant. Props prepared for future AI integration.
 * aiInsights, tradeSuggestions, riskWarnings, marketContext, sessionSummary.
 * No AI logic implemented yet — placeholder cards only.
 */
export default function TradeAssistantPanel({
  aiInsights = [],
  tradeSuggestions = [],
  riskWarnings = [],
  marketContext = null,
  sessionSummary = null,
  className = '',
}) {
  return (
    <div className={`terminal-trade-assistant ${className}`}>
      <h3 className="terminal-trade-assistant__title">Trading assistant</h3>

      {aiInsights.length > 0 ? (
        <div className="terminal-trade-assistant__section">
          <span className="terminal-trade-assistant__label">Insights</span>
          {aiInsights.map((insight, i) => (
            <AiInsightCard key={i} insight={typeof insight === 'string' ? { title: 'Insight', body: insight } : insight} />
          ))}
        </div>
      ) : (
        <div className="terminal-trade-assistant__section">
          <AiInsightCard insight={{ title: 'Insights', body: 'AI insights will appear here when enabled.' }} />
        </div>
      )}

      {riskWarnings.length > 0 && (
        <div className="terminal-trade-assistant__section">
          <span className="terminal-trade-assistant__label">Risk</span>
          {riskWarnings.map((w, i) => (
            <RiskSuggestionCard key={i} item={{ type: 'risk', severity: 'warning', message: typeof w === 'string' ? w : w.message }} />
          ))}
        </div>
      )}

      {tradeSuggestions.length > 0 && (
        <div className="terminal-trade-assistant__section">
          <span className="terminal-trade-assistant__label">Suggestions</span>
          {tradeSuggestions.map((s, i) => (
            <RiskSuggestionCard key={i} item={{ type: 'suggestion', ...(typeof s === 'string' ? { message: s } : s) }} />
          ))}
        </div>
      )}

      <div className="terminal-trade-assistant__section">
        <MarketContextCard context={marketContext} />
      </div>

      {sessionSummary && (
        <div className="terminal-trade-assistant__section">
          <span className="terminal-trade-assistant__label">Session</span>
          <p className="terminal-trade-assistant__text">{typeof sessionSummary === 'string' ? sessionSummary : JSON.stringify(sessionSummary)}</p>
        </div>
      )}
    </div>
  );
}
