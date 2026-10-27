import { describe, expect, it } from 'vitest';

import instantLoader from '../../../packages/next/src/instantLoader.js';

describe('instantLoader', () => {
  it('adds instant = false to a module importing RootLayout', () => {
    const source = `import { handleServerFunctions, RootLayout } from '@frogbotai/next/layouts'

const Layout = ({ children }) => <RootLayout config={config}>{children}</RootLayout>`;

    expect(instantLoader(source)).toBe(`${source}\nexport const instant = false\n`);
  });

  it('adds instant = false to a module importing RootPage across lines', () => {
    const source = `import {
  generatePageMetadata,
  RootPage,
} from "@frogbotai/next/views"

const Page = (args) => RootPage({ config, importMap, ...args })`;

    expect(instantLoader(source)).toBe(`${source}\nexport const instant = false\n`);
  });

  it('adds instant = false when RootLayout is imported under an alias', () => {
    const source = `import { RootLayout as FrogBotLayout } from '@frogbotai/next/layouts'

const Layout = ({ children }) => <FrogBotLayout config={config}>{children}</FrogBotLayout>`;

    expect(instantLoader(source)).toBe(`${source}\nexport const instant = false\n`);
  });

  it('leaves a RootLayout that is not from FrogBot alone', () => {
    const source = `import { RootLayout } from '@/components/RootLayout'

const Layout = ({ children }) => <RootLayout>{children}</RootLayout>`;

    expect(instantLoader(source)).toBe(source);
  });

  it('leaves a module that only imports NotFoundPage alone', () => {
    const source = `import { generatePageMetadata, NotFoundPage } from '@frogbotai/next/views'

const NotFound = (args) => NotFoundPage({ config, importMap, ...args })`;

    expect(instantLoader(source)).toBe(source);
  });

  it('leaves a module that already declares instant alone', () => {
    const source = `import { RootPage } from '@frogbotai/next/views'

export const instant = { level: 'warning' }

const Page = (args) => RootPage({ config, importMap, ...args })`;

    expect(instantLoader(source)).toBe(source);
  });
});
