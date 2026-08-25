import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pwaWorkbox } from '../pwa-config.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, '..');
const distributionDirectory = path.join(frontendDirectory, 'dist');

const readDistributionFile = async (filename) =>
  readFile(path.join(distributionDirectory, filename), { encoding: 'utf8' });

const manifest = JSON.parse(await readDistributionFile('site.webmanifest'));
const serviceWorker = await readDistributionFile('sw.js');

assert.equal(manifest.id, '/', 'PWA manifest must keep a stable root app id');
assert.equal(manifest.start_url, '/dashboard', 'PWA must launch into the authenticated dashboard route');
assert.equal(manifest.scope, '/', 'PWA must control the full application scope');
assert.equal(manifest.display, 'standalone', 'PWA must launch without browser chrome when installed');

const iconPurposes = new Set(
  (manifest.icons ?? []).flatMap((icon) =>
    String(icon.purpose ?? 'any')
      .split(/\s+/)
      .filter(Boolean),
  ),
);
assert(iconPurposes.has('any'), 'PWA manifest must provide a general-purpose icon');
assert(iconPurposes.has('maskable'), 'PWA manifest must provide a maskable icon');
assert((manifest.screenshots ?? []).some((screenshot) => screenshot.form_factor === 'narrow'));
assert((manifest.screenshots ?? []).some((screenshot) => screenshot.form_factor === 'wide'));
assert((manifest.shortcuts ?? []).length > 0, 'PWA manifest must expose at least one app shortcut');

assert(serviceWorker.length > 0, 'Generated service worker must not be empty');

const routeFor = ({ pathname, method = 'GET' }) =>
  pwaWorkbox.runtimeCaching.find(
    (route) =>
      (route.method ?? 'GET') === method &&
      route.urlPattern({
        request: { method },
        sameOrigin: true,
        url: new URL(pathname, 'https://moneymatter.test'),
      }),
  );

assert.equal(routeFor({ pathname: '/config.js' })?.handler, 'NetworkFirst');
assert.equal(routeFor({ pathname: '/version.json' })?.handler, 'NetworkOnly');
assert.equal(routeFor({ pathname: '/api/v1/accounts' })?.handler, 'NetworkOnly');
assert.equal(routeFor({ pathname: '/api/v1/accounts', method: 'POST' }), undefined);
assert.equal(routeFor({ pathname: '/assets/app.js' }), undefined);

console.log('PWA build contract passed.');
