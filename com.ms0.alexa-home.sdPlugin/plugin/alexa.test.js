import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPreviewBody, explainAlexaFailure, extractCsrf, normalizeCookie, parseDevices } from "./alexa.js";
import { COMMANDS, controlFor, describeControl } from "./commands.js";
import { cookieSettingsFromEnv, parseEnv, selectCookie, upsertEnv } from "./env.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("cada botón del calefactor apunta a una orden local del CX5120", () => {
    assert.equal(describeControl(COMMANDS.find(command => command.id === "heaterOn")), "Encender CX5120");
    assert.equal(describeControl(COMMANDS.find(command => command.id === "heaterOff")), "Apagar CX5120");
    assert.equal(controlFor("heaterRotate").local, "rotate");
    assert.equal(controlFor("heaterHigh").local, "high");
    assert.equal(controlFor("heaterLow").local, "low");
    assert.equal(controlFor("heaterFan").local, "fan");
    assert.equal(COMMANDS.some(command => command.id.startsWith("lights")), false);
});

test("la cookie del .env se usa y, si está vacía, vale la de la app", () => {
    assert.deepEqual(selectCookie("Cookie: session-id=1; csrf=abc", "session-id=vieja"), {
        cookie: "session-id=1; csrf=abc",
        source: "env"
    });
    assert.deepEqual(selectCookie("", "session-id=2; csrf=z"), {
        cookie: "session-id=2; csrf=z",
        source: "app"
    });
    assert.deepEqual(selectCookie("   ", ""), { cookie: "", source: "" });
});

test("el .env guarda la cookie sin perder los signos igual", () => {
    const text = upsertEnv("# nota\nALEXA_COOKIE=\nALEXA_DOMAIN=amazon.es\n", {
        ALEXA_COOKIE: "session-id=1; csrf=abc+123"
    });
    const parsed = cookieSettingsFromEnv(parseEnv(text));
    assert.equal(parsed.cookie, "session-id=1; csrf=abc+123");
    assert.equal(parsed.domain, "amazon.es");
    assert.match(text, /^# nota/m);
});

test("un 401 indica que la cookie del .env ha caducado", () => {
    assert.match(explainAlexaFailure("Alexa rechazó el comando (401)."), /caducad/);
    assert.equal(explainAlexaFailure("No encuentro Calefactor"), "No encuentro Calefactor");
});

test("la cookie se limpia y se extrae csrf", () => {
    const cookie = normalizeCookie("Cookie: session-id=1; csrf=abc%2B123\n");
    assert.equal(cookie, "session-id=1; csrf=abc%2B123");
    assert.equal(extractCsrf(cookie), "abc+123");
});

test("el comando de texto lleva el skill de Alexa y el Echo elegido", () => {
    const body = buildPreviewBody({
        type: "A1TYPE",
        serial: "G1SERIAL",
        customerId: "A1CUSTOMER"
    }, "es-ES", "Enciende el Calefactor");
    const sequence = JSON.parse(body.sequenceJson);
    const node = sequence.startNode.nodesToExecute[0];
    assert.equal(body.behaviorId, "PREVIEW");
    assert.equal(node.type, "Alexa.TextCommand");
    assert.equal(node.skillId, "amzn1.ask.1p.tellalexa");
    assert.equal(node.operationPayload.text, "enciende el calefactor");
    assert.equal(node.operationPayload.deviceSerialNumber, "G1SERIAL");
    assert.equal(node.operationPayload.locale, "es-ES");
});

test("los Echo conectados aparecen antes que el resto", () => {
    const devices = parseDevices({
        devices: [
            { accountName: "Cocina", serialNumber: "1", deviceType: "T", deviceOwnerCustomerId: "C", deviceFamily: "TABLET", online: true },
            { accountName: "Salón", serialNumber: "2", deviceType: "T", deviceOwnerCustomerId: "C", deviceFamily: "ECHO", online: true }
        ]
    });
    assert.deepEqual(devices.map(device => device.name), ["Salón", "Cocina"]);
});

test("el manifiesto de calefacción no incluye luces", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
    const ids = manifest.Actions.map(action => action.UUID.split(".").pop());
    assert.deepEqual(ids, COMMANDS.map(command => command.id));
    assert.equal(manifest.Name, "Alexa Calefacción");
    assert.equal(manifest.Actions.filter(action => action.Name.startsWith("Calefactor:")).length, 6);
    assert.equal(manifest.Actions.filter(action => action.Name.startsWith("Luces:")).length, 0);
    assert.equal(manifest.CodePathWin, "plugin/AlexaHome.exe");
});
