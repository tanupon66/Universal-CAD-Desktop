'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function tryCommand(command, args, timeout = 1500) {
  try {
    return String(execFileSync(command, args, {
      windowsHide: true,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    }) || '').trim();
  } catch { return ''; }
}

function normalizeHardwareValue(value) {
  const text = String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!text) return '';
  const compact = text.replace(/[\s-]/g, '');
  const blocked = new Set([
    'TOBEFILLEDBYOEM', 'DEFAULTSTRING', 'SYSTEMSERIALNUMBER', 'NONE', 'UNKNOWN',
    'NOTSPECIFIED', 'NOTAPPLICABLE', '0000000000000000', '00000000000000000000000000000000',
    'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  ]);
  if (blocked.has(compact)) return '';
  return text;
}

function windowsMachineGuid() {
  const out = tryCommand('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], 1200);
  const match = out.match(/MachineGuid\s+REG_\w+\s+([^\r\n]+)/i);
  return match ? normalizeHardwareValue(match[1]) : '';
}

function windowsBiosUuid(timeout = 2500) {
  const script = '(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID';
  const out = tryCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], timeout);
  return normalizeHardwareValue(out.split(/\r?\n/).map((s) => s.trim()).find((s) => /^[0-9A-Fa-f-]{16,}$/.test(s)) || '');
}

function fallbackFacts() {
  const macs = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item && !item.internal && item.mac && item.mac !== '00:00:00:00:00:00') macs.push(item.mac.toLowerCase());
    }
  }
  return {
    hostname: normalizeHardwareValue(os.hostname()),
    arch: normalizeHardwareValue(os.arch()),
    platform: normalizeHardwareValue(os.platform()),
    macs: macs.sort(),
  };
}

function fallbackSeed() {
  const f = fallbackFacts();
  return `fallback|${f.platform}|${f.arch}|${f.hostname}|${f.macs.join(',')}`;
}

function machineSeedFromReliableSources(machineGuid, fallback = fallbackSeed()) {
  const guid = normalizeHardwareValue(machineGuid);
  if (guid) return `win-registry-v1|GUID:${guid}`;
  return fallback;
}

function machineSeed() {
  if (process.platform === 'win32') return machineSeedFromReliableSources(windowsMachineGuid());
  return fallbackSeed();
}

function formatMachineIdFromSeed(seed) {
  const hash = crypto.createHash('sha256').update(String(seed)).digest('hex').toUpperCase();
  const body = hash.slice(0, 24).match(/.{1,4}/g).join('-');
  return `UCAD-${body}`;
}

function computeMachineId() { return formatMachineIdFromSeed(machineSeed()); }

function legacyV027Seed() {
  if (process.platform !== 'win32') return machineSeed();
  const guid = windowsMachineGuid();
  const bios = windowsBiosUuid();
  if (guid || bios) return `win|${guid}|${bios}`;
  return fallbackSeed();
}
function computeLegacyV027MachineId() { return formatMachineIdFromSeed(legacyV027Seed()); }

function powershellJson(script, timeout = 3500) {
  const out = tryCommand('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `$ErrorActionPreference='SilentlyContinue'; ${script} | ConvertTo-Json -Compress`,
  ], timeout);
  if (!out) return {};
  try { return JSON.parse(out); } catch { return {}; }
}

function windowsHardwareFacts() {
  const facts = powershellJson(`
    $csp = Get-CimInstance Win32_ComputerSystemProduct;
    $bb  = Get-CimInstance Win32_BaseBoard | Select-Object -First 1;
    $bios = Get-CimInstance Win32_BIOS | Select-Object -First 1;
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1;
    [PSCustomObject]@{
      systemUuid = $csp.UUID;
      baseboardSerial = $bb.SerialNumber;
      biosSerial = $bios.SerialNumber;
      processorId = $cpu.ProcessorId
    }
  `);
  return {
    systemUuid: normalizeHardwareValue(facts.systemUuid),
    baseboardSerial: normalizeHardwareValue(facts.baseboardSerial),
    biosSerial: normalizeHardwareValue(facts.biosSerial),
    processorId: normalizeHardwareValue(facts.processorId),
  };
}

function v103SeedFromFacts(facts, machineGuid = '') {
  const stable = [
    ['UUID', normalizeHardwareValue(facts?.systemUuid)],
    ['BOARD', normalizeHardwareValue(facts?.baseboardSerial)],
    ['BIOS', normalizeHardwareValue(facts?.biosSerial)],
    ['CPU', normalizeHardwareValue(facts?.processorId)],
  ].filter(([, value]) => value);
  if (stable.length >= 2) return `win-hwv2|${stable.map(([k, v]) => `${k}:${v}`).join('|')}`;
  if (stable.length === 1) return `win-hwv2-fallback|${stable[0][0]}:${stable[0][1]}|GUID:${normalizeHardwareValue(machineGuid)}`;
  return `win-guid-fallback|GUID:${normalizeHardwareValue(machineGuid)}`;
}

function computeV103MachineId() {
  if (process.platform !== 'win32') return computeMachineId();
  return formatMachineIdFromSeed(v103SeedFromFacts(windowsHardwareFacts(), windowsMachineGuid()));
}

function compatibilityMachineIds(primaryId = computeMachineId()) {
  const ids = [];
  for (const getter of [computeLegacyV027MachineId, computeV103MachineId]) {
    try {
      const id = getter();
      if (id && id !== primaryId && !ids.includes(id)) ids.push(id);
    } catch {}
  }
  return ids;
}

module.exports = {
  computeMachineId,
  machineSeed,
  machineSeedFromReliableSources,
  formatMachineIdFromSeed,
  windowsMachineGuid,
  windowsBiosUuid,
  fallbackSeed,
  computeLegacyV027MachineId,
  legacyV027Seed,
  windowsHardwareFacts,
  v103SeedFromFacts,
  machineSeedFromFacts: v103SeedFromFacts,
  computeV103MachineId,
  compatibilityMachineIds,
  normalizeHardwareValue,
};
