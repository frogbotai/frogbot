import type { ReactNode } from 'react';

export const NOW = new Date('2026-11-22T17:00:00Z');

export const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

export function Section({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  return (
    <section className="gallery__section" data-primitive={id}>
      <div className="gallery__heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

export function Labelled({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="gallery__stack" style={{ gap: '0.5rem' }}>
      <span className="gallery__label">{label}</span>
      {children}
    </div>
  );
}

function thumb(fill: string, accent: string, shape: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="${fill}"/>${shape.replaceAll('A', accent)}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const thumbnails = [
  thumb(
    '#0f1a12',
    '#3acf6a',
    '<circle cx="52" cy="45" r="22" fill="A"/><rect x="88" y="30" width="48" height="8" rx="4" fill="#e6e9ef"/><rect x="88" y="46" width="32" height="8" rx="4" fill="#8a8f99"/>',
  ),
  thumb(
    '#f3efe6',
    '#d97706',
    '<rect x="20" y="20" width="50" height="50" rx="8" fill="A"/><rect x="84" y="28" width="56" height="10" rx="5" fill="#1f2937"/><rect x="84" y="46" width="40" height="10" rx="5" fill="#6b7280"/>',
  ),
  thumb(
    '#111827',
    '#60a5fa',
    '<path d="M20 70 L60 30 L90 55 L140 20" stroke="A" stroke-width="6" fill="none" stroke-linecap="round"/>',
  ),
  thumb(
    '#eef2ff',
    '#7c3aed',
    '<circle cx="80" cy="45" r="28" fill="none" stroke="A" stroke-width="8"/><circle cx="80" cy="45" r="8" fill="A"/>',
  ),
];
