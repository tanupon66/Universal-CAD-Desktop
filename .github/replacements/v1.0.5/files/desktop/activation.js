'use strict';
const $ = (id) => document.getElementById(id);
const machineId = $('machineId'), copyBtn = $('copyBtn'), activateBtn = $('activateBtn'), openBtn = $('openBtn');
const message = $('message'), details = $('details'), statusPill = $('statusPill'), appVersion = $('appVersion');
function showMessage(text, success=false){message.textContent=text;message.classList.remove('hidden','success');if(success)message.classList.add('success');}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function renderStatus(status){
  machineId.textContent=status.machineId||'—';
  if(!status.ok){
    statusPill.textContent=status.code==='EXPIRED'?'Expired':'Not activated';
    statusPill.classList.remove('valid');details.classList.add('hidden');openBtn.classList.add('hidden');return;
  }
  const p=status.payload;
  statusPill.textContent='Licensed';statusPill.classList.add('valid');
  details.innerHTML=`<b>Customer</b><span>${escapeHtml(p.customerName||p.ownerName||'Owner')}</span><b>Edition</b><span>${escapeHtml(p.productDisplayName||p.editionName||'Licensed')}</span><b>Seat</b><span>${escapeHtml(p.seatNumber||1)} / ${escapeHtml(p.seatCount||1)}</span><b>Computer</b><span>${escapeHtml(p.computerLabel||p.machineId||'Any')}</span><b>License ID</b><span>${escapeHtml(p.licenseId)}</span><b>Valid</b><span>${escapeHtml(p.validFrom)} — ${escapeHtml(p.validUntil)}</span><b>Version</b><span>Suite ${escapeHtml(p.suiteVersion||'1.0.5')} · Engine ${escapeHtml(p.engineVersion||'0.26.0')}</span>`;
  details.classList.remove('hidden');openBtn.classList.remove('hidden');
}
copyBtn.addEventListener('click',async()=>{await window.desktopLicense.copyMachineId();copyBtn.textContent='Copied';setTimeout(()=>copyBtn.textContent='Copy',1200);});
activateBtn.addEventListener('click',async()=>{
  message.classList.add('hidden');activateBtn.disabled=true;
  const response=await window.desktopLicense.chooseAndActivate();
  activateBtn.disabled=false;if(response.canceled)return;
  if(response.error){showMessage(response.error.message);return;}
  renderStatus(response.result);showMessage('Activation complete.',true);setTimeout(()=>window.desktopLicense.openMainApp(),500);
});
openBtn.addEventListener('click',()=>window.desktopLicense.openMainApp());
(async()=>{
  if(!window.desktopLicense){
    machineId.textContent='Runtime bridge unavailable';
    showMessage('Desktop runtime bridge failed to load. Please reinstall Universal CAD Studio.');
    return;
  }
  const [idResult,statusResult,infoResult]=await Promise.allSettled([
    window.desktopLicense.machineId(),
    window.desktopLicense.status(),
    window.desktopLicense.appInfo(),
  ]);
  if(idResult.status==='fulfilled' && /^UCAD-[A-Z0-9-]+$/i.test(String(idResult.value||''))){
    machineId.textContent=idResult.value;
  }else{
    machineId.textContent='Machine ID error';
    showMessage(idResult.status==='rejected'?(idResult.reason?.message||'Unable to read Machine ID.'):'Machine ID was not returned by the desktop runtime.');
  }
  if(statusResult.status==='fulfilled'){
    renderStatus({...statusResult.value,machineId:String(idResult.status==='fulfilled'?idResult.value:(statusResult.value?.machineId||''))});
    if(!statusResult.value.ok&&!['NO_LICENSE'].includes(statusResult.value.code))showMessage(statusResult.value.message);
  }else{
    showMessage(statusResult.reason?.message||'Unable to read license status.');
  }
  if(infoResult.status==='fulfilled'){
    const info=infoResult.value;
    appVersion.textContent=`${info.name} · Suite ${info.suiteVersion||info.version} · Engine ${info.engineVersion||'0.26.0'}`;
  }
})();
