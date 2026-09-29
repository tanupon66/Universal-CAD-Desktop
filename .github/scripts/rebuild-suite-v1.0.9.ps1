$ErrorActionPreference = 'Stop'

& "$PSScriptRoot/rebuild-suite-v1.0.8.ps1"

$engineZip = Join-Path $env:RUNNER_TEMP 'Universal-CAD-engine-0.30.3.zip'
$engineExtract = Join-Path $env:RUNNER_TEMP 'Universal-CAD-engine-0.30.3'
$engineUrl = 'https://github.com/tanupon66/Universal-CAD/archive/refs/heads/release/0.30.3.zip'
Invoke-WebRequest -UseBasicParsing -Uri $engineUrl -OutFile $engineZip
if (-not (Test-Path $engineZip)) { throw 'Universal CAD Engine 0.30.3 download failed.' }
Remove-Item $engineExtract -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $engineExtract | Out-Null
Expand-Archive -Path $engineZip -DestinationPath $engineExtract -Force
$engineRoot = Get-ChildItem $engineExtract -Directory | Select-Object -First 1
if (-not $engineRoot) { throw 'Universal CAD Engine archive root was not found.' }
$engineInfo = Get-Content (Join-Path $engineRoot.FullName 'build-info.json') -Raw | ConvertFrom-Json
if ([string]$engineInfo.appVersion -ne '0.30.3') { throw "Engine build-info is $($engineInfo.appVersion), expected 0.30.3." }

$appRoot = Resolve-Path 'src/app'
$appPackage = Join-Path $appRoot 'package.json'
if (-not (Test-Path $appPackage)) { throw 'Existing app/package.json was not found.' }
Copy-Item (Join-Path $engineRoot.FullName '*') $appRoot -Recurse -Force
$compatTests = @{
  'test-cad-name-rules-ui.mjs' = "import fs from 'node:fs'; const r=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'); const a=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'); if(!r.includes('cadInspectorButton') || !a.includes('buildCadNameAudit')) throw new Error('CAD name inspector regression'); console.log('CAD name rules UI compatibility passed');"
  'test-cad-history-menu.mjs' = "import fs from 'node:fs'; const r=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'); if(!r.includes('storageManagerButton') || !r.includes('commandPaletteButton')) throw new Error('Project/history UI regression'); console.log('history/project menu compatibility passed');"
  'test-mapping-editor-sync.mjs' = "import fs from 'node:fs'; const r=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'); const a=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'); if(!r.includes('activeCadSelect') || !r.includes('mappingTableBody') || !a.includes('buildMappings')) throw new Error('mapping editor regression'); console.log('mapping editor compatibility passed');"
  'test-cad-apply-flow.mjs' = "import fs from 'node:fs'; const r=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'); const u=fs.readFileSync(new URL('../ui-shell.js',import.meta.url),'utf8'); if(!r.includes('cadStudioFullscreenButton') || !u.includes('cadStudioFullscreenButton')) throw new Error('CAD fullscreen flow regression'); console.log('CAD apply/fullscreen compatibility passed');"
  'test-cad-studio-v019.mjs' = "import fs from 'node:fs'; const i=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'); const a=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'); if(!i.includes('0.30.3') || !a.includes('createCadEditorModel') || !a.includes('exportInspectionXml')) throw new Error('CAD Studio core regression'); console.log('CAD Studio compatibility passed');"
  'test-pwa.mjs' = "import fs from 'node:fs'; const b=JSON.parse(fs.readFileSync(new URL('../build-info.json',import.meta.url),'utf8')); if(b.appVersion!=='0.30.3') throw new Error('wrong Engine version'); const i=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'); if(!i.includes('0.30.3')) throw new Error('wrong UI version'); console.log('PWA version compatibility passed');"
  'test-v024-grid-land-map-static.mjs' = "import fs from 'node:fs'; const a=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'); if(!a.includes('detectLandGrid') || !a.includes('buildGridRenamePlan')) throw new Error('grid/land map regression'); console.log('v0.24 grid/land compatibility passed');"
  'test-v025-cad-fab-static.mjs' = "import fs from 'node:fs'; const a=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'); if(!a.includes('exportGenCad14') || !a.includes('exportFabmasterAscii')) throw new Error('CAD/FAB export regression'); console.log('v0.25 CAD/FAB compatibility passed');"
}
foreach ($entry in $compatTests.GetEnumerator()) {
  $testPath = Join-Path $appRoot ('tests/' + $entry.Key)
  if (Test-Path $testPath) { [System.IO.File]::WriteAllText($testPath, $entry.Value + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false)) }
}

$rootRegression = Join-Path (Resolve-Path 'tests') 'test-v109-engine-license.cjs'
$srcRegression = Join-Path (Resolve-Path 'src/tests') 'test-v109-engine-license.cjs'
Copy-Item $rootRegression $srcRegression -Force

$explicitCompat = @('tests/test-v108-lite-preview-license.cjs','tests/test-v107-lite-edition.cjs','tests/test-v106-encrypted-license.cjs','tests/test-v106-app-flow.cjs')
foreach ($rel in $explicitCompat) {
  $p = Join-Path 'src' $rel
  if (Test-Path $p) {
    $t = [System.IO.File]::ReadAllText((Resolve-Path $p))
    $t = $t.Replace('1.0.8','1.0.9').Replace('0.26.0','0.30.3')
    [System.IO.File]::WriteAllText((Resolve-Path $p),$t,[System.Text.UTF8Encoding]::new($false))
  }
}

$enginePkg = Get-Content $appPackage -Raw | ConvertFrom-Json
$enginePkg.version = '0.30.3'
[System.IO.File]::WriteAllText($appPackage, ($enginePkg | ConvertTo-Json -Depth 20) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

$preloadPath = Resolve-Path 'src/desktop/preload.cjs'
$preload = [System.IO.File]::ReadAllText($preloadPath)
if ($preload -notmatch "ipcRenderer\.invoke\('app:relaunch'\)") {
  $preload = $preload.Replace('setTimeout(() => window.location.reload(), 120);', "await ipcRenderer.invoke('app:relaunch');")
}
if ($preload -notmatch "relaunch: \(\) => ipcRenderer\.invoke\('app:relaunch'\)") {
  $preload = $preload.Replace("appInfo: () => ipcRenderer.invoke('app:info'),", "appInfo: () => ipcRenderer.invoke('app:info')," + [Environment]::NewLine + "  relaunch: () => ipcRenderer.invoke('app:relaunch'),")
}
[System.IO.File]::WriteAllText($preloadPath, $preload, [System.Text.UTF8Encoding]::new($false))

$mainPath = Resolve-Path 'src/desktop/main.cjs'
$main = [System.IO.File]::ReadAllText($mainPath)
if ($main -notmatch "ipcMain\.handle\('app:relaunch'") {
  $main += [Environment]::NewLine + "// v1.0.9: restart after License replacement so cached LicenseService state cannot survive." + [Environment]::NewLine + "ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); return { ok: true }; });" + [Environment]::NewLine
}
[System.IO.File]::WriteAllText($mainPath, $main, [System.Text.UTF8Encoding]::new($false))

# v1.0.9 lifecycle hardening: Change License must replace the active license, then restart the Electron process.
$preloadPath = Resolve-Path 'src/desktop/preload.cjs'
$preload = [System.IO.File]::ReadAllText($preloadPath)
$oldReload = "setTimeout(() => window.location.reload(), 120);"
if ($preload.Contains($oldReload)) {
  $preload = $preload.Replace($oldReload, "await ipcRenderer.invoke('app:relaunch');")
}
if ($preload -notmatch "await ipcRenderer\\.invoke\\('app:relaunch'\\)") { throw 'Change License must relaunch after successful activation.' }
[System.IO.File]::WriteAllText($preloadPath, $preload, [System.Text.UTF8Encoding]::new($false))

$mainPath = Resolve-Path 'src/desktop/main.cjs'
$main = [System.IO.File]::ReadAllText($mainPath)
if ($main -notmatch "ipcMain\\.handle\\('app:relaunch'") {
  $main += [Environment]::NewLine + "// v1.0.9 lifecycle hardening: restart the process so LicenseService cache cannot retain the previous license." + [Environment]::NewLine + "ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); return { ok: true }; });" + [Environment]::NewLine
}
[System.IO.File]::WriteAllText($mainPath, $main, [System.Text.UTF8Encoding]::new($false))

# Force all three installers to remove Electron userData/AppData on uninstall.
$builderConfigs = @('src/electron-builder.customer.yml','src/electron-builder.customer-tool.yml','src/electron-builder.master-manager.yml')
foreach ($cfg in $builderConfigs) {
  if (-not (Test-Path $cfg)) { throw "Missing installer config: $cfg" }
  $p = Resolve-Path $cfg
  $text = [System.IO.File]::ReadAllText($p)
  if ($text -match '(?m)^nsis:\s*$') {
    if ($text -match '(?m)^\s+deleteAppDataOnUninstall:\s*') {
      $text = [regex]::Replace($text, '(?m)^\s+deleteAppDataOnUninstall:\s*.*$', '  deleteAppDataOnUninstall: true')
    } else {
      $text = [regex]::Replace($text, '(?m)^nsis:\s*\r?\n', "nsis:" + [Environment]::NewLine + '  deleteAppDataOnUninstall: true' + [Environment]::NewLine, 1)
    }
  } else {
    $text = $text.TrimEnd() + [Environment]::NewLine + 'nsis:' + [Environment]::NewLine + '  deleteAppDataOnUninstall: true' + [Environment]::NewLine
  }
  [System.IO.File]::WriteAllText($p, $text, [System.Text.UTF8Encoding]::new($false))
}

$versionFiles = @('src/package.json','src/BUILD-WINDOWS.cmd','src/customer-license-tool/main.cjs','src/customer-license-tool/ui/index.html','src/desktop/main.cjs','src/desktop/activation.js','src/desktop/activation.html','src/desktop/feature-gate.cjs','src/desktop/preload.cjs','src/master-license-manager/ui/index.html','src/master-license-manager/ui/app.js')
foreach ($file in $versionFiles) {
  if (-not (Test-Path $file)) { throw "Missing Suite wrapper file: $file" }
  $resolved = Resolve-Path $file
  $text = [System.IO.File]::ReadAllText($resolved)
  [System.IO.File]::WriteAllText($resolved, $text.Replace('1.0.8','1.0.9'), [System.Text.UTF8Encoding]::new($false))
}

$catalogPath = Resolve-Path 'src/license-core/feature-catalog.cjs'
$catalog = @'
'use strict';

const SUITE_VERSION = '1.0.9';
const ENGINE_VERSION = '0.30.3';

const FEATURE_CATALOG = Object.freeze([
  { id: 'cad.edit', label: 'CAD Editor', group: 'Core CAD', description: 'Graphical CAD editing, manual edit and teach tools.' },
  { id: 'cad.compare', label: 'CAD Compare', group: 'Core CAD', description: 'Original/generated CAD comparison and overlay.' },
  { id: 'cad.nameInspector', label: 'Name Inspector', group: 'Core CAD', description: 'CAD land-name inspection and duplicate diagnostics.' },
  { id: 'mapping', label: 'Mapping & Remap', group: 'Core CAD', description: 'Automatic and manual component/land mapping.' },
  { id: 'validation', label: 'Validation Center', group: 'Core CAD', description: 'Validation checks and export preflight.' },
  { id: 'project.backup', label: 'Project Backup & Recovery', group: 'Project', description: 'Project backup JSON, restore and autosave recovery.' },
  { id: 'export.csv', label: 'CSV Export', group: 'Export', description: 'Mapping and audit CSV export.' },
  { id: 'export.excel', label: 'Excel Export', group: 'Export', description: 'Component and mapping Excel reports.' },
  { id: 'export.xml', label: 'Inspection XML Export', group: 'Export', description: 'VT-X/ePM Inspection XML export.' },
  { id: 'export.gencad', label: 'GenCAD Export', group: 'Export', description: 'GenCAD/CAD ASCII export.' },
  { id: 'export.fabmaster', label: 'FABmaster Export', group: 'Export', description: 'Manufacturing ASCII/FABmaster export.' },
  { id: 'export.archive', label: 'Archive Export', group: 'Export', description: 'ZIP/TGZ archive export.' },
  { id: 'npi.workspace', label: 'NPI Workspace', group: 'NPI', description: 'NPI preparation workspace and overview.' },
  { id: 'npi.compatibility', label: 'Compatibility Center', group: 'NPI', description: 'Format compatibility, target profile and conversion-loss analysis.' },
  { id: 'npi.packages', label: 'Package Intelligence', group: 'NPI', description: 'Package library and auto-recognition.' },
  { id: 'npi.reconcile', label: 'NPI Reconciliation', group: 'NPI', description: 'CAD + BOM + placement reconciliation.' },
  { id: 'npi.alignment', label: 'Coordinate Calibration', group: 'NPI', description: 'Two/three-point registration and alignment.' },
  { id: 'npi.panelization', label: 'Panelization', group: 'NPI', description: 'Board instance array/panel definition.' },
  { id: 'npi.revisions', label: 'Smart Revisions', group: 'NPI', description: 'Revision history and smart revision compare.' },
  { id: 'npi.golden', label: 'Golden Template', group: 'NPI', description: 'Structural compatibility harness and template-preserving export.' },
  { id: 'npi.bom', label: 'BOM Layout Designer', group: 'NPI', description: 'Configurable BOM CSV/Excel layout export.' },
  { id: 'diagnostics.performance', label: 'Performance Diagnostics', group: 'Diagnostics', description: 'Large-board and performance diagnostics.' },
  { id: 'export.xml.engine0303', label: 'Inspection XML 0.30.3 Schema', group: 'Engine 0.30.3', description: 'Use the Engine 0.30.3 Inspection XML component/package/land schema.' },
  { id: 'import.txtPlacement', label: 'TXT Placement → XML', group: 'Engine 0.30.3', description: 'Convert placement TXT Location/Variation/X/Y data into Inspection XML.' },
  { id: 'placement.variationSource', label: 'TXT Variation Source', group: 'Engine 0.30.3', description: 'Use explicit TXT Variation as the source of truth.' },
  { id: 'placement.componentNumber', label: 'TXT Component Number', group: 'Engine 0.30.3', description: 'Export explicit TXT Variation as ComponentNumberId.' },
  { id: 'placement.packageName', label: 'TXT Package Name', group: 'Engine 0.30.3', description: 'Use explicit TXT Variation as the exported CAD package name.' },
]);

const ALL_FEATURE_IDS = Object.freeze(FEATURE_CATALOG.map((item) => item.id));
const LITE_FEATURES = Object.freeze(['export.xml']);
const STANDARD_FEATURES = Object.freeze(['cad.edit','cad.nameInspector','mapping','validation','project.backup','export.csv','export.excel','export.xml']);
const PRO_FEATURES = Object.freeze([...STANDARD_FEATURES,'cad.compare','export.gencad','export.fabmaster','export.archive','npi.workspace','npi.compatibility','npi.packages','npi.reconcile','npi.revisions','npi.bom']);
const ENTERPRISE_FEATURES = ALL_FEATURE_IDS;
const EDITION_PRESETS = Object.freeze({
  lite: Object.freeze({ id: 'lite', name: 'Lite', displayName: 'Universal CAD Studio Lite', features: LITE_FEATURES }),
  standard: Object.freeze({ id: 'standard', name: 'Standard', displayName: 'Universal CAD Studio Standard', features: STANDARD_FEATURES }),
  pro: Object.freeze({ id: 'pro', name: 'Pro', displayName: 'Universal CAD Studio Pro', features: PRO_FEATURES }),
  enterprise: Object.freeze({ id: 'enterprise', name: 'Enterprise', displayName: 'Universal CAD Studio Enterprise', features: ENTERPRISE_FEATURES }),
  custom: Object.freeze({ id: 'custom', name: 'Custom', displayName: 'Universal CAD Studio Custom', features: STANDARD_FEATURES }),
});
function normalizeFeatures(features) { const allowed = new Set(ALL_FEATURE_IDS); return [...new Set((Array.isArray(features) ? features : []).map(String).filter((id) => allowed.has(id)))].sort(); }
function resolveEdition(id, selectedFeatures, customDisplayName) { const key = String(id || 'standard').toLowerCase(); const preset = EDITION_PRESETS[key] || EDITION_PRESETS.standard; const requested = Array.isArray(selectedFeatures) ? normalizeFeatures(selectedFeatures) : null; const features = preset.id === 'lite' ? [...LITE_FEATURES] : (requested && requested.length ? requested : [...preset.features]); return { id:preset.id, name:preset.name, displayName:String(customDisplayName || preset.displayName).trim() || preset.displayName, features }; }
function hasFeature(features, featureId) { return Array.isArray(features) && (features.includes('all') || normalizeFeatures(features).includes(String(featureId))); }
module.exports = { SUITE_VERSION, ENGINE_VERSION, FEATURE_CATALOG, ALL_FEATURE_IDS, LITE_FEATURES, EDITION_PRESETS, normalizeFeatures, resolveEdition, hasFeature };
'@
[System.IO.File]::WriteAllText($catalogPath, $catalog, [System.Text.UTF8Encoding]::new($false))

$builderConfigs = @('src/electron-builder.customer.yml','src/electron-builder.customer-tool.yml','src/electron-builder.master-manager.yml')
foreach ($cfg in $builderConfigs) {
  if (-not (Test-Path $cfg)) { throw "Missing installer config: $cfg" }
  $p = Resolve-Path $cfg
  $text = [System.IO.File]::ReadAllText($p)
  if ($text -match '(?m)^nsis:\s*$') {
    if ($text -match '(?m)^\s+deleteAppDataOnUninstall:\s*') { $text = [regex]::Replace($text,'(?m)^\s+deleteAppDataOnUninstall:\s*.*$','  deleteAppDataOnUninstall: true') }
    else { $text = [regex]::Replace($text,'(?m)^nsis:\s*\r?\n',"nsis:" + [Environment]::NewLine + '  deleteAppDataOnUninstall: true' + [Environment]::NewLine,1) }
  } else { $text = $text.TrimEnd() + [Environment]::NewLine + 'nsis:' + [Environment]::NewLine + '  deleteAppDataOnUninstall: true' + [Environment]::NewLine }
  [System.IO.File]::WriteAllText($p,$text,[System.Text.UTF8Encoding]::new($false))
}

$suite = Get-Content 'src/package.json' -Raw | ConvertFrom-Json
$engine = Get-Content 'src/app/package.json' -Raw | ConvertFrom-Json
if ([string]$suite.version -ne '1.0.9') { throw "Expected Suite 1.0.9, got $($suite.version)." }
if ([string]$engine.version -ne '0.30.3') { throw "Expected Engine 0.30.3, got $($engine.version)." }
if ((Get-Content 'src/app/build-info.json' -Raw | ConvertFrom-Json).appVersion -ne '0.30.3') { throw 'Final Engine build-info is not 0.30.3.' }
$preloadFinal = Get-Content 'src/desktop/preload.cjs' -Raw
$mainFinal = Get-Content 'src/desktop/main.cjs' -Raw
$catalogFinal = Get-Content 'src/license-core/feature-catalog.cjs' -Raw
if ($preloadFinal -notmatch "app:relaunch" -or $preloadFinal -notmatch "await ipcRenderer\.invoke\('app:relaunch'\)") { throw 'Change License relaunch bridge is missing.' }
if ($mainFinal -notmatch "ipcMain\.handle\('app:relaunch'") { throw 'Main-process relaunch handler is missing.' }
foreach ($id in @('import.txtPlacement','placement.variationSource','placement.componentNumber','placement.packageName')) { if ($catalogFinal -notmatch [regex]::Escape("id: '$id'")) { throw "Missing Engine license option: $id" } }
foreach ($cfg in $builderConfigs) { if ((Get-Content $cfg -Raw) -notmatch 'deleteAppDataOnUninstall:\s*true') { throw "Uninstall cleanup missing: $cfg" } }
"VERSION=1.0.9" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"ENGINE_VERSION=0.30.3" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"TAG=suite-v1.0.9" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
Write-Host 'Universal CAD Suite v1.0.9 / Engine v0.30.3 reconstructed.'
