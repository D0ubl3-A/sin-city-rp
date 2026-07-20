const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const dependencyRoot = fs.realpathSync(path.join(__dirname, "node_modules"));
const desktopDataPath = path.join(path.dirname(dependencyRoot), "electron-profile");
app.setPath("userData", desktopDataPath);
app.commandLine.appendSwitch("disk-cache-dir", path.join(desktopDataPath, "cache"));

const GAME_URL = "https://sin-city-rp.illcoai-tech.chatgpt.site";
let gameServer = null;

function serverIsReady() {
  return new Promise((resolve) => {
    const transport = GAME_URL.startsWith("https:") ? https : http;
    const request = transport.get(GAME_URL, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.setTimeout(800, () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

async function ensureGameServer() {
  if (await serverIsReady()) return;
  gameServer = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--port", "4174", "--strictPort"],
    { cwd: __dirname, windowsHide: true, stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await serverIsReady()) return;
  }
  throw new Error("Sin City RP server did not start on port 4174.");
}

async function createWindow() {
  await ensureGameServer();
  const window = new BrowserWindow({
    title: "Sin City RP",
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#05070b",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
    window.focus();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  await window.loadURL(GAME_URL);
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", () => {
  if (gameServer && !gameServer.killed) gameServer.kill();
});