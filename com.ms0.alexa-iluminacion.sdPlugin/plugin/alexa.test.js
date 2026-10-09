import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COMMANDS, KNOBS, buildPhrase, controlFor, knobTargets, nextBrightness, resolvePhrase } from "./commands.js";
import { cookieFromSession, loginUrlFromError } from "./session.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("la frase automática usa el nombre de las luces", () => {
    const lights = COMMANDS.find(command => command.id === "lightsBlue");
    assert.equal(buildPhrase(lights, { lightsName: "lámparas del salón" }), "pon las lámparas del salón de color azul");
});

test("una frase personalizada sustituye a la automática", () => {
    const command = COMMANDS.find(item => item.id === "lightsOn");
    const phrase = resolvePhrase(command, { custom: true, phrase: "enciende el salón" }, { lightsName: "luces" });
    assert.equal(phrase, "enciende el salón");
});

test("el inicio de sesión reconoce la dirección local y la cookie renovada", () => {
    assert.equal(
        loginUrlFromError(new Error("Please open http://127.0.0.1:3457/ with your browser")),
        "http://127.0.0.1:3457/"
    );
    assert.equal(cookieFromSession({ localCookie: "session-id=1; csrf=abc" }), "session-id=1; csrf=abc");
    assert.equal(cookieFromSession({}), "");
});

test("los diales suben el brillo de una bombilla o de las tres", () => {
    assert.equal(nextBrightness(50, 2), 60);
    assert.equal(nextBrightness(5, -2), 0);
    assert.equal(nextBrightness(90, 4), 100);
    const all = KNOBS.find(command => command.id === "brightnessAll");
    const one = KNOBS.find(command => command.id === "brightness2");
    const settings = { bulb1Name: "Smart Bulb", bulb2Name: "Lámpara", bulb3Name: "Smart Bulb 3" };
    assert.deepEqual(knobTargets(all, settings), ["Smart Bulb", "Lámpara", "Smart Bulb 3"]);
    assert.deepEqual(knobTargets(one, settings), ["Lámpara"]);
});

test("el manifiesto conserva los UUID de las luces ya colocadas", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
    const ids = manifest.Actions.map(action => action.UUID);
    assert.equal(manifest.Name, "Alexa Iluminación");
    assert.deepEqual(ids, [...COMMANDS, ...KNOBS].map(command => `com.ms0.alexa-home.${command.id}`));
    assert.equal(manifest.Actions.filter(action => action.Controllers.includes("Knob")).length, 4);
    assert.equal(controlFor("lights50").parameters.brightness, 50);
    assert.equal(controlFor("lightsOff").names[0], "Apagar luces del salón");
    assert.equal(controlFor("lightsGreen").parameters.colorName, "green");
    assert.equal(controlFor("lightsPink").parameters.colorName, "pink");
    assert.equal(controlFor("lightsCyan").parameters.colorName, "cyan");
    assert.equal(controlFor("lightsGold").parameters.colorName, "gold");
    assert.equal(manifest.CodePathWin, "plugin/AlexaHome.exe");
});
