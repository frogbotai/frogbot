import { getFromImportMap } from 'payload/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { brandImportMapErrors } =
  await import('../../../../packages/next/src/utilities/brandImportMapErrors.js');

const installed = Symbol.for('frogbot.brandImportMapErrors');
const originalError = console.error;

let output: ReturnType<typeof vi.fn>;

function lookup(PayloadComponent: string) {
  return getFromImportMap({ importMap: {}, PayloadComponent, schemaPath: '' });
}

beforeEach(() => {
  output = vi.fn();
  console.error = output;

  delete (globalThis as Record<symbol, unknown>)[installed];
});

afterEach(() => {
  console.error = originalError;

  delete (globalThis as Record<symbol, unknown>)[installed];
});

describe('brandImportMapErrors', () => {
  it('reports a missing FrogBot view with FrogBot wording', () => {
    brandImportMapErrors();

    const component = lookup('@frogbotai/next/views#DefaultListView');

    expect(component).toBeUndefined();
    expect(output).toHaveBeenCalledExactlyOnceWith('[frogbot] Component "@frogbotai/next/views#DefaultListView" is missing from the import map. Run `frogbot generate:importmap`, then rebuild or restart the app.');
    expect(JSON.stringify(output.mock.calls)).not.toMatch(/payload/i);
  });

  it('reports a missing custom component with FrogBot wording', () => {
    brandImportMapErrors();

    lookup('/components/Missing#Banner');

    expect(output).toHaveBeenCalledWith(
      '[frogbot] Component "/components/Missing#Banner" is missing from the import map. Run `frogbot generate:importmap`, then rebuild or restart the app.',
    );
  });

  it('reports every missing lookup instead of only the first', () => {
    brandImportMapErrors();

    lookup('/components/Missing#Banner');
    lookup('/components/Missing#Banner');

    expect(output).toHaveBeenCalledTimes(2);
  });

  it('passes unrelated console errors through unchanged', () => {
    const error = new Error('database unavailable');

    brandImportMapErrors();

    console.error('[db] connection failed', error);

    expect(output).toHaveBeenCalledWith('[db] connection failed', error);
  });

  it('reports each error once when installed repeatedly', () => {
    brandImportMapErrors();
    brandImportMapErrors();

    lookup('/components/Missing#Banner');

    expect(output).toHaveBeenCalledOnce();
  });

  it('stays quiet when the component is in the import map', () => {
    brandImportMapErrors();

    const Banner = () => null;
    const component = getFromImportMap({
      importMap: { '/components/Banner#Banner': Banner },
      PayloadComponent: '/components/Banner#Banner',
      schemaPath: '',
    });

    expect(component).toBe(Banner);
    expect(output).not.toHaveBeenCalled();
  });
});
