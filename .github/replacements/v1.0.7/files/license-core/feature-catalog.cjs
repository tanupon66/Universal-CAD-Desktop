'use strict';

const SUITE_VERSION = '1.0.7';
const ENGINE_VERSION = '0.26.0';

const FEATURE_CATALOG = Object.freeze([
  { id: 'cad.edit', label: 'CAD Editor', group: 'Core CAD', description: 'Graphical CAD editing, manual edit and teach tools.' },
  { id: 'cad.compare', label: 'CAD Compare', group: 'Core CAD', description: 'Original/generated CAD comparison and overlay.' },
  { id: 'cad.nameInspector', label: 'Name Inspector', group: 'Core CAD', description: 'CAD land-name inspection and duplicate diagnostics.' },
  { id: 'mapping', label: 'Mapping & Remap', group: 'Core CAD', description: 'Automatic and manual component/land mapping.' },
  { id: 'validation', label: 'Validation Center', group: 'Core CAD', description: 'Validation checks and export preflight.' },
  { id: 'project.backup', label: 'Project Backup & Recovery', group: 'Project', description: 'Project backup JSON, restore and autosave recovery.' },
  { id: 'export.csv', label: 'CSV Export', group: 'Export', description: 'Mapping and audit CSV export.' },
  { id: 'export.excel', label: 'Excel Export', group: 'Export', description: 'Component and mapping Excel reports.' },
  { id: 'export.xml', label: 'Inspection XML Export', group: 'Export', description: 'VT-X/ePM Inspection XML export.' },
  { id: 'export.gencad', label: 'GenCAD Export', group: 'Export', description: 'GenCAD/CAD ASCII export.' },
  { id: 'export.fabmaster', label: 'FABmaster Export', group: 'Export', description: 'Manufacturing ASCII/FABmaster export.' },
  { id: 'export.archive', label: 'Archive Export', group: 'Export', description: 'ZIP/TGZ archive export.' },
  { id: 'npi.workspace', label: 'NPI Workspace', group: 'NPI', description: 'NPI preparation workspace and overview.' },
  { id: 'npi.compatibility', label: 'Compatibility Center', group: 'NPI', description: 'Format compatibility, target profile and conversion-loss analysis.' },
  { id: 'npi.packages', label: 'Package Intelligence', group: 'NPI', description: 'Package library and auto-recognition.' },
  { id: 'npi.reconcile', label: 'NPI Reconciliation', group: 'NPI', description: 'CAD + BOM + placement reconciliation.' },
  { id: 'npi.alignment', label: 'Coordinate Calibration', group: 'NPI', description: 'Two/three-point registration and alignment.' },
  { id: 'npi.panelization', label: 'Panelization', group: 'NPI', description: 'Board instance array/panel definition.' },
  { id: 'npi.revisions', label: 'Smart Revisions', group: 'NPI', description: 'Revision history and smart revision compare.' },
  { id: 'npi.golden', label: 'Golden Template', group: 'NPI', description: 'Structural compatibility harness and template-preserving export.' },
  { id: 'npi.bom', label: 'BOM Layout Designer', group: 'NPI', description: 'Configurable BOM CSV/Excel layout export.' },
  { id: 'diagnostics.performance', label: 'Performance Diagnostics', group: 'Diagnostics', description: 'Large-board and performance diagnostics.' },
]);

const ALL_FEATURE_IDS = Object.freeze(FEATURE_CATALOG.map((item) => item.id));

const LITE_FEATURES = Object.freeze(['export.xml']);

const STANDARD_FEATURES = Object.freeze([
  'cad.edit', 'cad.nameInspector', 'mapping', 'validation', 'project.backup',
  'export.csv', 'export.excel', 'export.xml',
]);

const PRO_FEATURES = Object.freeze([
  ...STANDARD_FEATURES,
  'cad.compare', 'export.gencad', 'export.fabmaster', 'export.archive',
  'npi.workspace', 'npi.compatibility', 'npi.packages', 'npi.reconcile',
  'npi.revisions', 'npi.bom',
]);

const ENTERPRISE_FEATURES = ALL_FEATURE_IDS;

const EDITION_PRESETS = Object.freeze({
  lite: Object.freeze({ id: 'lite', name: 'Lite', displayName: 'Universal CAD Studio Lite', features: LITE_FEATURES }),
  standard: Object.freeze({ id: 'standard', name: 'Standard', displayName: 'Universal CAD Studio Standard', features: STANDARD_FEATURES }),
  pro: Object.freeze({ id: 'pro', name: 'Pro', displayName: 'Universal CAD Studio Pro', features: PRO_FEATURES }),
  enterprise: Object.freeze({ id: 'enterprise', name: 'Enterprise', displayName: 'Universal CAD Studio Enterprise', features: ENTERPRISE_FEATURES }),
  custom: Object.freeze({ id: 'custom', name: 'Custom', displayName: 'Universal CAD Studio Custom', features: STANDARD_FEATURES }),
});

function normalizeFeatures(features) {
  const allowed = new Set(ALL_FEATURE_IDS);
  const unique = [...new Set((Array.isArray(features) ? features : []).map(String).filter((id) => allowed.has(id)))];
  return unique.sort();
}

function resolveEdition(id, selectedFeatures, customDisplayName) {
  const key = String(id || 'standard').toLowerCase();
  const preset = EDITION_PRESETS[key] || EDITION_PRESETS.standard;
  const requested = Array.isArray(selectedFeatures) ? normalizeFeatures(selectedFeatures) : null;
  const features = preset.id === 'lite' ? [...LITE_FEATURES] : (requested && requested.length ? requested : [...preset.features]);
  return {
    id: preset.id,
    name: preset.name,
    displayName: String(customDisplayName || preset.displayName).trim() || preset.displayName,
    features,
  };
}

function hasFeature(features, featureId) {
  if (Array.isArray(features) && features.includes('all')) return true;
  return normalizeFeatures(features).includes(String(featureId));
}

module.exports = {
  SUITE_VERSION,
  ENGINE_VERSION,
  FEATURE_CATALOG,
  ALL_FEATURE_IDS,
  LITE_FEATURES,
  EDITION_PRESETS,
  normalizeFeatures,
  resolveEdition,
  hasFeature,
};
