// `npm run dev:worker`: wrangler dev on :8788 (serving the last `npm run build`), with a memory guard.
//
// wrangler dev's Node process was seen at 16 GB of RAM after a long session (rebuilds, duels, reloads; it
// doesn't shrink back). This runs it, logs its memory every 30 s to .wrangler/dev-memory.log (to see what made
// it grow) and restarts it past DEV_MEM_LIMIT_MB (default 3000). Pages reconnect; rooms are on disk.
import { execSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";

const LIMIT_MB = Number(process.env.DEV_MEM_LIMIT_MB ?? 3000);
const LOG = ".wrangler/dev-memory.log";
const win = process.platform === "win32";
const args = ["node_modules/wrangler/bin/wrangler.js", "dev", "--port", "8788", ...process.argv.slice(2)];
mkdirSync(".wrangler", { recursive: true });
const log = (msg) => { const line = `${new Date().toISOString()} ${msg}`; console.log(`[dev-worker] ${msg}`); appendFileSync(LOG, line + "\n"); };

let child = null, restarting = false;
function start() {
  child = spawn(process.execPath, args, { stdio: "inherit" });
  log(`started wrangler dev (pid ${child.pid}), restart limit ${LIMIT_MB} MB`);
  child.on("exit", (code) => { if (!restarting) { log(`wrangler dev exited (${code})`); process.exit(code ?? 0); } });
}

/** RAM of the wrangler process tree (Node processes only: workerd is the worker runtime, counted apart). */
function treeMemory(rootPid) {
  try {
    const rows = win
      ? JSON.parse(execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,PrivatePageCount | ConvertTo-Json -Compress"`, { encoding: "utf8", maxBuffer: 1 << 26 }))
        .map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name, bytes: Number(p.PrivatePageCount) }))
      : execSync("ps -A -o pid=,ppid=,comm=,rss=", { encoding: "utf8" }).trim().split("\n")
        .map((l) => l.trim().split(/\s+/)).map(([pid, ppid, name, rss]) => ({ pid: +pid, ppid: +ppid, name, bytes: +rss * 1024 }));
    const kids = new Map();
    for (const r of rows) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r]);
    let node = 0, workerd = 0;
    const walk = (pid) => { for (const r of kids.get(pid) ?? []) { if (/workerd/i.test(r.name)) workerd += r.bytes; else if (/node/i.test(r.name)) node += r.bytes; walk(r.pid); } };
    const self = rows.find((r) => r.pid === rootPid);
    if (self) node += self.bytes;
    walk(rootPid);
    return { node: Math.round(node / 1048576), workerd: Math.round(workerd / 1048576) };
  } catch (e) { log(`couldn't read memory: ${String(e).slice(0, 200)}`); return null; }
}

function stopTree(pid) {
  try { if (win) execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" }); else process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
}

start();
let ticks = 0;
setInterval(() => {
  if (!child?.pid) return;
  const m = treeMemory(child.pid);
  if (!m) return;
  if (++ticks % 10 === 0 || m.node > LIMIT_MB * 0.8) log(`memory: wrangler ${m.node} MB, workerd ${m.workerd} MB`);
  if (m.node > LIMIT_MB) {
    log(`over ${LIMIT_MB} MB (${m.node} MB): restarting wrangler dev`);
    restarting = true;
    stopTree(child.pid);
    setTimeout(() => { restarting = false; start(); }, 1500);
  }
}, 30_000);

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { if (child?.pid) stopTree(child.pid); process.exit(0); });
