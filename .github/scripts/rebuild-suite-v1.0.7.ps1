$ErrorActionPreference = 'Stop'

# Start from the exact v1.0.6 layer that already passed CI and Release.
& "$PSScriptRoot/rebuild-suite-v1.0.6.ps1"

$replacementRoot = Join-Path $PWD '.github/replacements/v1.0.7/files'
$replacementFiles = @(
  'package.json',
  'license-core/feature-catalog.cjs',
  'desktop/preload.cjs',
  'desktop/feature-gate.cjs',
  'master-license-manager/ui/app.js',
  'tests/test-v107-lite-edition.cjs'
)

foreach ($rel in $replacementFiles) {
  $source = Join-Path $replacementRoot $rel
  $target = Join-Path $PWD (Join-Path 'src' $rel)
  if (-not (Test-Path $source)) { throw "Missing v1.0.7 replacement: $rel" }
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item $source $target -Force
}

# Wrapper files only need the Suite version bumped. The embedded CAD Engine stays v0.26.0.
$versionFiles = @(
  'src/BUILD-WINDOWS.cmd',
  'src/customer-license-tool/main.cjs',
  'src/customer-license-tool/ui/index.html',
  'src/desktop/main.cjs',
  'src/desktop/activation.js',
  'src/desktop/activation.html',
  'src/master-license-manager/ui/index.html'
)
foreach ($file in $versionFiles) {
  if (-not (Test-Path $file)) { throw "Missing versioned wrapper file: $file" }
  $resolved = Resolve-Path $file
  $text = [System.IO.File]::ReadAllText($resolved)
  $updated = $text.Replace('1.0.6', '1.0.7')
  if ($updated -eq $text -and $text -notmatch '1\.0\.7') {
    throw "Could not bump Suite version in $file"
  }
  [System.IO.File]::WriteAllText($resolved, $updated, [System.Text.UTF8Encoding]::new($false))
}

$suite = Get-Content 'src/package.json' -Raw | ConvertFrom-Json
$engine = Get-Content 'src/app/package.json' -Raw | ConvertFrom-Json
$version = [string]$suite.version
$engineVersion = [string]$engine.version
if ($version -ne '1.0.7') { throw "Expected Suite 1.0.7, got $version." }
if ($engineVersion -ne '0.26.0') { throw "Expected Engine 0.26.0, got $engineVersion." }

$catalog = Get-Content 'src/license-core/feature-catalog.cjs' -Raw
$preload = Get-Content 'src/desktop/preload.cjs' -Raw
$gate = Get-Content 'src/desktop/feature-gate.cjs' -Raw
$masterUi = Get-Content 'src/master-license-manager/ui/app.js' -Raw
if ($catalog -notmatch "LITE_FEATURES" -or $catalog -notmatch "id: 'lite'" -or $catalog -notmatch "'export\.xml'") {
  throw 'Lite Edition catalog enforcement is missing.'
}
if ($preload -notmatch 'ucad-lite-mode' -or $preload -notmatch 'ucadLiteExportXml' -or $preload -notmatch 'cadExportXmlButton') {
  throw 'Lite Studio shell is missing from preload.'
}
if ($gate -notmatch 'ucad-lite-mode' -or $gate -notmatch 'ucadLiteExportXml') {
  throw 'Lite feature-gate compatibility layer is missing.'
}
if ($masterUi -notmatch "edition\.id==='lite'" -or $masterUi -notmatch "fixed\?'disabled'") {
  throw 'Master Manager Lite feature lock is missing.'
}
if (-not (Test-Path 'src/tests/test-v107-lite-edition.cjs')) { throw 'Lite regression test is missing.' }

"VERSION=$version" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"ENGINE_VERSION=$engineVersion" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"TAG=suite-v$version" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
Write-Host "Suite v$version / Engine v$engineVersion reconstructed with Lite Edition."
