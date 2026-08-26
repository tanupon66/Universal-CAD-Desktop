'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert');
const ROOT=path.join(__dirname,'..');
const machine=fs.readFileSync(path.join(ROOT,'desktop','machine-id.cjs'),'utf8');
const host=fs.readFileSync(path.join(ROOT,'customer-license-tool','host-identity.cjs'),'utf8');
const master=fs.readFileSync(path.join(ROOT,'master-license-manager','main.cjs'),'utf8');
const preload=fs.readFileSync(path.join(ROOT,'master-license-manager','preload.cjs'),'utf8');
assert(machine.includes('Get-CimInstance Win32_ComputerSystemProduct'),'v1.0.0-v1.0.3 identity compatibility path must be retained');
assert(machine.includes('computeV103MachineId'),'v1.0.3 machine compatibility must be retained');
assert(machine.includes('computeLegacyV027MachineId'),'v0.26/v0.27 machine compatibility must be retained');
assert(machine.includes('win-registry-v1|GUID:'),'v1.0.4 registry-first primary Machine ID missing');
assert(host.includes("record.schema === 'ucad-license-host-identity-v1'"),'existing License Host identity preservation missing');
assert(master.includes('master:remove-key'),'Remove Master Key handler missing');
assert(preload.includes('removeKey'),'Remove Master Key bridge missing');
for(const rel of ['desktop/activation.html','desktop/activation.js','customer-license-tool/ui/index.html','customer-license-tool/ui/app.js','master-license-manager/ui/index.html','master-license-manager/ui/app.js']){
 const t=fs.readFileSync(path.join(ROOT,rel),'utf8');
 assert(!/[\u0E00-\u0E7F]/.test(t),`${rel} contains Thai product UI text`);
}
console.log('v1.0.4 compatibility/product regression tests: PASS');
