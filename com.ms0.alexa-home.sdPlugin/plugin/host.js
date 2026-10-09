import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { actionIdFromUuid, commandById, controlFor, describeControl } from "./commands.js";
import { loadEnvFile, resolveEnvPath, writeEnvValues } from "./env.js";
import { controlCx5120, locateCx5120 } from "./philips.js";

const __filename = fileURLToPath(import.meta.url);
const ENV_PATH = resolveEnvPath(path.dirname(__filename));
const LOG_PATH = path.join(process.env.APPDATA || os.tmpdir(), "HotSpot", "StreamDock", "logs", "alexa-home.log");

const contexts = new Map();
let socket = null;
let pluginUUID = "";
let inspector = null;
let envFile = loadEnvFile(ENV_PATH);
let lastStatus = "Buscando el CX5120 en la red...";
let queue = Promise.resolve();
const pressLocks = new Map();
const titleTimers = new Map();

function log(message) {
    const line = `${new Date().toISOString()} ${message}\n`;
    try {
        fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
        fs.appendFileSync(LOG_PATH, line);
    } catch {
        console.error(line.trim());
    }
}

function readStartupArgs() {
    const argFile = process.argv[2];
    if (argFile && fs.existsSync(argFile)) {
        const values = JSON.parse(fs.readFileSync(argFile, "utf8"));
        fs.rmSync(argFile, { force: true });
        return Array.isArray(values) ? values : [];
    }
    return process.argv.slice(2);
}

function flagValue(args, flag) {
    const index = args.indexOf(flag);
    if (index >= 0) return args[index + 1] || "";
    const inline = args.find(item => item.startsWith(`${flag}=`));
    return inline ? inline.slice(flag.length + 1) : "";
}

function send(message) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function setTitle(context, title) {
    send({
        event: "setTitle",
        context,
        payload: { title, target: 0 }
    });
}

function inspectorState(action) {
    const command = commandById(actionIdFromUuid(action));
    return {
        type: "state",
        category: command?.category || "Calefactor",
        name: command?.name || "",
        title: command?.title || "",
        phrase: describeControl(command),
        host: envFile.philipsHost || "",
        status: lastStatus
    };
}

function pushInspector(action) {
    if (!inspector) return;
    const payload = inspectorState(action || inspector.action);
    const targets = [inspector.appearContext, inspector.replyContext].filter(Boolean);
    const seen = new Set();
    for (const context of targets) {
        if (seen.has(context)) continue;
        seen.add(context);
        send({
            event: "sendToPropertyInspector",
            context,
            action: action || inspector.action,
            payload
        });
    }
}

function singleContextFor(action) {
    const id = actionIdFromUuid(action);
    const matches = [...contexts.keys()].filter(context => contexts.get(context)?.actionId === id);
    return matches.length === 1 ? matches[0] : "";
}

function rememberContext(data) {
    const actionId = actionIdFromUuid(data.action);
    const current = contexts.get(data.context) || { actionId, settings: {} };
    current.actionId = actionId;
    if (data.event !== "keyDown" && data.payload?.settings) current.settings = data.payload.settings;
    contexts.set(data.context, current);
    return current;
}

function flash(context, temporary, restore) {
    setTitle(context, temporary);
    clearTimeout(titleTimers.get(context));
    titleTimers.set(context, setTimeout(() => setTitle(context, restore), 1400));
}

function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.then(() => {}, () => {});
    return run;
}

let philipsSearch = null;

function ensurePhilipsHost(force = false) {
    if (force) philipsSearch = null;
    if (!philipsSearch) {
        philipsSearch = (async () => {
            envFile = loadEnvFile(ENV_PATH);
            const current = envFile.philipsHost || "";
            const found = await locateCx5120(current);
            const host = String(found?.host || "").trim();
            if (!host) throw new Error("No encuentro el CX5120 en la red.");
            if (host !== current) {
                writeEnvValues(ENV_PATH, { PHILIPS_HOST: host });
                envFile = loadEnvFile(ENV_PATH);
                log(`philips host actualizado ${host}`);
            } else {
                log(`philips host ${host}`);
            }
            lastStatus = `CX5120 en ${host}`;
            pushInspector();
            return host;
        })().catch(error => {
            philipsSearch = null;
            lastStatus = error.message || "No encuentro el CX5120 en la red.";
            pushInspector();
            throw error;
        });
    }
    return philipsSearch;
}

async function runCommand(context, command) {
    const now = Date.now();
    if (now - (pressLocks.get(context) || 0) < 700) return;
    pressLocks.set(context, now);

    const control = controlFor(command.id);
    if (!control?.local) {
        lastStatus = "Este botón no tiene una orden del CX5120.";
        flash(context, "N/A", command.title);
        pushInspector();
        return;
    }

    setTitle(context, "...");
    try {
        const result = await enqueue(async () => {
            let host = await ensurePhilipsHost();
            try {
                return await controlCx5120(control.local, host);
            } catch (error) {
                if (!/no responde|no encuentro/i.test(error.message || "")) throw error;
                host = await ensurePhilipsHost(true);
                return controlCx5120(control.local, host);
            }
        });
        lastStatus = control.local === "rotate"
            ? (result?.swing ? "Rotación activada" : "Rotación parada")
            : describeControl(command);
        log(`ok ${command.id} cx5120 ${control.local}`);
        flash(context, "OK", command.title);
    } catch (error) {
        lastStatus = error.message || "El CX5120 no aceptó la orden.";
        log(`error ${command.id} ${lastStatus}`);
        flash(context, "Error", command.title);
    }
    pushInspector();
}

async function handleInspector(data) {
    const payload = data.payload || {};
    const actionContext = payload.actionContext && contexts.has(payload.actionContext)
        ? payload.actionContext
        : inspector?.actionContext || singleContextFor(data.action);
    if (actionContext) inspector.actionContext = actionContext;

    if (payload.type === "ready") {
        pushInspector(data.action);
        return;
    }

    if (payload.type === "test") {
        const command = commandById(actionIdFromUuid(data.action));
        if (!command || !actionContext) return;
        await runCommand(actionContext, command);
    }
}

function onMessage(raw) {
    const data = JSON.parse(raw.data || raw);
    if (data.event === "willAppear") {
        const current = rememberContext(data);
        const command = commandById(current.actionId);
        if (command) setTitle(data.context, command.title);
        return;
    }
    if (data.event === "willDisappear") {
        contexts.delete(data.context);
        return;
    }
    if (data.event === "didReceiveSettings") {
        rememberContext(data);
        if (inspector?.actionContext === data.context) pushInspector(data.action);
        return;
    }
    if (data.event === "didReceiveGlobalSettings") {
        pushInspector();
        return;
    }
    if (data.event === "propertyInspectorDidAppear") {
        inspector = {
            appearContext: data.context,
            replyContext: data.context,
            action: data.action,
            actionContext: contexts.has(data.context) ? data.context : singleContextFor(data.action)
        };
        pushInspector(data.action);
        return;
    }
    if (data.event === "sendToPlugin") {
        if (!inspector) {
            inspector = {
                appearContext: data.context,
                replyContext: data.context,
                action: data.action,
                actionContext: singleContextFor(data.action)
            };
        } else {
            inspector.replyContext = data.context;
            inspector.action = data.action;
        }
        handleInspector(data).catch(error => {
            lastStatus = error.message || "Error de configuración.";
            log(`inspector ${lastStatus}`);
            pushInspector(data.action);
        });
        return;
    }
    if (data.event === "keyDown") {
        const current = rememberContext(data);
        const command = commandById(current.actionId);
        if (!command) return;
        runCommand(data.context, command).catch(error => {
            log(`key ${error.message}`);
        });
    }
}

function connectSocket(port) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        let settled = false;
        const fail = (error) => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch { /* already closed */ }
            reject(error instanceof Error ? error : new Error("No hay conexión con Stream Dock"));
        };
        ws.addEventListener("open", () => {
            if (settled) return;
            settled = true;
            resolve(ws);
        });
        ws.addEventListener("error", () => fail(new Error("WebSocket rechazado")));
    });
}

async function main() {
    const args = readStartupArgs();
    const port = flagValue(args, "-port");
    pluginUUID = flagValue(args, "-pluginUUID");
    const registerEvent = flagValue(args, "-registerEvent") || "registerPlugin";
    if (!port || !pluginUUID) {
        log("faltan -port o -pluginUUID");
        process.exit(1);
    }

    let lastError = null;
    for (let attempt = 1; attempt <= 20; attempt += 1) {
        try {
            socket = await connectSocket(port);
            lastError = null;
            break;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }
    if (!socket) {
        log(`sin socket ${lastError?.message || ""}`);
        process.exit(1);
    }

    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", () => process.exit(0));
    send({ event: registerEvent, uuid: pluginUUID });
    send({ event: "getGlobalSettings", context: pluginUUID });
    log("registrado");
    ensurePhilipsHost().catch(error => log(`philips ${error.message}`));
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (launchedDirectly) {
    main().catch(error => {
        log(`fatal ${error.message}`);
        process.exit(1);
    });
}
