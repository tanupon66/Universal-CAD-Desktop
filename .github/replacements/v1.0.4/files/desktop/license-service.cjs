'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');
const { computeMachineId, compatibilityMachineIds } = require('./machine-id.cjs');
const { evaluateLicense, parseLicenseText, LICENSE_SCHEMA } = require('../license-core/license-format.cjs');
const { evaluateMachineLicense, MACHINE_LICENSE_SCHEMA } = require('../license-core/machine-license.cjs');
const { ALL_FEATURE_IDS, SUITE_VERSION, ENGINE_VERSION } = require('../license-core/feature-catalog.cjs');
const { evaluateOwnerLicense, OWNER_LICENSE_SCHEMA } = require('../license-core/owner-license.cjs');

class LicenseService {
  constructor({ userDataPath, publicKeyPath }) {
    this.userDataPath = userDataPath;
    this.publicKeyPath = publicKeyPath;
    this.storePath = path.join(userDataPath, 'license.dat');
    this.publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8');
    // Startup must never depend on WMI/CIM. Primary Machine ID is registry-first.
    this.machineId = computeMachineId();
    this._compatibilityIds = null;
    this._lastTouchWrite = 0;
  }

  getMachineId() { return this.machineId; }

  _getCompatibilityMachineIds() {
    if (!this._compatibilityIds) this._compatibilityIds = compatibilityMachineIds(this.machineId);
    return this._compatibilityIds;
  }

  _readProtectedDocument() {
    if (!fs.existsSync(this.storePath)) return null;
    const blob = fs.readFileSync(this.storePath);
    if (!blob.length) return null;
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available.');
    return JSON.parse(safeStorage.decryptString(blob));
  }

  _writeProtectedRecord(record) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is not available.');
    fs.mkdirSync(this.userDataPath, { recursive: true });
    const encrypted = safeStorage.encryptString(JSON.stringify(record));
    const temp = `${this.storePath}.tmp-${process.pid}`;
    fs.writeFileSync(temp, encrypted, { mode: 0o600 });
    fs.renameSync(temp, this.storePath);
  }

  _evaluate(document, options = {}) {
    if (document?.schema === OWNER_LICENSE_SCHEMA) return evaluateOwnerLicense(document, this.publicKeyPem, options);
    if (document?.schema === MACHINE_LICENSE_SCHEMA) {
      let result = evaluateMachineLicense(document, this.publicKeyPem, this.machineId, options);
      if (!result.ok && result.code === 'MACHINE_MISMATCH') {
        for (const candidate of this._getCompatibilityMachineIds()) {
          result = evaluateMachineLicense(document, this.publicKeyPem, candidate, options);
          if (result.ok || result.code !== 'MACHINE_MISMATCH') break;
        }
      }
      return result;
    }
    if (document?.schema === LICENSE_SCHEMA) {
      let result = evaluateLicense(document, this.publicKeyPem, this.machineId, options);
      if (!result.ok && result.code === 'MACHINE_MISMATCH') {
        for (const candidate of this._getCompatibilityMachineIds()) {
          result = evaluateLicense(document, this.publicKeyPem, candidate, options);
          if (result.ok || result.code !== 'MACHINE_MISMATCH') break;
        }
      }
      if (result.ok) {
        result.payload = {
          ...result.payload,
          editionId: 'legacy',
          editionName: 'Legacy Full',
          productDisplayName: 'Universal CAD Studio Legacy Full',
          features: [...ALL_FEATURE_IDS],
          suiteVersion: SUITE_VERSION,
          engineVersion: ENGINE_VERSION,
          seatNumber: 1,
          seatCount: 1,
        };
      }
      return result;
    }
    return { ok:false, code:'FORMAT', message:'License format is not supported.' };
  }

  status({ touch = false, now = new Date() } = {}) {
    let record;
    try { record = this._readProtectedDocument(); }
    catch (error) { return { ok:false, code:'STORE_ERROR', message:error.message, machineId:this.machineId }; }
    if (!record?.license) return { ok:false, code:'NO_LICENSE', message:'No license has been activated on this computer.', machineId:this.machineId };
    const result = this._evaluate(record.license, {
      now,
      lastSeenUtcMs: record.lastSeenUtcMs,
      clockRollbackToleranceMs: 5 * 60 * 1000,
    });
    if (!result.ok) return { ...result, machineId:this.machineId };
    if (touch && now.getTime() - this._lastTouchWrite > 10 * 60 * 1000) {
      const next = { ...record, lastSeenUtcMs:Math.max(Number(record.lastSeenUtcMs)||0, now.getTime()), lastSeenIso:now.toISOString() };
      try { this._writeProtectedRecord(next); this._lastTouchWrite = now.getTime(); } catch { /* valid status remains */ }
    }
    return { ...result, machineId:this.machineId, activatedAt:record.activatedAt || null };
  }

  activateFromFile(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!resolved.toLowerCase().endsWith('.ucadlic')) throw new Error('Please select a .ucadlic license file.');
    const document = parseLicenseText(fs.readFileSync(resolved, 'utf8'));
    const validation = this._evaluate(document, { now:new Date() });
    if (!validation.ok) { const error = new Error(validation.message); error.code = validation.code; throw error; }
    const now = new Date();
    const record = { license:document, activatedAt:now.toISOString(), lastSeenUtcMs:now.getTime(), lastSeenIso:now.toISOString() };
    this._writeProtectedRecord(record);
    this._lastTouchWrite = now.getTime();
    let consumed = false, consumeWarning = '';
    try { fs.unlinkSync(resolved); consumed = true; }
    catch (error) { consumeWarning = `Activated, but the source license file could not be deleted: ${error.message}`; }
    return { ...validation, machineId:this.machineId, consumed, consumeWarning, activatedAt:now.toISOString() };
  }

  removeLocalLicense() {
    try { fs.unlinkSync(this.storePath); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

module.exports = { LicenseService };
