import React from 'react';

/**
 * AI-ready card for a single insight. No AI logic — structure only.
 * Later: pass { id, title, body, confidence, source } from AI service.
 */
export default function AiInsightCard({ insight, className = '' }) {
  const title = insight?.title ?? 'Insight';
  const body = insight?.body ?? (typeof insight === 'string' ? insight : null);
  const confidence = insight?.confidence;
  const source = insight?.source;

  return (
    <div className={`ai-insight-card ${className}`}>
      <div className="ai-insight-card__header">
        <span className="ai-insight-card__title">{title}</span>
        {confidence != null && (
          <span className="ai-insight-card__confidence">{Number(confidence).toFixed(0)}%</span>
        )}
      </div>
      {body && <p className="ai-insight-card__body">{body}</p>}
      {source && <span className="ai-insight-card__source">{source}</span>}
    </div>
  );
}
