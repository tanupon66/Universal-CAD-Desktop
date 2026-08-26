$ErrorActionPreference = 'Stop'

$base = 'Universal-CAD-Suite-v1.0.0-public-source.zip'
if (-not (Test-Path $base)) { throw 'Required v1.0.0 baseline source was not found.' }

Remove-Item src -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path src | Out-Null
Expand-Archive -Path $base -DestinationPath src -Force

# v1.0.3 verified product layer
$parts103 = Get-ChildItem '.github/replacements/v1.0.3/chunks/part-*.txt' -File | Sort-Object Name
if ($parts103.Count -ne 9) { throw 'Suite v1.0.3 replacement bundle is incomplete.' }
$b64103 = ($parts103 | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName) }) -join ''
$v103Zip = Join-Path $env:RUNNER_TEMP 'v1.0.3-replacements.zip'
[System.IO.File]::WriteAllBytes($v103Zip, [Convert]::FromBase64String($b64103))
$v103Expected = '8b2c63f8aee6fab134d1a5b9f31bbfef658176c1d46f5cedf2e7d442e549233a'
$v103Actual = (Get-FileHash $v103Zip -Algorithm SHA256).Hash.ToLower()
if ($v103Actual -ne $v103Expected) { throw "v1.0.3 replacement SHA-256 mismatch: $v103Actual" }
Expand-Archive -Path $v103Zip -DestinationPath src -Force

# v1.0.4 runtime layer
$v104Root = '.github/replacements/v1.0.4/files'
$v104Files = @(
  'desktop/machine-id.cjs',
  'desktop/license-service.cjs',
  'customer-license-tool/host-identity.cjs',
  'customer-license-tool/main.cjs',
  'tests/test-v103-regression.cjs',
  'tests/test-v104-machine-id.cjs'
)
foreach ($rel in $v104Files) {
  $source = Join-Path $v104Root $rel
  $target = Join-Path 'src' $rel
  if (-not (Test-Path $source)) { throw "Missing v1.0.4 replacement: $rel" }
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item $source $target -Force
}

$v104VersionFiles = @(
  'src/package.json','src/BUILD-WINDOWS.cmd','src/desktop/main.cjs','src/desktop/activation.html',
  'src/desktop/activation.js','src/desktop/feature-gate.cjs','src/desktop/preload.cjs',
  'src/customer-license-tool/ui/index.html','src/master-license-manager/ui/index.html','src/license-core/feature-catalog.cjs'
)
foreach ($file in $v104VersionFiles) {
  $text = [System.IO.File]::ReadAllText((Resolve-Path $file))
  [System.IO.File]::WriteAllText((Resolve-Path $file), $text.Replace('1.0.3','1.0.4'), [System.Text.UTF8Encoding]::new($false))
}

# v1.0.5 sandbox/preload layer
$v105Root = '.github/replacements/v1.0.5/files'
$v105Files = @(
  'desktop/preload.cjs',
  'desktop/main.cjs',
  'desktop/activation.js',
  'package.json',
  'tests/test-v105-preload.cjs'
)
foreach ($rel in $v105Files) {
  $source = Join-Path $v105Root $rel
  $target = Join-Path 'src' $rel
  if (-not (Test-Path $source)) { throw "Missing v1.0.5 replacement: $rel" }
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  Copy-Item $source $target -Force
}

$v105VersionFiles = @(
  'src/BUILD-WINDOWS.cmd','src/desktop/activation.html','src/desktop/feature-gate.cjs',
  'src/customer-license-tool/main.cjs','src/customer-license-tool/ui/index.html',
  'src/master-license-manager/ui/index.html','src/license-core/feature-catalog.cjs'
)
foreach ($file in $v105VersionFiles) {
  $text = [System.IO.File]::ReadAllText((Resolve-Path $file))
  [System.IO.File]::WriteAllText((Resolve-Path $file), $text.Replace('1.0.4','1.0.5'), [System.Text.UTF8Encoding]::new($false))
}

# v1.0.6 encrypted-license layer, integrity pinned
$parts106 = Get-ChildItem '.github/replacements/v1.0.6/chunks/part-*.txt' -File | Sort-Object Name
if ($parts106.Count -ne 8) { throw "Suite v1.0.6 replacement bundle is incomplete. Expected 8 chunks, found $($parts106.Count)." }
$b64106 = ($parts106 | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName) }) -join ''
$v106Zip = Join-Path $env:RUNNER_TEMP 'v1.0.6-replacements.zip'
try { $v106Bytes = [Convert]::FromBase64String($b64106) } catch { throw 'v1.0.6 replacement Base64 data is invalid.' }
[System.IO.File]::WriteAllBytes($v106Zip, $v106Bytes)
$v106Expected = 'bb15dfdcea01f8c50d1f8ea91872176e41f34c7b855d91035cd8bc47951d5af3'
$v106Actual = (Get-FileHash $v106Zip -Algorithm SHA256).Hash.ToLower()
if ($v106Actual -ne $v106Expected) { throw "v1.0.6 replacement SHA-256 mismatch. Expected $v106Expected, got $v106Actual." }
Expand-Archive -Path $v106Zip -DestinationPath src -Force

$suite = Get-Content 'src/package.json' -Raw | ConvertFrom-Json
$engine = Get-Content 'src/app/package.json' -Raw | ConvertFrom-Json
$version = [string]$suite.version
$engineVersion = [string]$engine.version
if ($version -ne '1.0.6') { throw "Expected Suite 1.0.6, got $version." }
if ($engineVersion -ne '0.26.0') { throw "Expected Engine 0.26.0, got $engineVersion." }

$envelope = Get-Content 'src/license-core/file-envelope.cjs' -Raw
$master = Get-Content 'src/master-license-manager/main.cjs' -Raw
$customer = Get-Content 'src/customer-license-tool/main.cjs' -Raw
$studioMain = Get-Content 'src/desktop/main.cjs' -Raw
$studioPreload = Get-Content 'src/desktop/preload.cjs' -Raw
if (-not (Test-Path 'src/desktop/device-identity.cjs')) { throw 'Studio device identity module is missing.' }
if (-not (Test-Path 'src/tests/test-v106-encrypted-license.cjs')) { throw 'v1.0.6 encrypted license test is missing.' }
if (-not (Test-Path 'src/tests/test-v106-app-flow.cjs')) { throw 'v1.0.6 encrypted app-flow test is missing.' }
if ($envelope -notmatch 'aes-256-gcm' -or $envelope -notmatch 'diffieHellman' -or $envelope -notmatch 'scrypt') { throw 'Required authenticated encryption primitives are missing.' }
if ($master -notmatch 'sealDocumentForRecipient' -or $master -notmatch 'serializeEncryptedEnvelope') { throw 'Master Manager encrypted entitlement output is missing.' }
if ($customer -notmatch 'parseDeviceRequest' -or $customer -notmatch 'MACHINE_LICENSE_ENVELOPE_SCHEMA') { throw 'Customer Tool encrypted machine-license flow is missing.' }
if ($studioMain -notmatch 'license:device-request' -or $studioPreload -notmatch 'deviceRequest') { throw 'Studio License Request Code bridge is missing.' }

"VERSION=$version" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"ENGINE_VERSION=$engineVersion" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
"TAG=suite-v$version" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
Write-Host "Suite v$version / Engine v$engineVersion reconstructed successfully."
Write-Host "v1.0.6 encrypted-license replacement SHA256=$v106Actual"
