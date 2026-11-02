const { app, BrowserWindow, shell, Menu } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged && process.env.PRISM_DEV === '1'

function createWindow() {
  const window = new BrowserWindow({
    width: 760,
    height: 1120,
    minWidth: 420,
    minHeight: 640,
    backgroundColor: '#080b16',
    title: 'Prism Party',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  Menu.setApplicationMenu(null)

  if (isDev) window.loadURL('http://localhost:5183/')
  else window.loadFile(path.join(__dirname, '..', 'dist-web', 'index.html'))

  window.once('ready-to-show', () => window.show())

  // Never trap the player inside the app: external links open in the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
