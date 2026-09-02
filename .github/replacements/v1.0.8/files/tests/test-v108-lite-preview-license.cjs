'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'license-core', 'feature-catalog.cjs'), 'utf8');

assert.match(preload, /suiteVersion:'1\.0\.8'/, 'Suite version must be 1.0.8 in preload');
assert.match(preload, /function ensureLitePreviewSurface\(\)/, 'Lite preview recovery guard is missing');
assert.match(preload, /\.viewer\.hidden/, 'Lite shell must force a hidden viewer visible again');
assert.match(preload, /\.workspace\.hidden/, 'Lite shell must force a hidden workspace visible again');
assert.match(preload, /MutationObserver/, 'Lite shell must watch renderer view-state changes');
assert.doesNotMatch(preload, /body\.ucad-lite-mode \.modal-overlay\{display:none!important\}/, 'Lite must not globally suppress system modal overlays');
assert.match(preload, /ucadLicensePanel/, 'License information panel is missing');
assert.match(preload, /Change License/, 'Change License control is missing');
assert.match(preload, /license:choose-and-activate/, 'Change License must use the signed activation IPC path');
assert.match(preload, /Valid from/, 'License start date must be displayed');
assert.match(preload, /Expires/, 'License expiry must be displayed');
assert.match(preload, /License period/, 'License duration must be displayed');
assert.match(preload, /Remaining/, 'Remaining license time must be displayed');
assert.match(preload, /notBefore/, 'License date resolver must support notBefore');
assert.match(preload, /notAfter/, 'License date resolver must support notAfter');
assert.match(catalog, /id:\s*'lite'/, 'Lite Edition must remain in the catalog');
assert.match(catalog, /LITE_FEATURES/, 'Lite feature enforcement must remain in the core');
assert.match(catalog, /'export\.xml'/, 'Lite must retain XML export');

console.log('v1.0.8 Lite preview / license management tests: PASS');
