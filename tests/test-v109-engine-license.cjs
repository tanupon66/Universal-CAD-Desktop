'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const engineRoot = path.join(root, 'app');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const readEngine = (rel) => fs.readFileSync(path.join(engineRoot, rel), 'utf8');

const buildInfo = JSON.parse(readEngine('build-info.json'));
assert.equal(buildInfo.appVersion, '0.30.3', 'Engine build-info must be 0.30.3');
const index = readEngine('index.html');
const appJs = readEngine('app.js');
const placement = readEngine('txt-placement-xml.js');
const inspection = readEngine('inspection-xml-profile.js');
assert.ok(index.includes('0.30.3'), 'Engine UI must be 0.30.3');
assert.match(appJs, /txtPlacementButton|txtPlacementGenerate/, 'TXT placement UI is missing');
assert.match(placement, /Variation|variation/i, 'TXT Variation support is missing');
assert.match(placement, /ComponentNumberId/, 'TXT ComponentNumberId export support is missing');
assert.match(inspection, /packageName|PackageName/i, 'Inspection XML package-name support is missing');
assert.match(inspection, /ComponentNumberCollection/, 'Engine 0.30.3 ComponentNumber XML schema is missing');
assert.match(inspection, /LandNumberCollection/, 'Engine 0.30.3 LandNumber XML schema is missing');
assert.match(placement, /packageName/, 'Engine 0.30.3 TXT packageName source is missing');
const catalog = read('license-core/feature-catalog.cjs');
for (const id of ['export.xml.engine0303','import.txtPlacement','placement.variationSource','placement.componentNumber','placement.packageName']) { assert.ok(catalog.includes("id: '" + id + "'"), 'Missing license option: ' + id); }
const preload = read('desktop/preload.cjs');
const main = read('desktop/main.cjs');
assert.ok(preload.includes('app:relaunch'), 'Change License must expose app relaunch');
assert.ok(preload.includes("await ipcRenderer.invoke('app:relaunch');"), 'Change License must relaunch after activation');
assert.ok(main.includes("ipcMain.handle('app:relaunch'"), 'Main process relaunch handler is missing');
for (const rel of ['electron-builder.customer.yml','electron-builder.customer-tool.yml','electron-builder.master-manager.yml']) { assert.ok(read(rel).includes('deleteAppDataOnUninstall: true'), rel + ' must delete appData on uninstall'); }
console.log('v1.0.9 Engine 0.30.3 + license lifecycle regression: PASS');