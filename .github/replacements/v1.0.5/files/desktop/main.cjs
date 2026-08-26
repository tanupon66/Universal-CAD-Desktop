'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, protocol } = require('electron');
const { LicenseService } = require('./license-service.cjs');

const APP_NAME = 'Universal CAD Studio';
const SUITE_VERSION = '1.0.5';
const ENGINE_VERSION = '0.26.0';

protocol.registerSchemesAsPrivileged([{
  scheme: 'ucad',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);
const ROOT = path.join(__dirname, '..');
let mainWindow = null;
let licenseService = null;
let checkingLicense = false;

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.ico', 'image/x-icon'],
]);

function registerAppProtocol() {
  const appRoot = path.resolve(ROOT, 'app');
  protocol.handle('ucad', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Not found', { status: 404 });
    let relative = decodeURIComponent(url.pathname || '/').replace(/^\/+/, '');
    if (!relative) relative = 'index.html';
    const filePath = path.resolve(appRoot, relative);
    if (filePath !== appRoot && !filePath.startsWith(`${appRoot}${path.sep}`)) return new Response('Forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(filePath);
      return new Response(data, { status: 200, headers: { 'content-type': MIME.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream', 'cache-control': 'no-store' } });
    } catch (error) {
      return new Response(error.code === 'ENOENT' ? 'Not found' : 'Read error', { status: error.code === 'ENOENT' ? 404 : 500 });
    }
  });
}

function publicKeyPath() { return path.join(ROOT, 'desktop', 'public-key.pem'); }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    backgroundColor: '#07111f',
    autoHideMenuBar: true,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('ucad://app/') || url.startsWith('file://')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function loadForStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (status.ok) {
    const productName = status.payload?.productDisplayName || APP_NAME;
    mainWindow.setTitle(`${productName} · Suite ${SUITE_VERSION} · Engine ${ENGINE_VERSION}`);
    await mainWindow.loadURL('ucad://app/index.html');
  } else {
    await mainWindow.loadFile(path.join(__dirname, 'activation.html'));
  }
}

function setupIpc() {
  ipcMain.handle('license:status', () => licenseService.status({ touch: true }));
  ipcMain.handle('license:machine-id', () => licenseService.getMachineId());
  ipcMain.handle('license:copy-machine-id', () => { clipboard.writeText(licenseService.getMachineId()); return true; });
  ipcMain.handle('license:choose-and-activate', async () => {
    const pick = await dialog.showOpenDialog(mainWindow, { title: 'Select Universal CAD license', properties: ['openFile'], filters: [{ name: 'Universal CAD License', extensions: ['ucadlic'] }] });
    if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
    try { return { canceled: false, result: licenseService.activateFromFile(pick.filePaths[0]) }; }
    catch (error) { return { canceled: false, error: { code: error.code || 'ACTIVATION_FAILED', message: error.message } }; }
  });
  ipcMain.handle('license:open-main-app', async () => {
    const status = licenseService.status({ touch: true });
    if (!status.ok) return status;
    await loadForStatus(status);
    return status;
  });
  ipcMain.handle('app:info', () => ({ name: APP_NAME, version: app.getVersion(), suiteVersion: SUITE_VERSION, engineVersion: ENGINE_VERSION, platform: process.platform }));
}

async function periodicLicenseCheck() {
  if (checkingLicense || !mainWindow || mainWindow.isDestroyed()) return;
  checkingLicense = true;
  try {
    const status = licenseService.status({ touch: true });
    const current = mainWindow.webContents.getURL();
    const onActivation = current.endsWith('/activation.html') || current.endsWith('activation.html');
    if (!status.ok && !onActivation) await loadForStatus(status);
  } finally { checkingLicense = false; }
}

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  registerAppProtocol();
  licenseService = new LicenseService({ userDataPath: app.getPath('userData'), publicKeyPath: publicKeyPath() });
  setupIpc();
  createWindow();
  await loadForStatus(licenseService.status({ touch: true }));
  setInterval(periodicLicenseCheck, 60 * 1000).unref();
  app.on('activate', async () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); await loadForStatus(licenseService.status({ touch: true })); } });
});

app.on('browser-window-focus', () => { periodicLicenseCheck().catch(() => {}); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
