import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMANDS, KNOBS } from "./commands.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = "Alexa Iluminación";
const description = "Controla las luces del salón con Alexa desde el Stream Dock";

const manifest = {
    Actions: [...COMMANDS, ...KNOBS].map(command => ({
        Icon: command.icon,
        Name: `${command.category}: ${command.name}`,
        States: [
            {
                Image: command.icon,
                Title: command.title,
                FontSize: command.knob ? "20" : "16",
                TitleAlignment: command.knob ? "center" : "bottom"
            }
        ],
        Controllers: [command.knob ? "Knob" : "Keypad"],
        UserTitleEnabled: false,
        SupportedInMultiActions: false,
        Tooltip: command.tooltip,
        UUID: `com.ms0.alexa-home.${command.id}`,
        PropertyInspectorPath: "propertyInspector/command/index.html"
    })),
    SDKVersion: 2,
    Author: "MS0",
    Name: name,
    Icon: "static/icon",
    CodePath: "plugin/AlexaHome.exe",
    CodePathWin: "plugin/AlexaHome.exe",
    Description: description,
    Category: name,
    CategoryIcon: "static/icon",
    Version: "1.0.0",
    OS: [
        { Platform: "windows", MinimumVersion: "10" }
    ],
    Software: {
        MinimumVersion: "2.9"
    }
};

fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const localization = {
    Name: name,
    Description: description,
    Category: name,
    Localization: {
        Frase: "Frase",
        Luces: "Luces",
        Dominio: "Dominio",
        Idioma: "Idioma",
        Cookie: "Cookie",
        Echo: "Echo"
    }
};

for (const command of [...COMMANDS, ...KNOBS]) {
    localization[`com.ms0.alexa-home.${command.id}`] = {
        Name: `${command.category}: ${command.name}`,
        Tooltip: command.tooltip
    };
}

fs.writeFileSync(path.join(root, "es_ES.json"), `${JSON.stringify(localization, null, 2)}\n`);
