import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const nextRoot = path.resolve('templates/blank/.next');
fs.rmSync(nextRoot, { recursive: true, force: true });
execFileSync('pnpm', ['--filter', 'blank...', 'build'], { stdio: 'inherit' });

const html = fs.readFileSync(path.join(nextRoot, 'server/app/index.html'), 'utf8');

assert.match(html, /data-fb-ui=""/);
assert.match(html, /data-theme="dark"/);
assert.match(html, /--primary:oklch\(0\.7 0\.2 40\)/);
assert.match(html, />Send</);
assert.match(html, />Navigation</);
assert.match(html, /aria-label="Choice"/);
assert.match(html, /localStorage\.getItem/);

const href = html.match(/href="(\/_next\/static\/css\/[^"?]+\.css)"/)?.[1];
assert.ok(href);

const css = fs.readFileSync(path.join(nextRoot, href.replace('/_next/', '')), 'utf8');
assert.ok(css.length > 0);
assert.match(css, /\.bg-background/);
assert.match(css, /var\(--background\)/);
assert.match(css, /data-fb-theme/);

console.log('[test-ui-next] Next rendered the UI package with its compiled stylesheet.');
