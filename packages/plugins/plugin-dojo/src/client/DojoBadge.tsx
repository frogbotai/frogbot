'use client';

import './styles.css';

import type { ReactNode } from 'react';
import { Component, useEffect, useState } from 'react';

import { badgeHref } from './href.js';

const hiddenKey = 'frogbot-dojo-badge-hidden';

class BadgeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function readHidden(): boolean {
  try {
    return window.sessionStorage.getItem(hiddenKey) === '1';
  } catch {
    return false;
  }
}

function writeHidden(): boolean {
  try {
    window.sessionStorage.setItem(hiddenKey, '1');

    return true;
  } catch {
    return false;
  }
}

function Badge() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (!readHidden()) setHref(badgeHref(window.location.hostname));
  }, []);

  if (!href) return null;

  const hide = () => {
    setHref(null);
    writeHidden();
  };

  return (
    <div className="fb-dojo-badge">
      <a className="fb-dojo-badge__link" href={href} rel="noopener noreferrer" target="_blank">
        <svg aria-hidden="true" className="fb-dojo-badge__mark" viewBox="0 0 139.05405 139.05405">
          <circle cx="69.527023" cy="69.527023" fill="#2f964f" r="69.527023" />
          <g fill="#FFFFFF" transform="matrix(1.0553187,0,0,1.0553187,16.770994,16.77428)">
            <path d="M 93.9,67.1 C 92.9,79.9 73.6,90 50,90 26.4,90 7.1,79.9 6.1,67.1 Z" />
            <path d="m 92.2,59.4 c 0.5,0.9 0.8,1.8 1.1,2.7 H 6.7 C 7,61.2 7.3,60.3 7.8,59.5 8.3,58.5 8.3,57.3 7.6,56.3 5.8,53.6 4.8,50.4 4.8,46.9 c 0,-9.4 7.6,-17 17,-17 7.2,0 13.4,4.5 15.9,10.9 0.5,1.3 1.8,2.1 3.1,1.9 3,-0.3 6.1,-0.5 9.2,-0.5 3.2,0 6.3,0.2 9.2,0.5 1.3,0.2 2.6,-0.6 3.1,-1.8 C 65,33.8 72.1,29 80.2,30 c 7.8,0.9 14.1,7.3 14.9,15.1 0.4,4.1 -0.7,8 -2.8,11.1 -0.6,1 -0.6,2.2 -0.1,3.2 z" />
            <path d="m 65.5,14.8 -7.8,3.9 c -0.3,0.1 -0.6,0.1 -0.8,-0.2 l -6.5,-8.3 c -0.3,-0.3 -0.7,-0.3 -1,0 l -6.2,8.5 C 43,18.9 42.7,19 42.4,18.9 l -8,-4.1 c -0.5,-0.2 -1,0.2 -0.9,0.7 L 36.7,29 c 0.1,0.5 0.6,0.9 1.1,0.9 h 24.5 c 0.5,0 1,-0.4 1.1,-0.9 l 3.1,-13.5 c 0,-0.5 -0.5,-0.9 -1,-0.7 z" />
          </g>
          <g fill="#2F964F" transform="matrix(1.0553187,0,0,1.0553187,16.770994,16.77428)">
            <path d="m 21.8,41.8 c 2.8,0 5.1,2.3 5.1,5.1 0,2.8 -2.3,5.1 -5.1,5.1 -2.8,0 -5.1,-2.3 -5.1,-5.1 0,-2.9 2.3,-5.1 5.1,-5.1 m 0,-7.7 c -7,0 -12.7,5.7 -12.7,12.7 0,7 5.7,12.7 12.7,12.7 7,0 12.7,-5.7 12.7,-12.7 0,-7 -5.7,-12.7 -12.7,-12.7 z" />
            <path d="m 78.2,41.8 c 2.8,0 5.1,2.3 5.1,5.1 0,2.8 -2.3,5.1 -5.1,5.1 -2.8,0 -5.1,-2.3 -5.1,-5.1 0.1,-2.9 2.3,-5.1 5.1,-5.1 m 0,-7.7 c -7,0 -12.7,5.7 -12.7,12.7 0,7 5.7,12.7 12.7,12.7 7,0 12.7,-5.7 12.7,-12.7 0,-7 -5.7,-12.7 -12.7,-12.7 z" />
          </g>
        </svg>
        Made with FrogBot · Share your own
      </a>
      <button
        aria-label="Hide Made with FrogBot badge"
        className="fb-dojo-badge__close"
        onClick={hide}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Wraps every FrogBot page on Dojo. Renders `children` untouched, then a "Made with FrogBot" pill
 * once the page has hydrated, so server HTML never changes and a badge error can't break the page.
 */
export function DojoBadge({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <BadgeBoundary>
        <Badge />
      </BadgeBoundary>
    </>
  );
}
