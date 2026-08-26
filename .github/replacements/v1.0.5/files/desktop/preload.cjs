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
  function has(feature) { return enabled.has(feature); }
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
      for (const selector of selectors) for (const el of document.querySelectorAll(selector)) markLocked(el, feature);
    }
    if (!has('npi.workspace')) {
      const overlay = document.getElementById('npiWorkspaceOverlay');
      if (overlay) overlay.classList.add('hidden');
    }
  }
  function addBadge() {
    const target = document.querySelector('.top-actions') || document.body;
    if (!target || document.getElementById('ucadEditionBadge')) return;
    const badge = document.createElement('span');
    badge.id = 'ucadEditionBadge';
    badge.className = 'status-pill';
    const p = status?.payload || {};
    badge.textContent = `${p.editionName || 'Licensed'} · Suite ${p.suiteVersion || '1.0.5'} · Engine ${p.engineVersion || '0.26.0'}`;
    badge.title = `${p.productDisplayName || 'Universal CAD Studio'} · Seat ${p.seatNumber || 1}/${p.seatCount || 1}`;
    target.prepend(badge);
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
    style.textContent = `.ucad-feature-locked{opacity:.38!important;filter:grayscale(.35);cursor:not-allowed!important;pointer-events:auto!important}[data-npi-panel].ucad-feature-locked{display:none!important}[data-npi-tab].ucad-feature-locked{display:none!important}`;
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
      injectStyle(); applyBranding(); applyFeatureSelectors();
    } catch { }
  }
  window.addEventListener('DOMContentLoaded', refresh, { once:true });
  document.addEventListener('click', blockLocked, true);
  document.addEventListener('change', blockLocked, true);
}

contextBridge.exposeInMainWorld('desktopLicense', Object.freeze({
  status: () => ipcRenderer.invoke('license:status'),
  machineId: () => ipcRenderer.invoke('license:machine-id'),
  chooseAndActivate: () => ipcRenderer.invoke('license:choose-and-activate'),
  copyMachineId: () => ipcRenderer.invoke('license:copy-machine-id'),
  openMainApp: () => ipcRenderer.invoke('license:open-main-app'),
  appInfo: () => ipcRenderer.invoke('app:info'),
}));
contextBridge.exposeInMainWorld('UCAD_DESKTOP', Object.freeze({ enabled:true, suiteVersion:'1.0.5', engineVersion:'0.26.0' }));
installFeatureGate(ipcRenderer);
