$ErrorActionPreference = 'Stop'

# Start from v1.0.7, which already passed Lite + encrypted-license CI and Release.
& "$PSScriptRoot/rebuild-suite-v1.0.7.ps1"

$replacementRoot = Join-Path $PWD '.github/replacements/v1.0.8/files'
$replacementFiles = @(
  'desktop/preload.cjs',
  'tests/test-v108-lite-preview-license.cjs'
)

foreach ($rel in $replacementFiles) {
  $source = Join-Path $replacementRoot $rel
  $target = Join-Path $PWD (Join-Path 'src' $rel)
  if (-not (Test-Path $source)) { throw "Missing v1.0.8 replacement: $rel" }
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item $source $target -Force
}

# Keep the non-sandbox feature-gate compatibility copy aligned with the runtime fix.
$gatePath = 'src/desktop/feature-gate.cjs'
if (-not (Test-Path $gatePath)) { throw 'desktop/feature-gate.cjs is missing.' }
$gate = [System.IO.File]::ReadAllText((Resolve-Path $gatePath))
$gate = $gate.Replace(
  'body.ucad-lite-mode .viewer{height:100%!important;min-height:480px!important}',
  'body.ucad-lite-mode .viewer,body.ucad-lite-mode .viewer.hidden,body.ucad-lite-mode .viewer[hidden]{display:block!important;visibility:visible!important;opacity:1!important;height:100%!important;min-height:480px!important}'
)
$gate = $gate.Replace('      body.ucad-lite-mode .modal-overlay{display:none!important}' + "`n", '')
[System.IO.File]::WriteAllText((Resolve-Path $gatePath), $gate, [System.Text.UTF8Encoding]::new($false))

# Bump Suite wrapper metadata only. CAD Engine remains v0.26.0.
$versionFiles = @(
  'src/package.json',
  'src/BUILD-WINDOWS.cmd',
  'src/customer-license-tool/main.cjs',
  'src/customer-license-tool/ui/index.html',
  'src/desktop/main.cjs',
  'src/desktop/activation.js',
  'src/desktop/activation.html',
  'src/desktop/feature-gate.cjs',
  'src/master-license-manager/ui/index.html',
  'src/master-license-manager/ui/app.js',
  'src/license-core/feature-catalog.cjs'
)
foreach ($file in $versionFiles) {
  if (-not (Test-Path $file)) { throw "Missing versioned wrapper file: $file" }
  $resolved = Resolve-Path $file
  $text = [System.IO.File]::ReadAllText($resolved)
  $updated = $text.Replace('1.0.7', '1.0.8')
  [System.IO.File]::WriteAllText($resolved, $updated, [System.Text.UTF8Encoding]::new($false))
}

$suite = Get-Content 'src/package.json' -Raw | ConvertFrom-Json
$engine = Get-Content 'src/app/package.json' -Raw | ConvertFrom-Json
$version = [string]$suite.version
$engineVersion = [string]$engine.version
if ($version -ne '1.0.8') { throw "Expected Suite 1.0.8, got $version." }
if ($engineVersion -ne '0.26.0') { throw "Expected Engine 0.26.0, got $engineVersion." }

$preload = Get-Content 'src/desktop/preload.cjs' -Raw
$gate = Get-Content 'src/desktop/feature-gate.cjs' -Raw
if ($preload -notmatch 'ensureLitePreviewSurface' -or $preload -notmatch '\.viewer\.hidden' -or $preload -match 'ucad-lite-mode \.modal-overlay\{display:none!important\}') {
  throw 'v1.0.8 Lite preview recovery fix is missing.'
}
if ($preload -notmatch 'ucadLicensePanel' -or $preload -notmatch 'license:choose-and-activate' -or $preload -notmatch 'License period' -or $preload -notmatch 'Remaining') {
  throw 'v1.0.8 License Management UI is missing.'
}
if ($gate -match 'ucad-lite-mode \.modal-overlay\{display:none!important\}') {
  throw 'Compatibility feature gate still globally suppresses modal overlays.'
}
if (-not (Test-Path 'src/tests/test-v108-lite-preview-license.cjs')) { throw 'v1.0.8 regression test is missing.' }

"VERSION=$version" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"ENGINE_VERSION=$engineVersion" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"TAG=suite-v$version" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
Write-Host "Suite v$version / Engine v$engineVersion reconstructed with Lite preview recovery and License Management."
