import { app, BrowserWindow, shell } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';
const devServerPort = process.env.DEV_SERVER_PORT || '3001';
const devServerUrl = `http://localhost:${devServerPort}`;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#111113',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Open external links in the default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    loadWhenReady(devServerUrl);
  } else {
    // Production: assume Next has been built and is being served somewhere.
    // For a packaged build you'll want to start a local Next server here or
    // use next export — left as a follow-up.
    loadWhenReady(devServerUrl);
  }
}

async function loadWhenReady(url: string, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok || res.status === 404 || res.status === 200) {
        await mainWindow?.loadURL(url);
        return;
      }
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(`[electron] Server at ${url} never came up.`);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
