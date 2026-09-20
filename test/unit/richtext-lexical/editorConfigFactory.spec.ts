import { describe, expect, it, vi } from 'vitest';

import { editorConfigFactory } from '../../../packages/richtext-lexical/src/utilities/editorConfigFactory.js';

describe('editorConfigFactory', () => {
  it('resolves the internal config before invoking an editor provider', async () => {
    const payloadConfig = { marker: 'payload-config' };
    const editorConfig = { features: [], lexical: {}, resolvedFeatureMap: new Map() };
    const editor = vi.fn(async () => ({ editorConfig }));
    const config = Promise.resolve({
      _internal: { payloadConfig: Promise.resolve(payloadConfig) },
    });

    const result = await editorConfigFactory.fromEditor({
      config: config as never,
      editor: editor as never,
      isRoot: true,
      parentIsLocalized: true,
    });

    expect(result).toBe(editorConfig);
    expect(editor).toHaveBeenCalledWith({
      config: payloadConfig,
      isRoot: true,
      parentIsLocalized: true,
    });
  });

  it('returns sanitized field editor config synchronously', () => {
    const editorConfig = { features: [], lexical: {}, resolvedFeatureMap: new Map() };

    const result = editorConfigFactory.fromField({
      field: { editor: { editorConfig }, type: 'richText' } as never,
    });

    expect(result).toBe(editorConfig);
  });

  it('rejects raw configs and unsanitized fields without providers', async () => {
    await expect(editorConfigFactory.default({ config: {} as never })).rejects.toThrow(
      'requires a config returned by buildConfig',
    );
    await expect(
      editorConfigFactory.fromUnsanitizedField({
        config: {} as never,
        field: { editor: {}, type: 'richText' } as never,
      }),
    ).rejects.toThrow('requires a Lexical editor provider');
  });

  it('rejects non-Lexical objects that expose editorConfig', () => {
    expect(() =>
      editorConfigFactory.fromField({
        field: { editor: { editorConfig: {} }, type: 'richText' } as never,
      }),
    ).toThrow('requires a sanitized Lexical editor');
  });
});
