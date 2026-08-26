'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeStorage } = require('electron');
const { computeMachineId } = require('../desktop/machine-id.cjs');
const { createEnrollmentCode, fingerprintPublicKey } = require('../license-core/host-seal.cjs');

class HostIdentity {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'license-host-identity.dat');
  }
  _hostId() {
    const machine = computeMachineId();
    return `UCAD-HOST-${machine.replace(/^UCAD-/, '')}`;
  }
  _write(record) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available.');
    fs.mkdirSync(path.dirname(this.filePath), { recursive:true });
    const temp = `${this.filePath}.tmp-${process.pid}`;
    fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(record)), { mode:0o600 });
    fs.renameSync(temp, this.filePath);
  }
  _read() {
    if (!fs.existsSync(this.filePath)) return null;
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available.');
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(this.filePath)));
  }
  ensure() {
    let record = this._read();
    // A previously created License Host identity is authoritative. Do not rotate it
    // merely because the Studio Machine ID algorithm or Windows installation changes.
    if (record && record.schema === 'ucad-license-host-identity-v1' && record.hostId && record.privateKeyPem && record.publicKeyPem) {
      try {
        const privateKey = crypto.createPrivateKey(record.privateKeyPem);
        const derived = crypto.createPublicKey(privateKey).export({ type:'spki', format:'pem' });
        if (String(derived).trim() === String(record.publicKeyPem).trim()) return record;
      } catch {}
    }
    const hostId = this._hostId();
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
    record = {
      schema:'ucad-license-host-identity-v1',
      hostId,
      publicKeyPem:publicKey.export({ type:'spki', format:'pem' }),
      privateKeyPem:privateKey.export({ type:'pkcs8', format:'pem' }),
      createdAt:new Date().toISOString(),
    };
    this._write(record);
    return record;
  }
  publicInfo() {
    const r = this.ensure();
    return {
      hostId:r.hostId,
      publicKeyPem:r.publicKeyPem,
      fingerprint:fingerprintPublicKey(r.publicKeyPem),
      enrollmentCode:createEnrollmentCode(r),
      createdAt:r.createdAt,
    };
  }
  privateInfo() { return this.ensure(); }
  currentHostId() { const record = this._read(); return record?.hostId || this._hostId(); }
  restore(record) {
    if (!record || record.schema !== 'ucad-license-host-identity-v1') throw new Error('Unsupported Recovery Host Identity.');
    const privateKey = crypto.createPrivateKey(record.privateKeyPem);
    const derived = crypto.createPublicKey(privateKey).export({ type:'spki', format:'pem' });
    if (String(derived).trim() !== String(record.publicKeyPem).trim()) throw new Error('Recovery Host key pair mismatch.');
    this._write(record);
    return record;
  }
}
module.exports = { HostIdentity };
