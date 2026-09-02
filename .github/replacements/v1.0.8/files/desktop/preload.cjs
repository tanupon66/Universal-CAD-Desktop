'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const FEATURE_SELECTORS = Object.freeze({
  'cad.edit': ['#cadEditorButton', '#manualButton', '#teachButton'],
  'cad.compare': ['#cadCompareButton', '#cadCompareOverlayToggle', '#exportCadCompareButton'],
  'cad.nameInspector': ['#cadInspectorButton', '[data-cad-command="open-name-inspector"]'],
  'mapping': ['#remapButton', '#landGridApplyButton', '[data-cad-command="grid-map"]'],
  'validation': ['[data-cad-command="validate"]'],
  'project.backup': ['#restoreButton', '#projectBackupButton', '#recoveryButton', '#exportJsonButton', '#storageManagerButton', '#npiOpenProjectStorage'],
  'export.csv': ['#exportCsvButton', '#cadExportReportButton', '#exportCadCompareButton'],
  'export.excel': ['#exportExcelButton', '#landGridExportExcelButton'],
  'export.xml': ['#cadExportXmlButton', '#cadEditorExportXmlButton', '[data-cad-command="export-xml"]'],
  'export.gencad': ['[data-cad-command="export-gencad"]'],
  'export.fabmaster': ['[data-cad-command="export-fabmaster"]'],
  'export.archive': ['#cadEditorExportTgzButton', '[data-cad-command="export-archive"]'],
  'npi.workspace': ['#npiWorkspaceButton'],
  'npi.compatibility': ['[data-npi-tab="compatibility"]', '[data-npi-panel="compatibility"]'],
  'npi.packages': ['[data-npi-tab="packages"]', '[data-npi-panel="packages"]'],
  'npi.reconcile': ['[data-npi-tab="reconcile"]', '[data-npi-panel="reconcile"]'],
  'npi.alignment': ['[data-npi-tab="alignment"]', '[data-npi-panel="alignment"]'],
  'npi.panelization': ['[data-npi-tab="panel"]', '[data-npi-panel="panel"]'],
  'npi.revisions': ['[data-npi-tab="revisions"]', '[data-npi-panel="revisions"]'],
  'npi.golden': ['[data-npi-tab="golden"]', '[data-npi-panel="golden"]'],
  'npi.bom': ['[data-npi-tab="bom"]', '[data-npi-panel="bom"]'],
});

function installFeatureGate(ipcRenderer) {
  let enabled = new Set();
  let status = null;
  let previewObserver = null;
  let previewTimer = null;

  function has(feature) { return enabled.has(feature); }
  function isLite() { return String(status?.payload?.editionId || '').toLowerCase() === 'lite'; }

  function markLocked(element, feature) {
    if (!element) return;
    element.dataset.ucadFeature = feature;
    if (element.matches('button,input,select,textarea')) element.disabled = true;
    element.setAttribute('aria-disabled', 'true');
    element.classList.add('ucad-feature-locked');
    element.title = `Not included in ${status?.payload?.editionName || 'this'} license`;
  }

  function applyFeatureSelectors() {
    for (const [feature, selectors] of Object.entries(FEATURE_SELECTORS)) {
      if (has(feature)) continue;
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) markLocked(el, feature);
      }
    }
    if (!has('npi.workspace')) {
      const overlay = document.getElementById('npiWorkspaceOverlay');
      if (overlay) overlay.classList.add('hidden');
    }
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function pickDate(payload, keys) {
    for (const key of keys) {
      if (payload && payload[key]) {
        const date = parseDate(payload[key]);
        if (date) return date;
      }
    }
    return null;
  }

  function licenseDates() {
    const p = status?.payload || {};
    const start = pickDate(p, ['notBefore', 'validFrom', 'startsAt', 'startDate', 'issuedAt']);
    const end = pickDate(p, ['notAfter', 'validUntil', 'expiresAt', 'expiryDate', 'endDate']);
    return { start, end };
  }

  function formatDate(date) {
    if (!date) return 'Not specified';
    try {
      return new Intl.DateTimeFormat(undefined, { year:'numeric', month:'short', day:'2-digit' }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  function durationInfo() {
    const { start, end } = licenseDates();
    const dayMs = 86400000;
    let totalDays = null;
    let remainingDays = null;
    if (start && end) totalDays = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / dayMs));
    if (end) remainingDays = Math.ceil((end.getTime() - Date.now()) / dayMs);
    return { start, end, totalDays, remainingDays };
  }

  function remainingLabel() {
    const { end, remainingDays } = durationInfo();
    if (!end) return 'No expiry';
    if (remainingDays < 0) return 'Expired';
    if (remainingDays === 0) return 'Expires today';
    return `${remainingDays} day${remainingDays === 1 ? '' : 's'} left`;
  }

  function closeLicensePanel() {
    document.getElementById('ucadLicensePanel')?.remove();
  }

  function openLicensePanel() {
    closeLicensePanel();
    const p = status?.payload || {};
    const { start, end, totalDays, remainingDays } = durationInfo();
    const panel = document.createElement('div');
    panel.id = 'ucadLicensePanel';
    panel.className = 'ucad-license-panel-backdrop';
    panel.innerHTML = `
      <section class="ucad-license-card" role="dialog" aria-modal="true" aria-label="License information">
        <div class="ucad-license-title-row">
          <div>
            <div class="ucad-license-eyebrow">LICENSE</div>
            <h2>License Information</h2>
          </div>
          <button type="button" id="ucadLicenseClose" class="ucad-license-close" aria-label="Close">×</button>
        </div>
        <div class="ucad-license-grid">
          <div><span>Edition</span><strong>${String(p.editionName || p.editionId || 'Licensed')}</strong></div>
          <div><span>Product</span><strong>${String(p.productDisplayName || 'Universal CAD Studio')}</strong></div>
          <div><span>Valid from</span><strong>${formatDate(start)}</strong></div>
          <div><span>Expires</span><strong>${end ? formatDate(end) : 'No expiry'}</strong></div>
          <div><span>License period</span><strong>${totalDays === null ? 'Not specified' : `${totalDays} days`}</strong></div>
          <div><span>Remaining</span><strong>${end ? (remainingDays < 0 ? 'Expired' : `${Math.max(0, remainingDays)} days`) : 'No expiry'}</strong></div>
          <div><span>Seat</span><strong>${Number(p.seatNumber || 1)} / ${Number(p.seatCount || 1)}</strong></div>
          <div><span>Suite / Engine</span><strong>${String(p.suiteVersion || '1.0.8')} / ${String(p.engineVersion || '0.26.0')}</strong></div>
        </div>
        <div id="ucadLicenseMessage" class="ucad-license-message" aria-live="polite"></div>
        <div class="ucad-license-actions">
          <button type="button" id="ucadChangeLicense" class="primary">Change License</button>
          <button type="button" id="ucadLicenseDone">Close</button>
        </div>
      </section>`;
    document.body.appendChild(panel);

    const message = panel.querySelector('#ucadLicenseMessage');
    const change = panel.querySelector('#ucadChangeLicense');
    const close = () => closeLicensePanel();
    panel.querySelector('#ucadLicenseClose')?.addEventListener('click', close);
    panel.querySelector('#ucadLicenseDone')?.addEventListener('click', close);
    panel.addEventListener('click', (event) => { if (event.target === panel) close(); });
    change?.addEventListener('click', async () => {
      change.disabled = true;
      if (message) message.textContent = 'Select a new .ucadlic license file…';
      try {
        const result = await ipcRenderer.invoke('license:choose-and-activate', {});
        if (result?.cancelled || result?.canceled) {
          if (message) message.textContent = 'License change cancelled.';
          change.disabled = false;
          return;
        }
        const refreshed = await ipcRenderer.invoke('license:status');
        if (!refreshed?.ok) throw new Error(refreshed?.error || 'The new license could not be verified.');
        status = refreshed;
        enabled = new Set(Array.isArray(refreshed.payload?.features) ? refreshed.payload.features : []);
        if (message) message.textContent = 'License changed successfully. Reloading…';
        setTimeout(() => window.location.reload(), 120);
      } catch (error) {
        if (message) message.textContent = error?.message || 'Unable to change license.';
        change.disabled = false;
      }
    });
  }

  function addBadge() {
    const target = document.querySelector('.top-actions') || document.body;
    if (!target) return;
    let badge = document.getElementById('ucadEditionBadge');
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.id = 'ucadEditionBadge';
      badge.className = 'status-pill ucad-license-badge';
      badge.addEventListener('click', openLicensePanel);
      target.prepend(badge);
    }
    const p = status?.payload || {};
    badge.textContent = `${p.editionName || 'Licensed'} · ${remainingLabel()}`;
    badge.title = `License details · ${p.productDisplayName || 'Universal CAD Studio'} · Seat ${p.seatNumber || 1}/${p.seatCount || 1}`;
  }

  function ensureLitePreviewSurface() {
    if (!isLite() || !document.body.classList.contains('ucad-lite-mode')) return;
    const workspace = document.querySelector('.workspace');
    const viewer = document.querySelector('.viewer');
    const appShell = document.querySelector('.app-shell');
    for (const el of [appShell, workspace, viewer]) {
      if (!el) continue;
      if (el.hasAttribute('hidden')) el.removeAttribute('hidden');
      if (el.classList.contains('hidden')) el.classList.remove('hidden');
      if (el.getAttribute('aria-hidden') === 'true') el.setAttribute('aria-hidden', 'false');
    }
  }

  function scheduleLitePreviewRecovery() {
    if (!isLite()) return;
    clearTimeout(previewTimer);
    ensureLitePreviewSurface();
    previewTimer = setTimeout(() => {
      ensureLitePreviewSurface();
      try { window.dispatchEvent(new Event('resize')); } catch {}
    }, 180);
    setTimeout(ensureLitePreviewSurface, 650);
    setTimeout(ensureLitePreviewSurface, 1400);
  }

  function installLitePreviewGuard() {
    if (!isLite() || previewObserver || !document.body) return;
    previewObserver = new MutationObserver(() => {
      if (!document.body.classList.contains('ucad-lite-mode')) return;
      ensureLitePreviewSurface();
    });
    previewObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-hidden']
    });
    document.addEventListener('change', (event) => {
      if (event.target?.id === 'projectFile') scheduleLitePreviewRecovery();
    }, true);
    document.addEventListener('drop', scheduleLitePreviewRecovery, true);
    scheduleLitePreviewRecovery();
  }

  function applyLiteShell() {
    const p = status?.payload || {};
    if (String(p.editionId || '').toLowerCase() !== 'lite') return;
    document.body.classList.add('ucad-lite-mode');

    const importSection = document.querySelector('.left-panel .import-section');
    if (importSection) {
      const eyebrow = importSection.querySelector('.eyebrow');
      const heading = importSection.querySelector('h2');
      const strong = importSection.querySelector('#dropZone strong');
      const small = importSection.querySelector('#dropZone small');
      const input = importSection.querySelector('#projectFile');
      if (eyebrow) eyebrow.textContent = 'LITE';
      if (heading) heading.textContent = 'Import CAD File';
      if (strong) strong.textContent = 'Drop a CAD file here or tap to browse';
      if (small) small.textContent = 'Preview locally and export Inspection XML.';
      if (input) input.setAttribute('accept', '.zip,.tgz,.tar.gz,.tar,.gz,.Z,.xml,.cpo,.cad,.fab,.gcd,.job,.dat,.txt');
    }

    let actions = document.getElementById('ucadLiteActions');
    if (!actions && importSection) {
      actions = document.createElement('div');
      actions.id = 'ucadLiteActions';
      actions.className = 'ucad-lite-actions';
      const exportButton = document.createElement('button');
      exportButton.id = 'ucadLiteExportXml';
      exportButton.type = 'button';
      exportButton.className = 'primary';
      exportButton.textContent = 'Export XML';
      exportButton.disabled = true;
      actions.appendChild(exportButton);
      importSection.appendChild(actions);

      const sourceButton = document.getElementById('cadExportXmlButton');
      const syncExportState = () => { exportButton.disabled = !sourceButton || sourceButton.disabled || !has('export.xml'); };
      exportButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (!has('export.xml') || !sourceButton || sourceButton.disabled) return;
        sourceButton.click();
      });
      if (sourceButton) new MutationObserver(syncExportState).observe(sourceButton, { attributes:true, attributeFilter:['disabled'] });
      syncExportState();
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.getElementById('ucadLicensePanel')) {
        closeLicensePanel();
        return;
      }
      if (!document.body.classList.contains('ucad-lite-mode')) return;
      if ((event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'o') {
        event.preventDefault();
        document.getElementById('projectFile')?.click();
      } else if ((event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'e') {
        event.preventDefault();
        document.getElementById('ucadLiteExportXml')?.click();
      }
    }, true);
    installLitePreviewGuard();
  }

  function applyBranding() {
    const p = status?.payload || {};
    const productName = p.productDisplayName || 'Universal CAD Studio';
    document.title = `${productName} · Engine ${p.engineVersion || '0.26.0'}`;
    const h1 = document.querySelector('.brand h1');
    if (h1) h1.textContent = productName;
    addBadge();
  }

  function injectStyle() {
    if (document.getElementById('ucadFeatureGateStyle')) return;
    const style = document.createElement('style');
    style.id = 'ucadFeatureGateStyle';
    style.textContent = `
      .ucad-feature-locked{opacity:.38!important;filter:grayscale(.35);cursor:not-allowed!important;pointer-events:auto!important}
      [data-npi-panel].ucad-feature-locked{display:none!important}
      [data-npi-tab].ucad-feature-locked{display:none!important}
      .ucad-license-badge{border:0;cursor:pointer;font:inherit}
      .ucad-license-panel-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(3,8,18,.72);display:grid;place-items:center;padding:20px}
      .ucad-license-card{width:min(680px,96vw);max-height:92vh;overflow:auto;background:#121a2a;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:22px;box-shadow:0 28px 80px rgba(0,0,0,.5);color:#eef4ff}
      .ucad-license-title-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.ucad-license-title-row h2{margin:3px 0 0}.ucad-license-eyebrow{font-size:11px;letter-spacing:.18em;opacity:.62}.ucad-license-close{border:0;background:transparent;color:inherit;font-size:28px;line-height:1;cursor:pointer}
      .ucad-license-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0}.ucad-license-grid>div{padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.055);display:grid;gap:4px}.ucad-license-grid span{font-size:12px;opacity:.62}.ucad-license-grid strong{font-size:14px;overflow-wrap:anywhere}
      .ucad-license-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.ucad-license-actions button{min-height:40px;padding:0 16px}.ucad-license-message{min-height:20px;font-size:13px;opacity:.8}
      body.ucad-lite-mode{overflow:hidden!important}
      body.ucad-lite-mode .topbar{padding:12px 18px!important}
      body.ucad-lite-mode .brand p{display:none!important}
      body.ucad-lite-mode .top-actions>*:not(#ucadEditionBadge){display:none!important}
      body.ucad-lite-mode .app-shell,body.ucad-lite-mode .app-shell.hidden{display:grid!important;grid-template-columns:minmax(280px,360px) minmax(0,1fr)!important;gap:14px!important;height:calc(100vh - 76px)!important}
      body.ucad-lite-mode .left-panel{display:block!important;overflow:auto!important}
      body.ucad-lite-mode .left-panel>.panel-section:not(.import-section){display:none!important}
      body.ucad-lite-mode .import-section .section-heading .icon-button,
      body.ucad-lite-mode .import-section .mini-actions,
      body.ucad-lite-mode .import-section .file-row,
      body.ucad-lite-mode .import-section details{display:none!important}
      body.ucad-lite-mode .right-panel{display:none!important}
      body.ucad-lite-mode .workspace,body.ucad-lite-mode .workspace.hidden,body.ucad-lite-mode .workspace[hidden]{display:block!important;visibility:visible!important;opacity:1!important;min-width:0!important}
      body.ucad-lite-mode .workspace-toolbar,body.ucad-lite-mode .table-panel{display:none!important}
      body.ucad-lite-mode .viewer,body.ucad-lite-mode .viewer.hidden,body.ucad-lite-mode .viewer[hidden]{display:block!important;visibility:visible!important;opacity:1!important;height:100%!important;min-height:480px!important}
      body.ucad-lite-mode .viewer canvas,body.ucad-lite-mode .viewer svg{visibility:visible!important;opacity:1!important}
      body.ucad-lite-mode .viewer-hud.bottom-left,body.ucad-lite-mode .manual-banner{display:none!important}
      body.ucad-lite-mode #dropZone{min-height:180px!important}
      body.ucad-lite-mode .ucad-lite-actions{display:grid!important;margin-top:14px!important}
      body.ucad-lite-mode #ucadLiteExportXml{width:100%!important;min-height:48px!important;font-size:15px!important}
      @media(max-width:760px){.ucad-license-grid{grid-template-columns:1fr}body.ucad-lite-mode{overflow:auto!important}body.ucad-lite-mode .app-shell,body.ucad-lite-mode .app-shell.hidden{grid-template-columns:1fr!important;height:auto!important}body.ucad-lite-mode .viewer,body.ucad-lite-mode .viewer.hidden{height:62vh!important;min-height:360px!important}}
    `;
    document.head.appendChild(style);
  }

  function blockLocked(event) {
    const locked = event.target?.closest?.('.ucad-feature-locked');
    if (!locked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  async function refresh() {
    try {
      status = await ipcRenderer.invoke('license:status');
      enabled = new Set(status?.ok && Array.isArray(status.payload?.features) ? status.payload.features : []);
      injectStyle();
      applyBranding();
      applyFeatureSelectors();
      applyLiteShell();
      ensureLitePreviewSurface();
    } catch { /* licensing main process remains authoritative */ }
  }

  window.addEventListener('DOMContentLoaded', refresh, { once:true });
  document.addEventListener('click', blockLocked, true);
  document.addEventListener('change', blockLocked, true);
}

contextBridge.exposeInMainWorld('desktopLicense', Object.freeze({
  status: () => ipcRenderer.invoke('license:status'),
  machineId: () => ipcRenderer.invoke('license:machine-id'),
  deviceRequest: () => ipcRenderer.invoke('license:device-request'),
  chooseAndActivate: (input) => ipcRenderer.invoke('license:choose-and-activate', input || {}),
  copyMachineId: () => ipcRenderer.invoke('license:copy-machine-id'),
  copyDeviceRequest: () => ipcRenderer.invoke('license:copy-device-request'),
  openMainApp: () => ipcRenderer.invoke('license:open-main-app'),
  appInfo: () => ipcRenderer.invoke('app:info'),
}));
contextBridge.exposeInMainWorld('UCAD_DESKTOP', Object.freeze({ enabled:true, suiteVersion:'1.0.8', engineVersion:'0.26.0' }));
installFeatureGate(ipcRenderer);
