'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const { HostIdentity } = require('./host-identity.cjs');
const { CustomerLedger } = require('./ledger.cjs');
const { verifyEntitlement, parseEntitlementText, entitlementDigest } = require('../license-core/entitlement-format.cjs');
const { unsealForHost } = require('../license-core/host-seal.cjs');
const { createMachineLicense, serializeMachineLicense } = require('../license-core/machine-license.cjs');
const { normalizeMachineId, todayLocal } = require('../license-core/license-format.cjs');
const { createRecoveryBundle, openRecoveryBundle } = require('./recovery.cjs');

let win, identity, ledger;
const ROOT = path.join(__dirname, '..');
const MASTER_PUBLIC_KEY = fs.readFileSync(path.join(ROOT, 'desktop', 'public-key.pem'), 'utf8');

function createWindow() {
  win = new BrowserWindow({ width:1120, height:900, minWidth:900, minHeight:720, show:false, backgroundColor:'#07111f', autoHideMenuBar:true, title:'Universal CAD Customer License Tool', webPreferences:{ preload:path.join(__dirname,'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true, devTools:!app.isPackaged, spellcheck:false } });
  win.loadFile(path.join(__dirname,'ui','index.html')); win.once('ready-to-show',()=>win.show());
}
function verifyPool(pool) {
  const verified = verifyEntitlement(pool.entitlement, MASTER_PUBLIC_KEY);
  if (!verified.ok) throw new Error(verified.message);
  const host = identity.privateInfo();
  if (verified.payload.licenseHostId !== host.hostId) throw new Error('Entitlement belongs to a different License Host.');
  const privateKeyPem = unsealForHost(pool.entitlement.sealedIssuer, host.privateKeyPem);
  const derived = crypto.createPublicKey(crypto.createPrivateKey(privateKeyPem)).export({ type:'spki', format:'pem' });
  if (String(derived).trim() !== String(verified.payload.delegatedPublicKeyPem).trim()) throw new Error('Delegated issuer key does not match the signed entitlement.');
  return { verified, privateKeyPem };
}
function sanitizePools(state) {
  return Object.values(state.pools).map((pool) => {
    const p = pool.entitlement.payload;
    const allocations = Array.isArray(pool.allocations) ? pool.allocations : [];
    return { entitlementId:p.entitlementId, customerName:p.customerName, customerId:p.customerId, entitlementLabel:p.entitlementLabel, editionId:p.editionId, editionName:p.editionName, productDisplayName:p.productDisplayName, features:p.features, seats:p.seats, used:allocations.length, available:Math.max(0,p.seats-allocations.length), validFrom:p.validFrom, validUntil:p.validUntil, suiteVersion:p.suiteVersion, engineVersion:p.engineVersion, allocations };
  }).sort((a,b)=>String(a.customerName).localeCompare(String(b.customerName)));
}

ipcMain.handle('customer:host-info', () => identity.publicInfo());
ipcMain.handle('customer:copy-enrollment', () => { const info=identity.publicInfo(); clipboard.writeText(info.enrollmentCode); return true; });
ipcMain.handle('customer:list', () => sanitizePools(ledger.read()));
ipcMain.handle('customer:import-entitlement', async () => {
  const pick = await dialog.showOpenDialog(win,{ title:'Import Universal CAD Entitlement', properties:['openFile'], filters:[{name:'Universal CAD Entitlement',extensions:['ucadent']}] });
  if (pick.canceled || !pick.filePaths[0]) return { canceled:true };
  const filePath=pick.filePaths[0];
  const doc=parseEntitlementText(fs.readFileSync(filePath,'utf8'));
  const verified=verifyEntitlement(doc,MASTER_PUBLIC_KEY);
  if(!verified.ok) throw new Error(verified.message);
  const host=identity.privateInfo();
  if(verified.payload.licenseHostId!==host.hostId) throw new Error('Entitlement belongs to a different License Host.');
  const privateKeyPem=unsealForHost(doc.sealedIssuer,host.privateKeyPem);
  const derived=crypto.createPublicKey(crypto.createPrivateKey(privateKeyPem)).export({type:'spki',format:'pem'}).trim();
  if(derived!==verified.payload.delegatedPublicKeyPem.trim()) throw new Error('Delegated issuer key does not match the signed entitlement.');
  const state=ledger.read();
  const existing=state.pools[verified.payload.entitlementId];
  state.pools[verified.payload.entitlementId]={ entitlement:doc, allocations:existing?.allocations || [], importedAt:new Date().toISOString() };
  ledger.write(state);
  let consumed=false; try{fs.unlinkSync(filePath);consumed=true;}catch{}
  return { canceled:false, consumed, entitlementId:verified.payload.entitlementId };
});

ipcMain.handle('customer:issue', async (_event,input) => {
  const entitlementId=String(input?.entitlementId||'');
  const machineId=normalizeMachineId(input?.machineId);
  const computerLabel=String(input?.computerLabel||'').trim();
  if(!machineId.startsWith('UCAD-') || machineId.startsWith('UCAD-HOST-')) throw new Error('Invalid Universal CAD Studio Machine ID.');
  const state=ledger.read(); const pool=state.pools[entitlementId]; if(!pool) throw new Error('Selected Entitlement was not found.');
  const {verified,privateKeyPem}=verifyPool(pool); const p=verified.payload;
  const today=todayLocal(new Date()); if(today<p.validFrom) throw new Error(`Entitlement is valid from ${p.validFrom}.`); if(today>p.validUntil) throw new Error(`Entitlement expired on ${p.validUntil}.`);
  pool.allocations=Array.isArray(pool.allocations)?pool.allocations:[];
  let allocation=pool.allocations.find(a=>normalizeMachineId(a.machineId)===machineId);
  if(!allocation){
    if(pool.allocations.length>=p.seats) throw new Error(`All seats are allocated (${pool.allocations.length}/${p.seats}).`);
    const used=new Set(pool.allocations.map(a=>Number(a.seatNumber)));
    let seatNumber=1; while(used.has(seatNumber)) seatNumber++;
    allocation={ seatNumber, machineId, computerLabel, firstIssuedAt:new Date().toISOString() };
  }
  const grant={ grantId:crypto.randomUUID(), entitlementId:p.entitlementId, entitlementDigest:entitlementDigest(pool.entitlement), seatNumber:allocation.seatNumber, computerLabel:computerLabel||allocation.computerLabel||`Seat ${allocation.seatNumber}`, machineId, validFrom:p.validFrom, validUntil:p.validUntil, issuedAt:new Date().toISOString(), nonce:crypto.randomBytes(18).toString('base64url') };
  const license=createMachineLicense({entitlement:pool.entitlement,grant},privateKeyPem);
  const safeCustomer=p.customerName.replace(/[^\p{L}\p{N}_-]+/gu,'_');
  const out=await dialog.showSaveDialog(win,{ title:'Save machine license', defaultPath:`UCAD-${safeCustomer}-Seat${String(allocation.seatNumber).padStart(2,'0')}-${machineId.slice(-9)}.ucadlic`, filters:[{name:'Universal CAD Machine License',extensions:['ucadlic']}] });
  if(out.canceled||!out.filePath)return {canceled:true};
  fs.writeFileSync(out.filePath,serializeMachineLicense(license),{encoding:'utf8',mode:0o600});
  if(!pool.allocations.some(a=>normalizeMachineId(a.machineId)===machineId)) pool.allocations.push(allocation);
  else pool.allocations=pool.allocations.map(a=>normalizeMachineId(a.machineId)===machineId?{...a,computerLabel:grant.computerLabel,lastReissuedAt:new Date().toISOString()}:a);
  state.pools[entitlementId]=pool; ledger.write(state);
  return {canceled:false,filePath:out.filePath,seatNumber:allocation.seatNumber,used:pool.allocations.length,seats:p.seats,editionName:p.editionName,productDisplayName:p.productDisplayName};
});

ipcMain.handle('customer:export-recovery', async (_event, input) => {
  const password = String(input?.password || '');
  const hostRecord = identity.privateInfo();
  const state = ledger.read();
  const bundle = createRecoveryBundle({ hostRecord, ledger: state, password });
  const out = await dialog.showSaveDialog(win, {
    title: 'Save License Host Recovery Backup',
    defaultPath: `UCAD-LicenseHost-Recovery-${hostRecord.hostId.slice(-14)}.ucadhost`,
    filters: [{ name:'Universal CAD License Host Recovery', extensions:['ucadhost'] }],
  });
  if (out.canceled || !out.filePath) return { canceled:true };
  fs.writeFileSync(out.filePath, `${JSON.stringify(bundle, null, 2)}\n`, { encoding:'utf8', mode:0o600 });
  return { canceled:false, filePath:out.filePath, hostId:hostRecord.hostId, pools:Object.keys(state.pools || {}).length };
});

ipcMain.handle('customer:import-recovery', async (_event, input) => {
  const password = String(input?.password || '');
  const pick = await dialog.showOpenDialog(win, {
    title:'Restore License Host Recovery Backup', properties:['openFile'],
    filters:[{ name:'Universal CAD License Host Recovery', extensions:['ucadhost'] }],
  });
  if (pick.canceled || !pick.filePaths[0]) return { canceled:true };
  let document;
  try { document = JSON.parse(fs.readFileSync(pick.filePaths[0], 'utf8')); }
  catch { throw new Error('Unable to read the Recovery Backup.'); }
  const payload = openRecoveryBundle(document, password);
  if (String(payload.hostId) !== String(payload.hostRecord?.hostId)) throw new Error('Recovery Backup Host Identity is inconsistent.');
  identity.restore(payload.hostRecord);
  ledger.write(payload.ledger || { schema:'ucad-customer-ledger-v1', pools:{} });
  return { canceled:false, hostId:payload.hostId, pools:Object.keys(payload.ledger?.pools || {}).length, restoredAt:new Date().toISOString() };
});

ipcMain.handle('customer:info',()=>({version:app.getVersion(),suiteVersion:'1.0.4',engineVersion:'0.26.0',reinstallStableMachineId:false,recoveryBackup:true}));

app.whenReady().then(()=>{identity=new HostIdentity(app.getPath('userData'));ledger=new CustomerLedger(app.getPath('userData'));identity.ensure();createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
