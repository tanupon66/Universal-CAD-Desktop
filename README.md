# Universal CAD Desktop v0.26.0

Windows desktop packaging of Universal CAD Studio v0.25.2 with machine-bound offline licensing.

## Outputs

GitHub Actions builds two Windows x64 NSIS installers:

- `Universal-CAD-Studio-Setup-0.26.0-x64.exe` — customer application
- `Universal-CAD-License-Manager-Setup-0.26.0-x64.exe` — administrator license issuer

The workflow runs the original PWA regression suite plus license/security tests before packaging and publishes SHA-256 checksums.

## License security

The repository and installer **do not contain the private signing key or Master Password**. The customer application contains only the Ed25519 public verification key. On first use, the administrator imports the encrypted master-key JSON into License Manager locally, then enters the Master Password whenever a license is generated.
