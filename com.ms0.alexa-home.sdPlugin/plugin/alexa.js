const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ALEXA_HOSTS = {
    "amazon.com": "pitangui.amazon.com",
    "amazon.ca": "pitangui.amazon.com",
    "amazon.com.mx": "pitangui.amazon.com",
    "amazon.de": "layla.amazon.de",
    "amazon.co.uk": "alexa.amazon.co.uk",
    "amazon.fr": "alexa.amazon.fr",
    "amazon.it": "alexa.amazon.it",
    "amazon.es": "alexa.amazon.es",
    "amazon.com.au": "alexa.amazon.com.au"
};

const ECHO_FAMILIES = new Set([
    "ECHO",
    "KNIGHT",
    "ROOK",
    "WHA",
    "THIRD_PARTY_AVS_MEDIA_PLAYER"
]);

export function alexaEndpoint(domain) {
    const normalized = String(domain || "amazon.es").trim().toLowerCase();
    const host = ALEXA_HOSTS[normalized] || `alexa.${normalized}`;
    return {
        domain: normalized,
        host,
        origin: `https://alexa.${normalized}`,
        referer: `https://alexa.${normalized}/spa/index.html`
    };
}

export function normalizeCookie(raw) {
    let value = String(raw || "").trim();
    if (/^cookie:/i.test(value)) {
        value = value.replace(/^cookie:/i, "").trim();
    }
    return value.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function extractCsrf(cookie) {
    const match = String(cookie || "").match(/(?:^|;\s*)csrf=([^;]+)/i);
    if (!match) return "";
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

export function parseDevices(payload) {
    const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.devices)
            ? payload.devices
            : [];

    return list
        .map(device => ({
            name: String(device.accountName || device.deviceAccountName || device.serialNumber || "Echo").trim(),
            serial: String(device.serialNumber || "").trim(),
            type: String(device.deviceType || "").trim(),
            customerId: String(device.deviceOwnerCustomerId || device.customerId || "").trim(),
            family: String(device.deviceFamily || "").trim(),
            online: device.online !== false
        }))
        .filter(device => device.serial && device.type && device.customerId)
        .sort((a, b) => {
            const aEcho = ECHO_FAMILIES.has(a.family) ? 0 : 1;
            const bEcho = ECHO_FAMILIES.has(b.family) ? 0 : 1;
            if (aEcho !== bEcho) return aEcho - bEcho;
            if (a.online !== b.online) return a.online ? -1 : 1;
            return a.name.localeCompare(b.name, "es");
        });
}

export function buildPreviewBody(device, locale, text) {
    const node = {
        "@type": "com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode",
        type: "Alexa.TextCommand",
        skillId: "amzn1.ask.1p.tellalexa",
        operationPayload: {
            deviceType: device.type,
            deviceSerialNumber: device.serial,
            customerId: device.customerId,
            locale: locale || "es-ES",
            text: String(text || "").trim().toLowerCase()
        }
    };

    return {
        behaviorId: "PREVIEW",
        sequenceJson: JSON.stringify({
            "@type": "com.amazon.alexa.behaviors.model.Sequence",
            startNode: {
                "@type": "com.amazon.alexa.behaviors.model.ParallelNode",
                nodesToExecute: [node]
            }
        }),
        status: "ENABLED"
    };
}

export async function discoverDevices(settings, fetchImpl = fetch) {
    const endpoint = alexaEndpoint(settings.domain);
    const cookie = normalizeCookie(settings.cookie);
    const csrf = extractCsrf(cookie) || settings.csrf || "";
    if (!cookie || !csrf) {
        throw new Error("La cookie no incluye csrf. Copia la cabecera Cookie completa de alexa.amazon.es.");
    }

    const response = await fetchImpl(`https://${endpoint.host}/api/devices-v2/device?cached=false`, {
        method: "GET",
        headers: alexaHeaders(endpoint, cookie, csrf),
        redirect: "follow"
    });
    const body = await response.text();
    if (!response.ok) {
        throw new Error(httpError("No se pudo leer los Echo", response.status, body));
    }

    let payload;
    try {
        payload = JSON.parse(body);
    } catch {
        throw new Error("Alexa no devolvió la lista de dispositivos.");
    }

    return {
        endpoint,
        csrf,
        devices: parseDevices(payload)
    };
}

export function parseAppliances(payload) {
    const list = Array.isArray(payload) ? payload : [];
    return list
        .map(entity => ({
            id: String(entity.id || "").trim(),
            name: String(entity.displayName || "").trim(),
            kind: String(entity.providerData?.deviceType || "").trim(),
            operations: Array.isArray(entity.supportedOperations) ? entity.supportedOperations.map(item => String(item)) : []
        }))
        .filter(entity => entity.id && entity.name);
}

export function findAppliance(appliances, names) {
    const wanted = new Set((names || []).map(name => String(name).trim().toLowerCase()).filter(Boolean));
    return (appliances || []).find(entity => wanted.has(String(entity.name || "").trim().toLowerCase())) || null;
}

export async function listAppliances(settings, fetchImpl = fetch) {
    const endpoint = alexaEndpoint(settings.domain);
    const cookie = normalizeCookie(settings.cookie);
    const csrf = extractCsrf(cookie) || settings.csrf || "";
    if (!cookie || !csrf) throw new Error("Falta la cookie de Alexa.");

    const response = await fetchImpl(`https://${endpoint.host}/api/behaviors/entities?skillId=amzn1.ask.1p.smarthome`, {
        method: "GET",
        headers: alexaHeaders(endpoint, cookie, csrf),
        redirect: "follow"
    });
    const body = await response.text();
    if (!response.ok) throw new Error(httpError("No se pudieron leer los dispositivos", response.status, body));
    return parseAppliances(JSON.parse(body));
}

export async function controlAppliance(settings, entityId, parameters, fetchImpl = fetch) {
    const endpoint = alexaEndpoint(settings.domain);
    const cookie = normalizeCookie(settings.cookie);
    const csrf = extractCsrf(cookie) || settings.csrf || "";
    if (!cookie || !csrf) throw new Error("Falta la cookie de Alexa.");

    const response = await fetchImpl(`https://${endpoint.host}/api/phoenix/state`, {
        method: "PUT",
        headers: {
            ...alexaHeaders(endpoint, cookie, csrf),
            "Content-Type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify({
            controlRequests: [{
                entityId,
                entityType: "APPLIANCE",
                parameters
            }]
        }),
        redirect: "follow"
    });
    const body = await response.text();
    if (!response.ok) throw new Error(httpError("Alexa rechazó el comando", response.status, body));

    let payload = {};
    try {
        payload = body ? JSON.parse(body) : {};
    } catch {
        payload = {};
    }
    const error = payload.errors?.[0];
    if (error) throw new Error(error.message || error.code || "Alexa no ejecutó el comando.");
    const result = payload.controlResponses?.[0];
    if (result?.code && result.code !== "SUCCESS") throw new Error(result.message || result.code);
    return { ok: true };
}

export async function sendTextCommand(settings, text, fetchImpl = fetch) {
    const phrase = String(text || "").trim();
    if (!phrase) throw new Error("La frase está vacía.");

    const device = settings.device;
    if (!device?.serial || !device?.type || !device?.customerId) {
        throw new Error("Elige el Echo que ejecutará los comandos.");
    }

    const endpoint = alexaEndpoint(settings.domain);
    const cookie = normalizeCookie(settings.cookie);
    const csrf = extractCsrf(cookie) || settings.csrf || "";
    if (!cookie || !csrf) {
        throw new Error("Falta la cookie de Alexa.");
    }

    const response = await fetchImpl(`https://${endpoint.host}/api/behaviors/preview`, {
        method: "POST",
        headers: {
            ...alexaHeaders(endpoint, cookie, csrf),
            "Content-Type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify(buildPreviewBody(device, settings.locale, phrase)),
        redirect: "follow"
    });
    const body = await response.text();
    if (!response.ok) {
        throw new Error(httpError("Alexa rechazó el comando", response.status, body));
    }
    return { ok: true, phrase: phrase.toLowerCase() };
}

function alexaHeaders(endpoint, cookie, csrf) {
    return {
        Accept: "application/json",
        "Accept-Language": "es-ES,es;q=0.9",
        Cookie: cookie,
        csrf,
        DNT: "1",
        Origin: endpoint.origin,
        Referer: endpoint.referer,
        "User-Agent": USER_AGENT
    };
}

export function explainAlexaFailure(message) {
    const text = String(message || "").trim();
    if (/\b401\b/.test(text)) {
        return "La cookie del .env está caducada. Alexa responde 401. Copia una cabecera Cookie nueva en alexa.amazon.es.";
    }
    return text || "No se pudo ejecutar el comando.";
}

function httpError(prefix, status, body) {
    if (status === 401) return explainAlexaFailure("401");
    const snippet = String(body || "").replace(/\s+/g, " ").slice(0, 180);
    return snippet ? `${prefix} (${status}): ${snippet}` : `${prefix} (${status}).`;
}
