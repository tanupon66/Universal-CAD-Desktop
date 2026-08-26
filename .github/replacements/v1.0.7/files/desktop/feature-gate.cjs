'use strict';

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
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) markLocked(el, feature);
      }
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
    badge.textContent = `${p.editionName || 'Licensed'} · Suite ${p.suiteVersion || '1.0.7'} · Engine ${p.engineVersion || '0.26.0'}`;
    badge.title = `${p.productDisplayName || 'Universal CAD Studio'} · Seat ${p.seatNumber || 1}/${p.seatCount || 1}`;
    target.prepend(badge);
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
      if (!document.body.classList.contains('ucad-lite-mode')) return;
      if ((event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'o') {
        event.preventDefault();
        document.getElementById('projectFile')?.click();
      } else if ((event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'e') {
        event.preventDefault();
        document.getElementById('ucadLiteExportXml')?.click();
      }
    }, true);
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
      body.ucad-lite-mode{overflow:hidden!important}
      body.ucad-lite-mode .topbar{padding:12px 18px!important}
      body.ucad-lite-mode .brand p{display:none!important}
      body.ucad-lite-mode .top-actions>*:not(#ucadEditionBadge){display:none!important}
      body.ucad-lite-mode .app-shell{grid-template-columns:minmax(280px,360px) minmax(0,1fr)!important;gap:14px!important;height:calc(100vh - 76px)!important}
      body.ucad-lite-mode .left-panel{display:block!important;overflow:auto!important}
      body.ucad-lite-mode .left-panel>.panel-section:not(.import-section){display:none!important}
      body.ucad-lite-mode .import-section .section-heading .icon-button,
      body.ucad-lite-mode .import-section .mini-actions,
      body.ucad-lite-mode .import-section .file-row,
      body.ucad-lite-mode .import-section details{display:none!important}
      body.ucad-lite-mode .right-panel{display:none!important}
      body.ucad-lite-mode .workspace{display:block!important;min-width:0!important}
      body.ucad-lite-mode .workspace-toolbar,body.ucad-lite-mode .table-panel{display:none!important}
      body.ucad-lite-mode .viewer{height:100%!important;min-height:480px!important}
      body.ucad-lite-mode .viewer-hud.bottom-left,body.ucad-lite-mode .manual-banner{display:none!important}
      body.ucad-lite-mode .modal-overlay{display:none!important}
      body.ucad-lite-mode #dropZone{min-height:180px!important}
      body.ucad-lite-mode .ucad-lite-actions{display:grid!important;margin-top:14px!important}
      body.ucad-lite-mode #ucadLiteExportXml{width:100%!important;min-height:48px!important;font-size:15px!important}
      @media(max-width:760px){body.ucad-lite-mode{overflow:auto!important}body.ucad-lite-mode .app-shell{grid-template-columns:1fr!important;height:auto!important}body.ucad-lite-mode .viewer{height:62vh!important;min-height:360px!important}}
    `;
    document.head.appendChild(style);
  }
  function blockLocked(event) {
    const locked = event.target?.closest?.('.ucad-feature-locked');
    if (!locked) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  async function refresh() {
    try {
      status = await ipcRenderer.invoke('license:status');
      enabled = new Set(status?.ok && Array.isArray(status.payload?.features) ? status.payload.features : []);
      injectStyle(); applyBranding(); applyFeatureSelectors(); applyLiteShell();
    } catch { /* licensing main process remains authoritative */ }
  }
  window.addEventListener('DOMContentLoaded', refresh, { once:true });
  document.addEventListener('click', blockLocked, true);
  document.addEventListener('change', blockLocked, true);
}

module.exports = { installFeatureGate, FEATURE_SELECTORS };
