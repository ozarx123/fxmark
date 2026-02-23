import React from 'react';
import { Link } from 'react-router-dom';

const brandRed = '#E10600';
const brandOrange = '#FF6A00';
const brandDark = '#0B0B0B';

export function FxmarkLogoWordmark({ className = '', useLink = true, darkBg = true }) {
  const line2Color = darkBg ? 'rgba(255,255,255,0.88)' : brandDark;
  const content = (
    <span className={`fxmark-wordmark ${className}`}>
      <span className="fxmark-line1">
        <span style={{ color: brandRed }}>F</span>
        <span style={{ color: brandOrange }}>X</span>
        <span style={{ color: brandRed }}>MARK</span>
      </span>
      <span className="fxmark-line2" style={{ color: line2Color }}>GLOBAL</span>
    </span>
  );
  if (useLink) {
    return <Link to="/" className="fxmark-logo-link">{content}</Link>;
  }
  return content;
}

export default function FxmarkLogo({ useImage = true, className = '', useLink = true }) {
  if (useImage) {
    const img = <img src="/fxmark-logo.png" alt="FXMARK GLOBAL" className={`fxmark-logo-img ${className}`} />;
    if (useLink) return <Link to="/" className="fxmark-logo-link">{img}</Link>;
    return img;
  }
  return <FxmarkLogoWordmark className={className} useLink={useLink} darkBg={false} />;
}
