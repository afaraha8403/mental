// Mental for Cursor: a sidebar that frames the local Mental dashboard for this
// workspace, a status bar item for what needs you, and Park / Hand off.
// Everything is read through the Mental CLI; the extension never writes
// Mental data itself.
"use strict";

const vscode = require("vscode");
const { spawn } = require("node:child_process");
const { readFileSync, rmSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");
const { PARK_PROMPT, HANDOFF_PROMPT, cliCommand, jsonOf, advertisedUrl, embedUrl, statusOf } = require("./lib.js");

const REFRESH_MS = 60_000;
const START_WAIT_MS = 12_000;
const VIEW_ID = "mental.panel";

/** The first workspace folder: Mental binds a project by its git checkout. */
function cwdOf() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Run the Mental CLI and resolve with its stdout (never rejects).
 * @param {string[]} args
 * @param {{ detached?: boolean, timeoutMs?: number }} [o]
 */
function runMental(args, o = {}) {
  const cliPath = vscode.workspace.getConfiguration("mental").get("cliPath") || "";
  const cmd = cliCommand(args, { cliPath, comSpec: process.env.ComSpec });
  return new Promise((resolve) => {
    let out = "";
    let child;
    try {
      child = spawn(cmd.file, cmd.args, {
        cwd: cwdOf(),
        windowsHide: true,
        windowsVerbatimArguments: cmd.verbatim,
        detached: !!o.detached,
        stdio: o.detached ? "ignore" : ["ignore", "pipe", "ignore"],
      });
    } catch {
      resolve("");
      return;
    }
    if (o.detached) {
      child.unref();
      resolve("");
      return;
    }
    const timer = setTimeout(() => child.kill(), o.timeoutMs || 20_000);
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => resolve(""));
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out);
    });
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

/** True when `url` answers as a Mental dashboard. */
async function answers(url) {
  try {
    const r = await fetch(`${url}api/where`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

/** A running dashboard's root URL: the port file's, else the default port. */
async function findDashboard() {
  let body = null;
  try {
    body = JSON.parse(readFileSync(join(homedir(), ".mental", "dashboard.json"), "utf8"));
  } catch {
    /* no port file */
  }
  const advertised = advertisedUrl(body, isAlive);
  if (advertised && (await answers(advertised))) return advertised;
  const fallback = "http://127.0.0.1:3847/";
  return (await answers(fallback)) ? fallback : null;
}

/**
 * Stop the dashboard the port file names. Its pid is trusted only while its
 * URL still answers as a Mental dashboard, so a recycled pid is never killed.
 */
async function stopDashboard() {
  const file = join(homedir(), ".mental", "dashboard.json");
  let body;
  try {
    body = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
  const url = advertisedUrl(body, isAlive);
  if (!url || !Number.isInteger(body.pid) || !(await answers(url))) return false;
  try {
    process.kill(body.pid);
  } catch {
    return false;
  }
  // On Windows the kill is immediate, so the server never removes its own file.
  rmSync(file, { force: true });
  return true;
}

/** A running dashboard, starting one (detached, exits after 30 idle minutes) when none answers. */
async function ensureDashboard() {
  const found = await findDashboard();
  if (found) return found;
  await runMental(["dashboard", "--no-open", "--idle-exit", "30"], { detached: true });
  const until = Date.now() + START_WAIT_MS;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 400));
    const url = await findDashboard();
    if (url) return url;
  }
  return null;
}

/** The sidebar: the dashboard's Today view for this project, in embed mode. */
class PanelProvider {
  constructor() {
    /** @type {vscode.WebviewView | null} */
    this.view = null;
    this.projectId = null;
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: false, enableCommandUris: true };
    view.onDidChangeVisibility(() => view.visible && this.load());
    this.load();
  }

  async load() {
    const view = this.view;
    if (!view) return;
    view.webview.html = this.page({ state: "loading" });
    if (!cwdOf()) {
      view.webview.html = this.page({ state: "message", text: "Open a folder to see its Mental thread." });
      return;
    }
    const [where, url] = await Promise.all([runMental(["where", "--json"]).then(jsonOf), ensureDashboard()]);
    this.projectId = where?.data?.id || null;
    view.webview.html = url
      ? this.page({ state: "ready", src: embedUrl(url, this.projectId) })
      : this.page({ state: "message", text: "The Mental dashboard didn't start. Check that `mental` is installed (`npm i -g @balacode/mental`), then retry." });
  }

  /** @param {{ state: "loading" | "ready" | "message", src?: string, text?: string }} p */
  page(p) {
    const csp = [
      "default-src 'none'",
      "frame-src http://127.0.0.1:* http://localhost:*",
      `style-src ${this.view.webview.cspSource} 'unsafe-inline'`,
    ].join("; ");
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const body =
      p.state === "ready"
        ? `<iframe src="${esc(p.src)}" title="Mental" allow="clipboard-write"></iframe>`
        : `<div class="msg"><p>${p.state === "loading" ? "Reading the thread…" : esc(p.text)}</p>${p.state === "message" ? '<p><a href="command:mental.refresh">Retry</a></p>' : ""}</div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{height:100%;margin:0;padding:0;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}
.msg{padding:16px;font:13px var(--vscode-font-family);color:var(--vscode-descriptionForeground)}a{color:var(--vscode-textLink-foreground)}</style>
</head><body>${body}</body></html>`;
  }
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const panel = new PanelProvider();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "workbench.view.extension.mental";
  status.name = "Mental";

  const refreshStatus = async () => {
    if (!cwdOf()) {
      status.hide();
      return;
    }
    const s = statusOf(jsonOf(await runMental(["heartbeat", "--json", "--passive"])));
    status.text = s.text;
    status.tooltip = s.tooltip;
    status.backgroundColor = s.tone === "needs" ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    status.show();
  };

  // Cursor exposes no supported way for an extension to type into its chat,
  // so the prompt goes on the clipboard and a new agent chat opens for it.
  const ask = (prompt) => async () => {
    await vscode.env.clipboard.writeText(prompt);
    for (const id of ["composer.newAgentChat", "aichat.newchataction", "workbench.action.chat.open"]) {
      try {
        await vscode.commands.executeCommand(id);
        break;
      } catch {
        /* the next one */
      }
    }
    vscode.window.showInformationMessage(`"${prompt}" is on the clipboard. Paste it into the chat and send.`);
  };

  context.subscriptions.push(
    status,
    vscode.window.registerWebviewViewProvider(VIEW_ID, panel, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand("mental.park", ask(PARK_PROMPT)),
    vscode.commands.registerCommand("mental.handoff", ask(HANDOFF_PROMPT)),
    vscode.commands.registerCommand("mental.refresh", async () => {
      await Promise.all([refreshStatus(), panel.load()]);
    }),
    vscode.commands.registerCommand("mental.openInBrowser", async () => {
      const url = await ensureDashboard();
      if (url) vscode.env.openExternal(vscode.Uri.parse(embedUrl(url, panel.projectId).replace("?embed=1", "")));
      else vscode.window.showWarningMessage("The Mental dashboard didn't start. Run `mental dashboard` in a terminal.");
    }),
    vscode.commands.registerCommand("mental.stopDashboard", async () => {
      vscode.window.showInformationMessage((await stopDashboard()) ? "Mental dashboard stopped." : "No dashboard this Mental started is running.");
      panel.load();
    }),
    vscode.window.onDidChangeWindowState((s) => s.focused && refreshStatus()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshStatus();
      panel.load();
    }),
  );
  const timer = setInterval(refreshStatus, REFRESH_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  refreshStatus();
}

function deactivate() {}

module.exports = { activate, deactivate };
