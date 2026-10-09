export const COMMANDS = [
    {
        id: "lightsOff",
        category: "Luces",
        name: "Apagar",
        title: "OFF",
        icon: "static/icons/lights-off",
        tooltip: "Apaga las luces a través de Alexa",
        phrase(lights) {
            return `apaga las ${lights}`;
        }
    },
    {
        id: "lightsOn",
        category: "Luces",
        name: "Encender",
        title: "ON",
        icon: "static/icons/lights-on",
        tooltip: "Enciende las luces a través de Alexa",
        phrase(lights) {
            return `enciende las ${lights}`;
        }
    },
    {
        id: "lights10",
        category: "Luces",
        name: "Al 10%",
        title: "10%",
        icon: "static/icons/lights-10",
        tooltip: "Pone las luces al 10% a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} al 10 por ciento`;
        }
    },
    {
        id: "lights50",
        category: "Luces",
        name: "Al 50%",
        title: "50%",
        icon: "static/icons/lights-50",
        tooltip: "Pone las luces al 50% a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} al 50 por ciento`;
        }
    },
    {
        id: "lights100",
        category: "Luces",
        name: "Al 100%",
        title: "100%",
        icon: "static/icons/lights-100",
        tooltip: "Pone las luces al 100% a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} al 100 por ciento`;
        }
    },
    {
        id: "lightsBlue",
        category: "Luces",
        name: "Color azul",
        title: "Azul",
        icon: "static/icons/lights-blue",
        tooltip: "Pone las luces de color azul a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color azul`;
        }
    },
    {
        id: "lightsRed",
        category: "Luces",
        name: "Color rojo",
        title: "Rojo",
        icon: "static/icons/lights-red",
        tooltip: "Pone las luces de color rojo a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color rojo`;
        }
    },
    {
        id: "lightsWhite",
        category: "Luces",
        name: "Blancas",
        title: "Blanco",
        icon: "static/icons/lights-white",
        tooltip: "Pone las luces de color blanco a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color blanco`;
        }
    },
    {
        id: "lightsGreen",
        category: "Luces",
        name: "Color verde",
        title: "Verde",
        icon: "static/icons/lights-green",
        tooltip: "Pone las luces de color verde a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color verde`;
        }
    },
    {
        id: "lightsYellow",
        category: "Luces",
        name: "Color amarillo",
        title: "Amarillo",
        icon: "static/icons/lights-yellow",
        tooltip: "Pone las luces de color amarillo a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color amarillo`;
        }
    },
    {
        id: "lightsOrange",
        category: "Luces",
        name: "Color naranja",
        title: "Naranja",
        icon: "static/icons/lights-orange",
        tooltip: "Pone las luces de color naranja a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color naranja`;
        }
    },
    {
        id: "lightsPurple",
        category: "Luces",
        name: "Color violeta",
        title: "Violeta",
        icon: "static/icons/lights-purple",
        tooltip: "Pone las luces de color violeta a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color violeta`;
        }
    },
    {
        id: "lightsPink",
        category: "Luces",
        name: "Color rosa",
        title: "Rosa",
        icon: "static/icons/lights-pink",
        tooltip: "Pone las luces de color rosa a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color rosa`;
        }
    },
    {
        id: "lightsCyan",
        category: "Luces",
        name: "Color cian",
        title: "Cian",
        icon: "static/icons/lights-cyan",
        tooltip: "Pone las luces de color cian a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color cian`;
        }
    },
    {
        id: "lightsGold",
        category: "Luces",
        name: "Color dorado",
        title: "Dorado",
        icon: "static/icons/lights-gold",
        tooltip: "Pone las luces de color dorado a través de Alexa",
        phrase(lights) {
            return `pon las ${lights} de color dorado`;
        }
    }
];

export const CONTROLS = {
    lightsOn: { names: ["Encender luces del salón"], parameters: { action: "sceneActivate" } },
    lightsOff: { names: ["Apagar luces del salón"], parameters: { action: "sceneActivate" } },
    lights10: { names: ["Salón"], parameters: { action: "setBrightness", brightness: 10 } },
    lights50: { names: ["Salón"], parameters: { action: "setBrightness", brightness: 50 } },
    lights100: { names: ["Salón"], parameters: { action: "setBrightness", brightness: 100 } },
    lightsBlue: { names: ["Salón"], parameters: { action: "setColor", colorName: "blue" } },
    lightsRed: { names: ["Salón"], parameters: { action: "setColor", colorName: "red" } },
    lightsWhite: { names: ["Salón"], parameters: { action: "setColor", colorName: "white" } },
    lightsGreen: { names: ["Salón"], parameters: { action: "setColor", colorName: "green" } },
    lightsYellow: { names: ["Salón"], parameters: { action: "setColor", colorName: "yellow" } },
    lightsOrange: { names: ["Salón"], parameters: { action: "setColor", colorName: "orange" } },
    lightsPurple: { names: ["Salón"], parameters: { action: "setColor", colorName: "purple" } },
    lightsPink: { names: ["Salón"], parameters: { action: "setColor", colorName: "pink" } },
    lightsCyan: { names: ["Salón"], parameters: { action: "setColor", colorName: "cyan" } },
    lightsGold: { names: ["Salón"], parameters: { action: "setColor", colorName: "gold" } }
};

export const BULBS = [
    { key: "bulb1", fallback: "Smart Bulb" },
    { key: "bulb2", fallback: "Smart Bulb 2" },
    { key: "bulb3", fallback: "Smart Bulb 3" }
];

export const KNOBS = [
    {
        id: "brightnessAll",
        category: "Luces",
        name: "Intensidad de las tres",
        title: "Todas",
        icon: "static/icons/knob-all",
        tooltip: "Regula a la vez el brillo de las tres bombillas. Al pulsarlo se apagan.",
        knob: true,
        targets: ["bulb1", "bulb2", "bulb3"]
    },
    {
        id: "brightness1",
        category: "Luces",
        name: "Bombilla 1",
        title: "1",
        icon: "static/icons/knob-1",
        tooltip: "Regula el brillo de la primera bombilla. Al pulsarlo se apaga.",
        knob: true,
        targets: ["bulb1"]
    },
    {
        id: "brightness2",
        category: "Luces",
        name: "Bombilla 2",
        title: "2",
        icon: "static/icons/knob-2",
        tooltip: "Regula el brillo de la segunda bombilla. Al pulsarlo se apaga.",
        knob: true,
        targets: ["bulb2"]
    },
    {
        id: "brightness3",
        category: "Luces",
        name: "Bombilla 3",
        title: "3",
        icon: "static/icons/knob-3",
        tooltip: "Regula el brillo de la tercera bombilla. Al pulsarlo se apaga.",
        knob: true,
        targets: ["bulb3"]
    }
];

const byId = new Map([...COMMANDS, ...KNOBS].map(command => [command.id, command]));

export function commandById(id) {
    return byId.get(id) || null;
}

export function controlFor(id) {
    return CONTROLS[id] || null;
}

export function describeControl(command) {
    const control = CONTROLS[command?.id];
    if (!control) return "Alexa no tiene un dispositivo para este modo.";
    const name = control.names[0];
    const action = control.parameters?.action;
    if (action === "setBrightness") return `${name} al ${control.parameters.brightness}%`;
    if (action === "setColor") return `${name}: ${control.parameters.colorName}`;
    if (action === "sceneActivate") return `Escena: ${name}`;
    return name;
}

export function bulbName(settings, key) {
    const bulb = BULBS.find(item => item.key === key);
    return cleanName(settings?.[`${key}Name`], bulb?.fallback || "");
}

export function knobTargets(command, settings) {
    return (command?.targets || []).map(key => bulbName(settings, key)).filter(Boolean);
}

export function nextBrightness(current, ticks, step = 5) {
    const start = Number.isFinite(Number(current)) ? Number(current) : 50;
    const delta = Number(ticks) || 0;
    return Math.min(100, Math.max(0, start + (delta * step)));
}

export function actionIdFromUuid(action) {
    if (!action) return "";
    const parts = String(action).split(".");
    return parts[parts.length - 1] || "";
}

export function buildPhrase(command, settings) {
    return command.phrase(cleanName(settings?.lightsName, "luces"));
}

export function resolvePhrase(command, actionSettings, globalSettings) {
    const custom = actionSettings?.custom === true || actionSettings?.custom === "true";
    const phrase = String(actionSettings?.phrase || "").trim();
    if (custom && phrase) return phrase;
    return buildPhrase(command, globalSettings);
}

function cleanName(value, fallback) {
    const name = String(value || "").trim().replace(/\s+/g, " ");
    return name || fallback;
}
