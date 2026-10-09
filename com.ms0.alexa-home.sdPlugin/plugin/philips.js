import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "cx5120.py");

function pythonLaunch(action, host) {
    const args = process.platform === "win32" ? ["-3", script, action] : [script, action];
    if (host) args.push(host);
    return { command: process.platform === "win32" ? "py" : "python3", args };
}

function runPhilips(action, host) {
    const launch = pythonLaunch(action, host);
    return new Promise((resolve, reject) => {
        const child = spawn(launch.command, launch.args, { windowsHide: true });
        let stderr = "";
        let stdout = "";
        child.stdout.on("data", chunk => {
            stdout += chunk;
        });
        child.stderr.on("data", chunk => {
            stderr += chunk;
        });
        child.on("error", () => reject(new Error("No encuentro Python para hablar con el CX5120.")));
        child.on("close", code => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || "El CX5120 no aceptó la orden."));
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch {
                resolve({});
            }
        });
    });
}

export function controlCx5120(action, host) {
    const target = String(host || "").trim();
    if (!target) {
        return Promise.reject(new Error("Falta PHILIPS_HOST en el archivo .env."));
    }
    return runPhilips(action, target);
}

export function locateCx5120(host) {
    return runPhilips("locate", String(host || "").trim());
}
