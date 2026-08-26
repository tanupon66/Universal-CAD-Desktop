'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EDITION_PRESETS, LITE_FEATURES, resolveEdition } = require('../license-core/feature-catalog.cjs');

assert.deepEqual([...LITE_FEATURES], ['export.xml']);
assert.equal(EDITION_PRESETS.lite.id, 'lite');
assert.equal(EDITION_PRESETS.lite.displayName, 'Universal CAD Studio Lite');
assert.deepEqual([...EDITION_PRESETS.lite.features], ['export.xml']);
const forced = resolveEdition('lite', ['cad.edit', 'mapping', 'export.xml'], 'Universal CAD Studio Lite');
assert.equal(forced.id, 'lite');
assert.deepEqual(forced.features, ['export.xml'], 'Lite must ignore extra selected features and remain XML-export-only');

const preload = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'preload.cjs'), 'utf8');
const featureGate = fs.readFileSync(path.join(__dirname, '..', 'desktop', 'feature-gate.cjs'), 'utf8');
const masterUi = fs.readFileSync(path.join(__dirname, '..', 'master-license-manager', 'ui', 'app.js'), 'utf8');
for (const source of [preload, featureGate]) {
  assert.match(source, /editionId[^\n]+lite/);
  assert.match(source, /ucad-lite-mode/);
  assert.match(source, /ucadLiteExportXml/);
  assert.match(source, /\.right-panel\{display:none!important\}/);
  assert.match(source, /\.workspace-toolbar,body\.ucad-lite-mode \.table-panel\{display:none!important\}/);
  assert.match(source, /projectFile/);
  assert.match(source, /cadExportXmlButton/);
}
assert.match(masterUi, /edition\.id==='lite'/);
assert.match(masterUi, /fixed\?'disabled'/);
console.log('v1.0.7 Lite edition / minimal shell tests: PASS');
