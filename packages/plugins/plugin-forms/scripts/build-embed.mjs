#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = path.join(root, 'dist', 'embed', 'assets');
const ui = path.dirname(createRequire(import.meta.url).resolve('@frogbotai/ui/styles.css'));

const styles = [
  'layers.css',
  'payload-tokens.css',
  'theme.css',
  'reset.css',
  'base.css',
  'components/button.css',
  'components/checkbox.css',
  'components/input.css',
  'components/label.css',
  'components/radio-group.css',
  'components/select.css',
  'components/textarea.css',
  'forms/form.css',
];

await Promise.all([
  build({
    entryPoints: [path.join(root, 'src', 'embed', 'client.tsx')],
    outfile: path.join(outdir, 'form.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  }),
  build({
    stdin: {
      contents: styles.map((file) => `@import ${JSON.stringify(`./${file}`)};`).join('\n'),
      loader: 'css',
      resolveDir: ui,
    },
    outfile: path.join(outdir, 'form.css'),
    bundle: true,
    minify: true,
    loader: { '.woff2': 'empty' },
    logLevel: 'warning',
  }),
]);
