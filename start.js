// start.js
// =============================================================================
//  AuthOnce — Process Launcher
//  Runs keeper.js and notifier.js as child processes simultaneously
// =============================================================================

const { spawn } = require("child_process");
const path = require("path");

function launch(script) {
  const name = path.basename(script, ".js").toUpperCase();
  const proc = spawn("node", [script], {
    stdio: "pipe",
    env: process.env,
  });

  proc.stdout.on("data", (data) => {
    data.toString().trim().split("\n").forEach(line => {
      console.log(`[${name}] ${line}`);
    });
  });

  proc.stderr.on("data", (data) => {
    data.toString().trim().split("\n").forEach(line => {
      console.error(`[${name}] ${line}`);
    });
  });

  proc.on("exit", (code) => {
    console.error(`[${name}] Process exited with code ${code} — restarting in 5s...`);
    setTimeout(() => launch(script), 5000);
  });

  console.log(`[LAUNCHER] Started ${name}`);
  return proc;
}

console.log("=".repeat(60));
console.log("  AuthOnce — Process Launcher");
console.log("=".repeat(60));

launch("scripts/keeper.js");
launch("scripts/notifier.js");

process.on("SIGINT", () => {
  console.log("\n[LAUNCHER] Shutting down...");
  process.exit(0);
});
