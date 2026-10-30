'use client';

import { createContext, use, useEffect, useRef, useState } from 'react';

import { prefersReducedMotion } from './user-scroll.js';

const hiddenFrame = 200;

const alpha = 0.99;

const gamma = 1e-5;

function solve(f: (x: number) => number, low: number, high: number, tolerance = 0.01) {
  if (low === high) return low;

  let lowF = f(low);

  if (lowF > tolerance || f(high) < -tolerance) throw new Error('No root in range');

  while (lowF < -tolerance) {
    const middle = (low + high) / 2;

    if (!(middle > low && middle < high)) break;

    const value = f(middle);

    if (value <= 0) {
      low = middle;
      lowF = value;
    } else high = middle;
  }

  return low;
}

/**
 * Reveals streamed text character by character at a rate that adapts to how fast it arrives,
 * about 0.3s behind it: Claude for Chrome's smoother. Times are in milliseconds.
 */
export class TextSmoother {
  text: string;
  private arrivals: Array<[number, number]>;
  private start: number | undefined;
  private velocity = 100;
  private x: number;
  private t = 0;

  constructor(seed: string) {
    this.text = seed;
    this.x = seed.length;
    this.arrivals = [[-9999, seed.length]];
  }

  add(chunk: string, now: number) {
    this.text += chunk;

    this.start ??= now;
    this.arrivals.push([(now - this.start) / 1000, this.text.length]);
  }

  revealed(now: number) {
    if (this.start === undefined || this.x >= this.text.length) return this.text.slice(0, this.x);

    const elapsed = (now - this.start) / 1000;
    const dt = Math.max(elapsed - this.t, 1e-6);
    const arrived = this.arrivals.at(-1)![1];
    const cutoff = 0.9 * elapsed - 0.3;
    let due = 0;

    for (let index = this.arrivals.length - 1; index >= 0; index--) {
      if (this.arrivals[index][0] < cutoff) {
        due = this.arrivals[index][1];
        break;
      }
    }

    const low = Math.max(due, this.x);
    const high = Math.min(arrived, this.text.length);

    try {
      if (low >= high) this.x = high;
      else {
        const cost = (x: number) =>
          2 * gamma * (1 / dt) * ((x - this.x) / dt - this.velocity) -
          1 / (x - due + 0.1) +
          1 / (arrived - x + 0.1);

        const next = solve(cost, low, high);

        this.velocity = alpha * this.velocity + (1 - alpha) * ((next - this.x) / dt);
        this.x = Math.max(next, this.x);
      }
    } catch {
      this.x = Math.max(Math.min(Math.floor(this.velocity * elapsed), this.text.length), this.x);
    }

    this.t = elapsed;

    return this.text.slice(0, Math.floor(this.x));
  }
}

/**
 * Whether the message around a part is still streaming. `MessageList` sets it to false for
 * every message except a pending last one, so a part left in state "streaming" by Stop, a stream
 * error or a reload shows in full. Without a list around it, a part's own state decides.
 */
export const LiveContext = createContext(true);

/**
 * Whether a part in state `state` is still being written: its own state and its message's.
 */
export function useLive(state: 'streaming' | 'done' | undefined) {
  return use(LiveContext) && state === 'streaming';
}

/**
 * `text` as it should show. While `live`, new text is revealed by a `TextSmoother` on each
 * animation frame, or every 200ms while the tab is hidden. Text already there on mount, text
 * once `live` ends, and all text under reduced motion shows in full.
 */
export function usePacedText(text: string, live: boolean) {
  const paced = live && !prefersReducedMotion();
  const [shown, setShown] = useState(text);
  const smoother = useRef<TextSmoother>(undefined);

  useEffect(() => {
    const current = smoother.current;

    if (!paced) {
      smoother.current = undefined;

      return;
    }

    if (current && text.startsWith(current.text)) {
      if (text.length > current.text.length) {
        current.add(text.slice(current.text.length), performance.now());
      }

      return;
    }

    smoother.current = new TextSmoother(text);
    setShown(text);
  }, [paced, text]);

  useEffect(() => {
    if (!paced) return;

    let request: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const next = smoother.current?.revealed(performance.now());

      if (next !== undefined) setShown(next);

      if (document.hidden) timer = setTimeout(tick, hiddenFrame);
      else request = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (request !== undefined) cancelAnimationFrame(request);

      clearTimeout(timer);
    };
  }, [paced]);

  return paced && text.startsWith(shown) ? shown : text;
}
