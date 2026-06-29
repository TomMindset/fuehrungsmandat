import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const nodePath = process.execPath;
const scripts = ["check-content.mjs", "check-plan.mjs"];

function runScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [path.join(root, "scripts", script)], {
      cwd: root,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} ist mit Code ${code} fehlgeschlagen.`));
    });
  });
}

for (const script of scripts) {
  await runScript(script);
}

console.log("Alle Fuehrungsmandat-Checks erfolgreich.");
