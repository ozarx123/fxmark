/**
 * Local inline SVG icons — no external requests.
 * All icons use 24x24 viewBox; size scales via width/height.
 */
import React from 'react';

const defaultSize = 24;

function Icon({ children, size = defaultSize, className = '', title, ...props }) {
  const s = Number(size) || defaultSize;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden={!title}
      {...props}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// ——— Nav / UI ———
export function ListIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path fillRule="evenodd" d="M3 6a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1zm0 6a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1zm0 6a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
    </Icon>
  );
}

export function XIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path fillRule="evenodd" d="M18.707 5.293a1 1 0 010 1.414L13.414 12l5.293 5.293a1 1 0 01-1.414 1.414L12 13.414l-5.293 5.293a1 1 0 01-1.414-1.414L10.586 12 5.293 6.707a1 1 0 011.414-1.414L12 10.586l5.293-5.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </Icon>
  );
}

// ——— FxmarkIcon nav set ———
export function SquaresFourIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M5 5h4v4H5V5zm10 0h4v4h-4V5zM5 15h4v4H5v-4zm10 0h4v4h-4v-4z" />
    </Icon>
  );
}

export function UsersIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.5 0-7 1.25-7 3.5V20h14v-2.5c0-2.25-4.5-3.5-7-3.5z" />
    </Icon>
  );
}

export function UserIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4z" />
    </Icon>
  );
}

export function HandshakeIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M11.5 10h1v2h-1v-2zm-2 2h1v2h-1v-2zm4 0h1v2h-1v-2zm-6 4h12v-2h-4v-1h-4v1H3.5v2zM4 8l4-4 4 2 4-2 4 4v4H4V8z" />
    </Icon>
  );
}

export function WalletIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M20 6H4a2 2 0 00-2 2v8a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2zm0 10H4V8h16v8zm-4-4h2v2h-2v-2z" />
    </Icon>
  );
}

export function ArrowDownIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 14l-5-5h3V4h4v5h3l-5 5z" />
    </Icon>
  );
}

export function ArrowUpIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 10l5 5h-3v5h-4v-5H7l5-5z" />
    </Icon>
  );
}

export function ChartLineUpIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 17v-2h4v-4h4V7h4v4h4v2H3zm0-6v6h18v-6h-4v2h-2v-4h-4v4H7v-2H3z" />
    </Icon>
  );
}

export function ListChecksIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2zm14-8l-3 3 1.5 1.5L18 8z" />
    </Icon>
  );
}

export function ClockCounterClockwiseIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm1-13h-2v6l5.2 3.2 1-1.6-4.2-2.6V7z" />
    </Icon>
  );
}

export function TrendUpIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M21 7l-9 9-4-4-6 6 1.5 1.5L8 14.5l4 4 9-9V7z" />
    </Icon>
  );
}

export function TrendDownIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M21 17l-9-9-4 4-6-6 1.5-1.5L8 9.5l4-4 9 9v2.5z" />
    </Icon>
  );
}

export function ChartBarIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M3 19v-6h4v6H3zm6 0V9h4v10H9zm6 0V3h4v16h-4z" />
    </Icon>
  );
}

export function FileTextIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm4 18H6V4h7v5h5v11zm-2-9H8v2h8v-2zm0 4H8v2h8v-2z" />
    </Icon>
  );
}

export function GearIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.65 1.65 0 00.33-1.82l-.35-.6a1.65 1.65 0 00-1.32-.73l-.58.08a7.2 7.2 0 01-.5-1.2l-.2-.55a1.65 1.65 0 00-1.55-1.04l-.59.05a1.65 1.65 0 00-1.33.73l-.35.6a1.65 1.65 0 00.33 1.82l.27.33a7.2 7.2 0 010 .9l-.27.33a1.65 1.65 0 00-.33 1.82l.35.6c.26.44.73.73 1.32.73l.58-.08c.12.45.3.88.5 1.2l.2.55c.17.44.58.76 1.05 1.04l.59-.05c.5-.04.96-.3 1.33-.73l.35-.6a1.65 1.65 0 00-.33-1.82l-.27-.33a7.2 7.2 0 010-.9l.27-.33zM12 18a6 6 0 100-12 6 6 0 000 12z" />
    </Icon>
  );
}

export function ShieldCheckIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm0 16.5c-3.31-.82-5.5-4.17-5.5-7.41V6.3l5.5-2.06 5.5 2.06v5.29c0 3.24-2.19 6.59-5.5 7.41zm2.5-8.5l-3 3-1.5-1.5L11 12.5 13.5 10l1 1-2.5 2.5z" />
    </Icon>
  );
}

export function BellIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </Icon>
  );
}

export function PlugsIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M11 9V3H9v6H7V3H5v6H3v2h2v6H3v2h2v2h2v-2h2v2h2v-2h2v-2h-2v-6h2V9h-2zm0 8H9v-6h2v6zm4-14v2h2v2h-2v2h2v2h2v-2h2V9h-2V7h-2V5h-2z" />
    </Icon>
  );
}

export function CpuIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M6 2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm0 2v12h12V4H6zm2 2h8v8H8V8zm2 2v4h4v-4h-4z" />
    </Icon>
  );
}

export function LightningIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M13 2L4 14h6l-2 8 9-12h-6l2-8z" />
    </Icon>
  );
}

export function ShareNetworkIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2l-1.5 1.5L12 5V4c4.4 0 8 3.6 8 8 0 1.5-.4 2.9-1.1 4.2l-1.4-1.4C18.2 14.2 18.5 13.1 18.5 12c0-3.6-2.9-6.5-6.5-6.5V2zm-2 4l-5 5 5 5v-3.5c2.5 0 4.5 2 4.5 4.5 0 .9-.3 1.8-.8 2.5l-1.3-1.3c.3-.5.5-1.1.5-1.7 0-1.7-1.3-3-3-3V6z" />
    </Icon>
  );
}

// ——— Landing / features ———
export function HeadsetIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2a6 6 0 00-6 6v4a2 2 0 002 2h2v4h6v-6h-4V8a6 6 0 00-6-6zm-4 8V8a4 4 0 018 0v2H8zm10 4v2h2a2 2 0 002-2v-2h-4z" />
    </Icon>
  );
}

export function CopyIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </Icon>
  );
}

export function RobotIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2a2 2 0 012 2v2h4v2h-2v8H8V8H6V6h4V4a2 2 0 012-2zm0 4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-4 6h8v4H8v-4zm8-4a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm-8 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
    </Icon>
  );
}

export function QuotesIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M6 8c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h2v-2H6v-6h2V8H6zm10 0c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h2v-2h-2v-6h2V8h-2zM8 4v2h2l-2 4h2v2H6V8.5L8 4zm10 0v2h2l-2 4h2v2h-4v-3.5l2-4V4z" />
    </Icon>
  );
}

export function CurrencyDollarIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2v2h-.5C9.57 4 8 5.57 8 7.5S9.57 11 11.5 11h1c1.93 0 3.5 1.57 3.5 3.5S14.43 18 12.5 18H12v2h-2v-2h-.5C7.57 18 6 16.43 6 14.5H4c0 2.93 2.07 5 5 5h.5v2h2v-2h.5c2.93 0 5-2.07 5-5s-2.07-5-5-5h-1C9.57 7 8 5.43 8 3.5S9.57 0 11.5 0H12V2h2zM10 14.5c0 .83.67 1.5 1.5 1.5h1c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5h-1c-.83 0-1.5.67-1.5 1.5zm4-7c0 .83-.67 1.5-1.5 1.5h-1c-.83 0-1.5-.67-1.5-1.5S10.67 5 11.5 5h1c.83 0 1.5.67 1.5 1.5z" />
    </Icon>
  );
}

export function BankIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2L2 8v2h2v10h4V12h4v8h4V10h2V8L12 2zm0 2.5l6 4H6l6-4zM6 20v-6h12v6H6z" />
    </Icon>
  );
}

// ——— Dashboard ———
export function GraduationCapIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2L2 8l10 6 10-6-10-6zm0 11.5l-6-3.6V14l6 3.5 6-3.5V9.9l-6 3.6z" />
    </Icon>
  );
}

export function PhoneIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.1-.03-.21-.05-.31-.05-.26 0-.51.1-.71.29l-2.2 2.2a15.07 15.07 0 01-6.59-6.59l2.2-2.2c.28-.28.36-.67.25-1.02A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z" />
    </Icon>
  );
}

export function ArrowRightIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M14 6l-1.5 1.5L16.2 11H4v2h12.2l-3.7 3.5L14 18l6-6-6-6z" />
    </Icon>
  );
}

// ——— PAMM Manager ———
export function TwitterLogoIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M22 5.9a8.5 8.5 0 01-2.4.66 4.2 4.2 0 001.84-2.3 8.4 8.4 0 01-2.66 1.02 4.2 4.2 0 00-7.16 3.82 11.9 11.9 0 01-8.62-4.36 4.2 4.2 0 001.3 5.6 4.2 4.2 0 01-1.9-.52v.05a4.2 4.2 0 003.37 4.12 4.2 4.2 0 01-1.9.07 4.2 4.2 0 003.92 2.92 8.4 8.4 0 01-5.22 1.8 4.2 4.2 0 00-.06 1 11.9 11.9 0 006.6 1.84 11.9 11.9 0 0011.8-12v-.54a8.5 8.5 0 002.1-2.12z" />
    </Icon>
  );
}

export function LinkedinLogoIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M20.4 2H3.6C2.7 2 2 2.7 2 3.6v16.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 1.6-1.6V3.6c0-.9-.7-1.6-1.6-1.6zM8 19H5v-9h3v9zm-1.5-10.3c-1 0-1.8-.8-1.8-1.8s.8-1.8 1.8-1.8 1.8.8 1.8 1.8-.8 1.8-1.8 1.8zM19 19h-3v-4.5c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4V19h-3v-9h2.9v1.3h.1c.4-.8 1.4-1.5 2.8-1.5 3 0 3.5 2 3.5 4.5V19z" />
    </Icon>
  );
}

export function FacebookLogoIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M24 12.07c0-6.63-5.37-12-12-12S0 5.44 0 12.07c0 6.02 4.42 11 10.22 11.96v-8.45H7.1V12.07h3.12V9.46c0-3.08 1.84-4.78 4.64-4.78 1.34 0 2.73.24 2.73.24v3h-1.54c-1.52 0-2 0.94-2 1.91v2.29h3.4l-.54 3.51h-2.86v8.45C19.58 23.07 24 18.09 24 12.07z" />
    </Icon>
  );
}

export function ChartLineIcon({ size, className }) {
  return <ChartLineUpIcon size={size} className={className} />;
}

// ——— PAMM AI ———
export function BrainIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2a4 4 0 013.6 2.3 3 3 0 012.4 5.2 3 3 0 010 4.5 4 4 0 01-2.4 7.2v1.8h-2v-2a2 2 0 00-1.5-1.94 4 4 0 01-2.1-3.2 4 4 0 016 0 4 4 0 01-2.1 3.2A2 2 0 008 16v2H6v-1.8A4 4 0 013.6 19.2 3 3 0 013.6 14.7 3 3 0 016 9.5 4 4 0 019.6 7.3 4 4 0 0112 2z" />
    </Icon>
  );
}

// ——— Verified / badges ———
export function CheckCircleIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path fillRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9.5l-4 4-2-2-1 1 3 3 5-5-1-1z" clipRule="evenodd" />
    </Icon>
  );
}

export function CrownIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2l2.5 6 5 .5-4 4 .5 5.5L12 15l-4 3.5.5-5.5-4-4 5-.5L12 2z" />
    </Icon>
  );
}

export function SparkleIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM6 16l1 3 3-1-1-3-3 1zm12 0l-1 3-3-1 1-3 3 1z" />
    </Icon>
  );
}

// ——— Payment ———
export function CreditCardIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
    </Icon>
  );
}

export function PaypalLogoIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M9.3 2.3c.9 0 1.7.3 2.3.9.6.6.9 1.4.9 2.3v.4h2.8c.6 0 1.1.2 1.5.6.4.4.6.9.6 1.5 0 .2 0 .4-.1.6l-1.2 7.5c-.1.5-.5.8-1 .8H9.5c-.3 0-.5-.2-.6-.5L7.2 4.5c-.1-.3.1-.6.4-.7l1.7-.5zm6 4.5h-2.2c-.3 0-.5.2-.6.5L11.5 19c-.1.3.1.6.4.6h1.9c.5 0 .9-.3 1-.8l.8-5c.1-.2.1-.4.1-.6 0-.6-.5-1.1-1.1-1.1z" />
    </Icon>
  );
}

// ——— Social (copy / master) ———
export function InstagramLogoIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M12 2.2c2.9 0 3.2 0 4.3.1 1 .1 1.7.2 2.1.4.5.2.9.5 1.3.9.4.4.7.8.9 1.3.2.4.3 1.1.4 2.1.4 1.1.1 1.4.1 4.3.1s3.2 0 4.3-.1c1-.1 1.7-.2 2.1-.4.5-.2.9-.5 1.3-.9.4-.4.7-.8.9-1.3.2-.4.3-1.1.4-2.1.1-1.1.1-1.4.1-4.3s0-3.2-.1-4.3c-.1-1-.2-1.7-.4-2.1-.2-.5-.5-.9-.9-1.3-.4-.4-.8-.7-1.3-.9-.4-.2-1.1-.3-2.1-.4-1.1-.1-1.4-.1-4.3-.1zM12 0c-2.9 0-3.3 0-4.4.1-1.1.1-1.9.2-2.8.5-.9.4-1.7.8-2.4 1.5S1.9 3.1 1.5 4c-.3.9-.4 1.7-.5 2.8C.9 7.9.9 8.3.9 12s0 3.3.1 4.4c.1 1.1.2 1.9.5 2.8.4.9.8 1.7 1.5 2.4s1.5 1.1 2.4 1.5c.9.3 1.7.4 2.8.5 1.1.1 1.5.1 4.4.1s3.3 0 4.4-.1c1.1-.1 1.9-.2 2.8-.5.9-.4 1.7-.8 2.4-1.5s1.1-1.5 1.5-2.4c.3-.9.4-1.7.5-2.8.1-1.1.1-1.5.1-4.4s0-3.3-.1-4.4c-.1-1.1-.2-1.9-.5-2.8-.4-.9-.8-1.7-1.5-2.4S20.9.9 20 .5C19.1.2 18.3.1 17.2 0 16.1 0 15.7 0 12 0zm0 5.8a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zM12 16a4 4 0 110-8 4 4 0 010 8zm6.4-11.4a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
    </Icon>
  );
}

export function TelegramLogoIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M11.9 22c-.2 0-.4 0-.5-.1l-2.8-1.4-1.4.6c-.3.1-.6.1-.9 0l.3-2.8 8.2-7.4c.4-.3.9-.2 1.1.2.2.4.1.9-.2 1.2l-6.2 5.6 1.6 1.3 7-6.4c.4-.4 1-.3 1.3.2.3.4.2 1-.2 1.3l-8.5 4.6-.6.3-.6-.3-2.2-1.1 7.2-6.5-9.4 8.9-.1 1.6c0 .3-.1.6-.4.7l-1.4.6c-.2.1-.5.1-.7 0l-2.1-.9c-.4-.2-.6-.6-.5-1l.5-4.5L2.2 5.5c-.3-.2-.4-.6-.2-.9.2-.3.6-.4.9-.2l16 6.7c.4.2.6.6.5 1-.1.4-.5.7-.9.7l-6.2.8-2.4 4.6c-.2.3-.1.7.2.9.3.2.6.1.8-.2l1.5-2.9 2.2-1.9z" />
    </Icon>
  );
}

export function WhatsAppLogoIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path fill="currentColor" d="M17.5 14.4c-.2-.1-1.2-.6-1.4-.6-.2 0-.3-.1-.4.1-.2.2-.6.6-.7.8-.1.2-.2.2-.4.1-.6-.2-.2-1-1.2-1.6-2-.2-.3-.2-.4.1-.6.1-.1.3-.3.4-.4.1-.2.2-.3.1-.5 0-.2-.5-1.3-.7-1.8-.2-.4-.4-.3-.5-.3h-.5c-.2 0-.5.1-.7.5-.2.4-.9 1.3-.9 3.2 0 1.9 1.4 3.7 1.6 4 .2.2 2.8 4.3 6.8 6 .4.2.7.3.9.3.2 0 .4 0 .6-.2.2-.2.4-.5.7-.9.2-.4.2-.7.2-1 .1-.3-.1-.5-.2-.6M12 2C6.5 2 2 6.5 2 12c0 2.1.5 4.1 1.5 5.9L2 22l4.2-1.1c1.6.9 3.4 1.4 5.3 1.4 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
    </Icon>
  );
}

export function YoutubeLogoIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M23.5 6.5c-.3-1.1-1.1-1.9-2.2-2.2C19.5 4 12 4 12 4s-7.5 0-9.3.3c-1.1.3-1.9 1.1-2.2 2.2C0 8.3 0 12 0 12s0 3.7.5 5.5c.3 1.1 1.1 1.9 2.2 2.2 1.8.3 9.3.3 9.3.3s7.5 0 9.3-.3c1.1-.3 1.9-1.1 2.2-2.2.5-1.8.5-5.5.5-5.5s0-3.7-.5-5.5zM9.5 15.5v-7l6.3 3.5-6.3 3.5z" />
    </Icon>
  );
}

// ——— IB ———
export function LinkSimpleIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M11 7h3a4 4 0 014 4v2h-2v-2a2 2 0 00-2-2h-3V7zm-4 4H4a4 4 0 014-4v2a2 2 0 00-2 2v2h2v-2zm2 2v2a2 2 0 002 2h2v2a4 4 0 01-4-4v-2zm8-2h-2v2a4 4 0 01-4 4h-2v-2a2 2 0 002-2v-2z" />
    </Icon>
  );
}

export function CheckIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path fillRule="evenodd" d="M20 6L9 17l-5-5 1.5-1.5L9 14 18.5 4.5 20 6z" clipRule="evenodd" />
    </Icon>
  );
}

export function UserPlusIcon({ size, className }) {
  return (
    <Icon size={size} className={className}>
      <path d="M15 8a4 4 0 11-8 0 4 4 0 018 0zM4 18v-2a4 4 0 014-4h4a4 4 0 014 4v2h-2v-2a2 2 0 00-2-2h-4a2 2 0 00-2 2v2H4z" />
    </Icon>
  );
}
