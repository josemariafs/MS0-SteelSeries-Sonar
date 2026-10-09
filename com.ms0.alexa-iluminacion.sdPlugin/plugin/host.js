import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { actionIdFromUuid, buildPhrase, bulbName, commandById, controlFor, describeControl, knobTargets, nextBrightness, resolvePhrase } from "./commands.js";
import { controlAppliance, controlAppliances, discoverDevices, explainAlexaFailure, findAppliance, listAppliances, normalizeCookie, sendTextCommand } from "./alexa.js";
import { loadEnvFile, resolveEnvPath, selectCookie, writeEnvValues } from "./env.js";
import { beginLogin, cookieFromSession, loadSession, openLogin, refreshLogin, saveSession, sessionPath, stopLogin } from "./session.js";

const __filename = fileURLToPath(import.meta.url);
const MODULE_DIR = path.dirname(__filename);
const ENV_PATH = resolveEnvPath(MODULE_DIR);
const SESSION_PATH = sessionPath(MODULE_DIR);
const BRIGHTNESS_PATH = path.join(MODULE_DIR, "brightness.json");
const LOG_PATH = path.join(process.env.APPDATA || os.tmpdir(), "HotSpot", "StreamDock", "logs", "alexa-iluminacion.log");

const DEFAULT_SETTINGS = {
    cookie: "",
    csrf: "",
    domain: "amazon.es",
    locale: "es-ES",
    heaterName: "calefactor",
    lightsName: "luces",
    bulb1Name: "Smart Bulb",
    bulb2Name: "Smart Bulb 2",
    bulb3Name: "Smart Bulb 3",
    device: null,
    appliances: [],
    appliancesLoaded: false
};

const contexts = new Map();
let socket = null;
let pluginUUID = "";
let globalSettings = { ...DEFAULT_SETTINGS };
let inspector = null;
let knownDevices = [];
let globalsReady = false;
let settingsRevision = 0;
let lastStatus = "Inicia sesión en Amazon para controlar las luces.";
let envFile = loadEnvFile(ENV_PATH);
let savedSession = loadSession(SESSION_PATH);
let loginTask = null;
let bootstrapped = false;
let levels = loadLevels();
const knobTimers = new Map();
let cookieSource = "";
let envApplied = false;
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

function setGlobalSettings(next) {
    settingsRevision += 1;
    globalSettings = {
        ...DEFAULT_SETTINGS,
        ...globalSettings,
        ...next,
        revision: settingsRevision
    };
    send({
        event: "setGlobalSettings",
        context: pluginUUID,
        payload: publicGlobalSettings()
    });
}

function publicGlobalSettings() {
    return {
        cookie: globalSettings.cookie || "",
        csrf: globalSettings.csrf || "",
        domain: globalSettings.domain || "amazon.es",
        locale: globalSettings.locale || "es-ES",
        heaterName: globalSettings.heaterName || "calefactor",
        lightsName: globalSettings.lightsName || "luces",
        bulb1Name: bulbName(globalSettings, "bulb1"),
        bulb2Name: bulbName(globalSettings, "bulb2"),
        bulb3Name: bulbName(globalSettings, "bulb3"),
        device: globalSettings.device || null,
        appliances: globalSettings.appliances || [],
        appliancesLoaded: Boolean(globalSettings.appliancesLoaded),
        revision: globalSettings.revision || settingsRevision
    };
}

function inspectorState(action) {
    const command = commandById(actionIdFromUuid(action));
    const stored = inspector ? contexts.get(inspector.actionContext) : null;
    const settings = stored?.settings || {};
    const custom = settings.custom === true || settings.custom === "true";
    return {
        type: "state",
        category: command?.category || "",
        name: command?.name || "",
        title: command?.title || "",
        knob: Boolean(command?.knob),
        phrase: command?.knob
            ? knobTargets(command, globalSettings).join(", ")
            : (command && controlFor(command.id) ? describeControl(command) : (command?.phrase ? resolvePhrase(command, settings, globalSettings) : "")),
        automaticPhrase: command?.phrase ? buildPhrase(command, globalSettings) : "",
        custom,
        heaterName: globalSettings.heaterName || "calefactor",
        lightsName: globalSettings.lightsName || "luces",
        bulb1Name: bulbName(globalSettings, "bulb1"),
        bulb2Name: bulbName(globalSettings, "bulb2"),
        bulb3Name: bulbName(globalSettings, "bulb3"),
        brightness: command?.knob ? levelFor(command) : null,
        domain: globalSettings.domain || "amazon.es",
        locale: globalSettings.locale || "es-ES",
        hasCookie: Boolean(globalSettings.cookie),
        hasSession: Boolean(savedSession?.refreshToken),
        cookieSource,
        sessionRejected: /\b401\b|caducad/.test(lastStatus),
        device: globalSettings.device || null,
        status: lastStatus
    };
}

function pushInspector(action, extra = {}) {
    if (!inspector) return;
    const payload = { ...inspectorState(action || inspector.action), ...extra };
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

function mergeDevice(devices, device) {
    if (!device?.serial) return devices;
    if (devices.some(item => item.serial === device.serial)) return devices;
    return [device, ...devices];
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

function refreshEnvCookie() {
    envFile = loadEnvFile(ENV_PATH);
    if (!envFile.cookie) return;
    cookieSource = "env";
    const domain = envFile.domain || globalSettings.domain || "amazon.es";
    const locale = envFile.locale || globalSettings.locale || "es-ES";
    if (normalizeCookie(globalSettings.cookie) === envFile.cookie
        && globalSettings.domain === domain
        && globalSettings.locale === locale) return;
    setGlobalSettings({ cookie: envFile.cookie, csrf: "", domain, locale });
    listedThisSession = false;
    log("cookie actualizada desde .env");
}

async function runCommand(context, command, settings) {
    const now = Date.now();
    if (now - (pressLocks.get(context) || 0) < 700) return;
    pressLocks.set(context, now);
    refreshEnvCookie();
    if (!globalSettings.cookie && savedSession?.refreshToken) await renewSession(true);

    const control = controlFor(command.id);
    if (!globalSettings.cookie) {
        lastStatus = "Inicia sesión en Amazon para controlar las luces.";
        flash(context, "Config", command.title);
        pushInspector();
        return;
    }

    if (!control) {
        lastStatus = "Este botón no tiene un dispositivo asignado.";
        flash(context, "N/A", command.title);
        pushInspector();
        return;
    }

    let ready = await ensureAppliances();
    if (!ready && savedSession?.refreshToken && /\b401\b|caducad/.test(lastStatus)) {
        const renewed = await renewSession(true);
        if (renewed) ready = await ensureAppliances();
    }
    if (!ready) {
        log(`error ${command.id} ${lastStatus}`);
        flash(context, "Error", command.title);
        pushInspector();
        return;
    }
    const names = settings?.deviceName ? [settings.deviceName, ...control.names] : control.names;
    const appliance = findHeater(globalSettings.appliances, names);

    setTitle(context, "...");
    try {
        await enqueue(() => runHeaterOrDevice(control, appliance));
        lastStatus = describeControl(command);
        log(`ok ${command.id} ${appliance?.name || control.voice || ""}`);
        flash(context, "OK", command.title);
    } catch (error) {
        lastStatus = explainAlexaFailure(error.message);
        log(`error ${command.id} ${lastStatus}`);
        flash(context, "Error", command.title);
    }
    pushInspector();
}

function findHeater(appliances, names) {
    return findAppliance(appliances, names)
        || (names.some(name => name.toLowerCase() === "calefactor")
            ? (appliances || []).find(item => /calefactor/i.test(item.name))
            : null);
}

async function runHeaterOrDevice(control, appliance) {
    if (control.parameters && appliance) {
        try {
            await controlAppliance(globalSettings, appliance.id, control.parameters);
            return;
        } catch (error) {
            if (!control.voice) throw error;
            log(`directo falló ${error.message}`);
        }
    }
    if (control.voice) {
        if (!globalSettings.device?.serial) {
            throw new Error("Elige un Echo. El calefactor se controla a través de él.");
        }
        await sendTextCommand(globalSettings, control.voice);
        return;
    }
    throw new Error(`No encuentro «${control.names[0]}» en Alexa.`);
}

function actionSettings() {
    if (!inspector?.actionContext) return {};
    return contexts.get(inspector.actionContext)?.settings || {};
}

async function handleInspector(data) {
    const payload = data.payload || {};
    const actionContext = payload.actionContext && contexts.has(payload.actionContext)
        ? payload.actionContext
        : inspector?.actionContext || singleContextFor(data.action);
    if (actionContext) inspector.actionContext = actionContext;

    if (payload.type === "ready") {
        refreshEnvCookie();
        if (!/\b401\b|caducad/.test(lastStatus)) lastStatus = connectionStatus();
        pushInspector(data.action, { devices: knownDevices });
        return;
    }

    if (payload.type === "setPhrase") {
        if (!actionContext) return;
        const current = contexts.get(actionContext) || { actionId: actionIdFromUuid(data.action), settings: {} };
        current.settings = {
            ...current.settings,
            custom: Boolean(payload.custom),
            phrase: String(payload.phrase || "").trim()
        };
        contexts.set(actionContext, current);
        send({
            event: "setSettings",
            context: actionContext,
            payload: current.settings
        });
        pushInspector(data.action, { devices: knownDevices });
        return;
    }

    if (payload.type === "setNames" || payload.type === "setDomain") {
        setGlobalSettings({
            heaterName: String(payload.heaterName || globalSettings.heaterName || "calefactor").trim(),
            lightsName: String(payload.lightsName || globalSettings.lightsName || "luces").trim(),
            bulb1Name: String(payload.bulb1Name || globalSettings.bulb1Name || "Smart Bulb").trim(),
            bulb2Name: String(payload.bulb2Name || globalSettings.bulb2Name || "Smart Bulb 2").trim(),
            bulb3Name: String(payload.bulb3Name || globalSettings.bulb3Name || "Smart Bulb 3").trim(),
            domain: String(payload.domain || globalSettings.domain || "amazon.es").trim(),
            locale: String(payload.locale || globalSettings.locale || "es-ES").trim()
        });
        lastStatus = "Ajustes guardados.";
        pushInspector(data.action, { devices: knownDevices });
        return;
    }

    if (payload.type === "startLogin") {
        await startAmazonLogin(data.action);
        return;
    }

    if (payload.type === "setCookie") {
        const cookie = normalizeCookie(payload.cookie);
        try {
            writeEnvValues(ENV_PATH, {
                ALEXA_COOKIE: cookie,
                ALEXA_DOMAIN: globalSettings.domain || "amazon.es",
                ALEXA_LOCALE: globalSettings.locale || "es-ES"
            });
            envFile = loadEnvFile(ENV_PATH);
            cookieSource = cookie ? "env" : "";
            lastStatus = cookie ? "Cookie guardada en .env. Buscando Echo..." : "Cookie borrada.";
        } catch (error) {
            cookieSource = cookie ? "app" : "";
            lastStatus = cookie ? "Cookie guardada en la app. Buscando Echo..." : "Cookie borrada.";
            log(`no se pudo escribir .env ${error.message}`);
        }
        setGlobalSettings({ cookie, csrf: "" });
        if (!cookie) knownDevices = [];
        pushInspector(data.action, { devices: knownDevices });
        if (cookie) await discoverAndStore(data.action);
        return;
    }

    if (payload.type === "discover") {
        await discoverAndStore(data.action);
        return;
    }

    if (payload.type === "setDevice") {
        const serial = String(payload.serial || "");
        const device = knownDevices.find(item => item.serial === serial)
            || (globalSettings.device?.serial === serial ? globalSettings.device : null);
        if (!device) {
            lastStatus = "No encuentro ese Echo. Vuelve a buscarlos.";
            pushInspector(data.action, { devices: knownDevices });
            return;
        }
        setGlobalSettings({ device });
        lastStatus = `Echo: ${device.name}`;
        pushInspector(data.action, { devices: knownDevices });
        return;
    }

    if (payload.type === "test") {
        const command = commandById(actionIdFromUuid(data.action));
        if (!command || !actionContext) return;
        await runCommand(actionContext, command, actionSettings());
    }
}

let applianceLoad = null;
let listedThisSession = false;

function ensureAppliances() {
    if (!globalSettings.cookie) return Promise.resolve(false);
    if (listedThisSession) return Promise.resolve(true);
    if (applianceLoad) return applianceLoad;
    applianceLoad = discoverAndStore().then(ok => {
        listedThisSession = Boolean(ok);
        return ok;
    }).finally(() => {
        applianceLoad = null;
    });
    return applianceLoad;
}

async function discoverAndStore(action) {
    try {
        lastStatus = "Buscando Echo...";
        pushInspector(action);
        const result = await discoverDevices(globalSettings);
        const appliances = await listAppliances(globalSettings);
        knownDevices = result.devices;
        const currentSerial = globalSettings.device?.serial;
        const selected = knownDevices.find(device => device.serial === currentSerial) || knownDevices[0] || null;
        setGlobalSettings({
            csrf: result.csrf,
            device: selected,
            appliances,
            appliancesLoaded: true
        });
        lastStatus = `Echo: ${selected?.name || "ninguno"}. Dispositivos: ${appliances.length}.`;
        pushInspector(action, { devices: knownDevices });
        log(`discover ${knownDevices.length} appliances ${appliances.length}`);
        return true;
    } catch (error) {
        lastStatus = explainAlexaFailure(error.message);
        log(`discover error ${lastStatus}`);
        pushInspector(action);
        return false;
    }
}

function onMessage(raw) {
    const data = JSON.parse(raw.data || raw);
    if (data.event === "willAppear") {
        const current = rememberContext(data);
        const command = commandById(current.actionId);
        if (command?.knob) {
            send({ event: "setFeedbackLayout", context: data.context, payload: { layout: "$B1" } });
            showKnob(data.context, command, levelFor(command));
            return;
        }
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
        const incoming = data.payload?.settings || {};
        const revision = Number(incoming.revision) || 0;
        if (!globalsReady) {
            globalsReady = true;
            const disk = { ...DEFAULT_SETTINGS, ...incoming };
            if (settingsRevision === 0) {
                settingsRevision = revision;
                globalSettings = disk;
            } else {
                globalSettings = { ...disk, ...globalSettings, revision: settingsRevision };
                send({
                    event: "setGlobalSettings",
                    context: pluginUUID,
                    payload: publicGlobalSettings()
                });
            }
        } else if (revision >= settingsRevision) {
            settingsRevision = revision;
            globalSettings = { ...DEFAULT_SETTINGS, ...incoming };
        }
        applyEnvDefaults();
        if (globalSettings.device) knownDevices = mergeDevice(knownDevices, globalSettings.device);
        pushInspector(undefined, { devices: knownDevices });
        if (!bootstrapped) {
            bootstrapped = true;
            bootstrapAlexa().catch(error => log(`arranque ${error.message}`));
        }
        return;
    }
    if (data.event === "propertyInspectorDidAppear") {
        inspector = {
            appearContext: data.context,
            replyContext: data.context,
            action: data.action,
            actionContext: contexts.has(data.context) ? data.context : singleContextFor(data.action)
        };
        pushInspector(data.action, { devices: knownDevices });
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
    if (data.event === "dialRotate") {
        const current = rememberContext(data);
        const command = commandById(current.actionId);
        if (!command?.knob) return;
        const ticks = Number(data.payload?.ticks) || 0;
        if (!ticks) return;
        scheduleKnob(data.context, command, ticks);
        return;
    }
    if (data.event === "dialDown" || data.event === "dialPress") {
        const current = rememberContext(data);
        const command = commandById(current.actionId);
        if (!command?.knob) return;
        const now = Date.now();
        if (now - (pressLocks.get(data.context) || 0) < 700) return;
        pressLocks.set(data.context, now);
        clearTimeout(knobTimers.get(command.id));
        knobTimers.delete(command.id);
        turnKnobOff(data.context, command).catch(error => log(`dial ${error.message}`));
        return;
    }
    if (data.event === "keyDown") {
        const current = rememberContext(data);
        const command = commandById(current.actionId);
        if (!command) return;
        runCommand(data.context, command, current.settings).catch(error => {
            log(`key ${error.message}`);
        });
    }
}

function rememberSession(result) {
    savedSession = result;
    saveSession(SESSION_PATH, result);
    const cookie = cookieFromSession(result);
    writeEnvValues(ENV_PATH, {
        ALEXA_COOKIE: cookie,
        ALEXA_DOMAIN: globalSettings.domain || envFile.domain || "amazon.es",
        ALEXA_LOCALE: globalSettings.locale || envFile.locale || "es-ES"
    });
    envFile = loadEnvFile(ENV_PATH);
    cookieSource = "env";
    listedThisSession = false;
    setGlobalSettings({ cookie, csrf: "" });
}

async function renewSession(announce) {
    if (!savedSession?.refreshToken || !savedSession?.loginCookie) return false;
    try {
        const next = await refreshLogin({
            domain: globalSettings.domain || envFile.domain || "amazon.es",
            locale: globalSettings.locale || envFile.locale || "es-ES",
            moduleDir: MODULE_DIR,
            session: savedSession
        });
        rememberSession(next);
        lastStatus = "Sesión de Alexa renovada.";
        log("sesión renovada");
        return true;
    } catch (error) {
        log(`renovar sesión ${error.message}`);
        if (announce) lastStatus = "No pude renovar la sesión. Vuelve a iniciar sesión en Amazon.";
        return false;
    }
}

async function bootstrapAlexa() {
    if (savedSession?.refreshToken) {
        lastStatus = "Renovando la sesión de Alexa...";
        pushInspector();
        await renewSession(false);
    }
    await ensureAppliances();
}

async function startAmazonLogin(action) {
    if (loginTask) {
        lastStatus = "El inicio de sesión ya está abierto en el navegador.";
        pushInspector(action);
        return;
    }
    await stopLogin();
    lastStatus = "Abriendo el inicio de sesión de Amazon...";
    pushInspector(action);
    loginTask = beginLogin({
        domain: globalSettings.domain || "amazon.es",
        locale: globalSettings.locale || "es-ES",
        moduleDir: MODULE_DIR,
        session: savedSession,
        onUrl(url) {
            openLogin(url);
            lastStatus = "Inicia sesión en el navegador. Si Amazon pide un código, escríbelo allí.";
            pushInspector(action, { loginUrl: url });
            log("login abierto en el navegador");
        }
    }).then(async result => {
        rememberSession(result);
        await stopLogin();
        lastStatus = "Sesión guardada. Buscando Echo...";
        log("inicio de sesión guardado");
        pushInspector(action);
        await discoverAndStore(action);
    }).catch(error => {
        lastStatus = error.message || "No se pudo iniciar sesión.";
        log(`login ${lastStatus}`);
        pushInspector(action);
    }).finally(() => {
        loginTask = null;
    });
    await loginTask;
}

function loadLevels() {
    const empty = { all: 50, bulb1: 50, bulb2: 50, bulb3: 50 };
    try {
        return { ...empty, ...JSON.parse(fs.readFileSync(BRIGHTNESS_PATH, "utf8")) };
    } catch {
        return empty;
    }
}

function saveLevels() {
    fs.writeFileSync(BRIGHTNESS_PATH, JSON.stringify(levels), "utf8");
}

function levelFor(command) {
    if (command?.targets?.length === 1) {
        const value = Number(levels[command.targets[0]]);
        if (Number.isFinite(value)) return value;
    }
    return Number(levels.all) || 0;
}

function showKnob(context, command, level) {
    const title = `${level}%`;
    setTitle(context, title);
    send({
        event: "setFeedback",
        context,
        payload: { title: command.title, value: title, indicator: level }
    });
}

function paintKnobs() {
    for (const [context, current] of contexts) {
        const command = commandById(current.actionId);
        if (command?.knob) showKnob(context, command, levelFor(command));
    }
}

function scheduleKnob(context, command, ticks) {
    const next = nextBrightness(levelFor(command), ticks);
    if (command.targets.length > 1) {
        levels.all = next;
        levels.bulb1 = next;
        levels.bulb2 = next;
        levels.bulb3 = next;
    } else {
        levels[command.targets[0]] = next;
    }
    saveLevels();
    paintKnobs();
    clearTimeout(knobTimers.get(command.id));
    knobTimers.set(command.id, setTimeout(() => {
        knobTimers.delete(command.id);
        applyKnob(context, command, next).catch(error => log(`dial ${error.message}`));
    }, 280));
}

async function turnKnobOff(context, command) {
    if (command.targets.length > 1) {
        levels.all = 0;
        levels.bulb1 = 0;
        levels.bulb2 = 0;
        levels.bulb3 = 0;
    } else {
        levels[command.targets[0]] = 0;
    }
    saveLevels();
    paintKnobs();
    await applyKnob(context, command, 0, true);
}

async function applyKnob(context, command, level, powerOff = false) {
    refreshEnvCookie();
    if (!globalSettings.cookie && savedSession?.refreshToken) await renewSession(true);
    if (!globalSettings.cookie) {
        lastStatus = "Inicia sesión en Amazon para controlar las luces.";
        flash(context, "Config", `${level}%`);
        pushInspector();
        return;
    }

    let ready = await ensureAppliances();
    if (!ready && savedSession?.refreshToken && /\b401\b|caducad/.test(lastStatus)) {
        if (await renewSession(true)) ready = await ensureAppliances();
    }
    if (!ready) {
        log(`error ${command.id} ${lastStatus}`);
        flash(context, "Error", `${level}%`);
        pushInspector();
        return;
    }

    const names = knobTargets(command, globalSettings);
    const requests = [];
    const missing = [];
    for (const name of names) {
        const appliance = findAppliance(globalSettings.appliances, [name]);
        if (appliance) {
            requests.push({
                id: appliance.id,
                parameters: powerOff ? { action: "turnOff" } : { action: "setBrightness", brightness: level }
            });
        }
        else missing.push(name);
    }
    if (!requests.length) {
        lastStatus = `No encuentro «${missing[0] || "la bombilla"}» en Alexa.`;
        log(`error ${command.id} ${lastStatus}`);
        flash(context, "Error", `${level}%`);
        pushInspector();
        return;
    }

    try {
        await enqueue(() => controlAppliances(globalSettings, requests));
        lastStatus = powerOff
            ? (requests.length > 1 ? "Las tres apagadas" : `${names[0]} apagada`)
            : (requests.length > 1 ? `Las tres al ${level}%` : `${names[0]} al ${level}%`);
        if (missing.length) lastStatus += `. No encuentro ${missing.join(", ")}.`;
        log(`ok ${command.id} ${powerOff ? "off" : level}`);
        showKnob(context, command, level);
    } catch (error) {
        lastStatus = explainAlexaFailure(error.message);
        log(`error ${command.id} ${lastStatus}`);
        flash(context, "Error", `${level}%`);
    }
    pushInspector();
}

function connectionStatus() {
    if (savedSession?.refreshToken && !globalSettings.cookie) return "Renovando la sesión de Alexa...";
    if (!globalSettings.cookie) return "Inicia sesión en Amazon para controlar las luces.";
    if (globalSettings.device?.name) return `Echo: ${globalSettings.device.name}`;
    return cookieSource === "env" ? "Cookie de .env cargada. Busca el Echo." : "Cookie guardada. Busca el Echo.";
}

function applyEnvDefaults() {
    if (envApplied) return;
    envApplied = true;
    const selected = selectCookie(envFile.cookie, globalSettings.cookie);
    cookieSource = selected.source;
    if (!selected.cookie) {
        lastStatus = savedSession?.refreshToken
            ? "Renovando la sesión de Alexa..."
            : "Inicia sesión en Amazon para controlar las luces.";
        log(savedSession?.refreshToken ? "hay sesión renovable" : "sin sesión de Alexa");
        return;
    }
    const domain = (cookieSource === "env" && envFile.domain) ? envFile.domain : (globalSettings.domain || "amazon.es");
    const locale = (cookieSource === "env" && envFile.locale) ? envFile.locale : (globalSettings.locale || "es-ES");
    const changed = normalizeCookie(globalSettings.cookie) !== selected.cookie
        || globalSettings.domain !== domain
        || globalSettings.locale !== locale;
    if (changed) {
        setGlobalSettings({ cookie: selected.cookie, csrf: "", domain, locale });
    }
    lastStatus = cookieSource === "env"
        ? "Cookie de .env cargada. Buscando Echo..."
        : "Cookie de la app cargada. Buscando Echo...";
    log(cookieSource === "env" ? "cookie cargada desde .env" : "cookie cargada desde la app");
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
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (launchedDirectly) {
    main().catch(error => {
        log(`fatal ${error.message}`);
        process.exit(1);
    });
}
