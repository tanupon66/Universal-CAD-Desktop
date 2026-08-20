# Security

Never commit the Universal CAD Master Password, private signing key, or encrypted issuer master-key document to GitHub history.

The License Manager included here is deliberately keyless at build time. Its encrypted signing key is imported locally on the administrator's machine and stored in Electron's local userData directory. Customer installations contain only the public verification key.
