export const COMMANDS = [
    {
        id: "heaterOn",
        category: "Calefactor",
        name: "Encender",
        title: "ON",
        icon: "static/icons/heater-on",
        tooltip: "Enciende el CX5120 en la red local"
    },
    {
        id: "heaterOff",
        category: "Calefactor",
        name: "Apagar",
        title: "OFF",
        icon: "static/icons/heater-off",
        tooltip: "Apaga el CX5120 en la red local"
    },
    {
        id: "heaterRotate",
        category: "Calefactor",
        name: "Rotar",
        title: "Rotar",
        icon: "static/icons/heater-rotate",
        tooltip: "Activa o para la rotación del CX5120"
    },
    {
        id: "heaterHigh",
        category: "Calefactor",
        name: "Calor fuerte",
        title: "Fuerte",
        icon: "static/icons/heater-high",
        tooltip: "Pone el CX5120 en calor fuerte por la red local"
    },
    {
        id: "heaterLow",
        category: "Calefactor",
        name: "Calor débil",
        title: "Débil",
        icon: "static/icons/heater-low",
        tooltip: "Pone el CX5120 en calor débil por la red local"
    },
    {
        id: "heaterFan",
        category: "Calefactor",
        name: "Ventilador",
        title: "Aire",
        icon: "static/icons/heater-fan",
        tooltip: "Pone el CX5120 en modo ventilador por la red local"
    }
];

export const CONTROLS = {
    heaterOn: { local: "on" },
    heaterOff: { local: "off" },
    heaterRotate: { local: "rotate" },
    heaterHigh: { local: "high" },
    heaterLow: { local: "low" },
    heaterFan: { local: "fan" }
};

const LABELS = {
    on: "Encender CX5120",
    off: "Apagar CX5120",
    rotate: "Rotación del CX5120",
    high: "Calor fuerte del CX5120",
    low: "Calor débil del CX5120",
    fan: "Ventilador del CX5120"
};

const byId = new Map(COMMANDS.map(command => [command.id, command]));

export function commandById(id) {
    return byId.get(id) || null;
}

export function controlFor(id) {
    return CONTROLS[id] || null;
}

export function describeControl(command) {
    const control = CONTROLS[command?.id];
    return LABELS[control?.local] || "Este botón no tiene una orden del CX5120.";
}

export function actionIdFromUuid(action) {
    if (!action) return "";
    const parts = String(action).split(".");
    return parts[parts.length - 1] || "";
}
