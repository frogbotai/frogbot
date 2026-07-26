import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const nextRoot = path.resolve('templates/blank/.next');
fs.rmSync(nextRoot, { recursive: true, force: true });
execFileSync('pnpm', ['--filter', 'blank...', 'build'], { stdio: 'inherit' });

const html = fs.readFileSync(path.join(nextRoot, 'server/app/index.html'), 'utf8');

assert.match(html, />FrogBot UI</);
assert.match(html, /class="text-frogbot-ui"/);

const href = html.match(/href="(\/_next\/static\/css\/[^"?]+\.css)"/)?.[1];
assert.ok(href);

const css = fs.readFileSync(path.join(nextRoot, href.replace('/_next/', '')), 'utf8');
assert.ok(css.length > 0);
assert.match(css, /\.text-frogbot-ui/);
assert.match(css, /var\(--frogbot-ui-foreground\)/);

console.log('[test-ui-next] Next rendered FrogBot UI with its compiled stylesheet.');
