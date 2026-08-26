'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  machineSeedFromReliableSources,
  formatMachineIdFromSeed,
  v103SeedFromFacts,
} = require('../desktop/machine-id.cjs');

const fallback = 'fallback|WIN32|X64|QC-PC|AA:BB:CC:DD:EE:FF';
const registrySeed = machineSeedFromReliableSources('ABC-123', fallback);
assert.equal(registrySeed, 'win-registry-v1|GUID:ABC-123');
assert.match(formatMachineIdFromSeed(registrySeed), /^UCAD-(?:[0-9A-F]{4}-){5}[0-9A-F]{4}$/);
assert.equal(machineSeedFromReliableSources('', fallback), fallback, 'Machine ID must have a non-WMI fallback');

const oldFacts = { systemUuid:'A1B2-C3D4-E5F6', baseboardSerial:'BOARD-12345', biosSerial:'BIOS-98765', processorId:'CPU-ABCD' };
assert.equal(v103SeedFromFacts(oldFacts, 'OLD-GUID'), 'win-hwv2|UUID:A1B2-C3D4-E5F6|BOARD:BOARD-12345|BIOS:BIOS-98765|CPU:CPU-ABCD');

const service = fs.readFileSync(path.join(__dirname,'..','desktop','license-service.cjs'),'utf8');
assert(service.includes('this.machineId = computeMachineId();'), 'Primary Machine ID must be computed at startup');
assert(!service.includes('this.legacyMachineId = computeLegacyMachineId();'), 'WMI-based legacy ID must not run at startup');
assert(service.includes('_getCompatibilityMachineIds()'), 'Compatibility IDs must be lazy');
console.log('v1.0.4 machine-id resilience tests: PASS');
