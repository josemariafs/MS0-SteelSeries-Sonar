import fs from "node:fs";
import path from "node:path";
import { normalizeCookie } from "./alexa.js";

const HEADER = `# Cookie de Alexa. Cabecera Cookie completa de alexa.amazon.es.
# Si ALEXA_COOKIE tiene valor, se usa al abrir Stream Dock.
# Si está vacía, puedes pegarla en el panel del botón.
`;

export function parseEnv(text) {
    const values = {};
    for (const line of String(text || "").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim().replace(/^export\s+/i, "");
        let value = trimmed.slice(eq + 1).trim();
        const quoted = value.startsWith("\"") && value.endsWith("\"") && value.length >= 2;
        if (quoted || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
            value = value.slice(1, -1);
        }
        if (quoted) {
            value = value.replace(/\\n/g, "\n").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
        }
        values[key] = value;
    }
    return values;
}

export function selectCookie(envCookie, savedCookie) {
    const fromEnv = normalizeCookie(envCookie);
    if (fromEnv) return { cookie: fromEnv, source: "env" };
    const fromApp = normalizeCookie(savedCookie);
    if (fromApp) return { cookie: fromApp, source: "app" };
    return { cookie: "", source: "" };
}

export function cookieSettingsFromEnv(values) {
    const parsed = values && values.ALEXA_COOKIE !== undefined ? values : parseEnv("");
    return {
        cookie: normalizeCookie(parsed.ALEXA_COOKIE || ""),
        domain: String(parsed.ALEXA_DOMAIN || "").trim(),
        locale: String(parsed.ALEXA_LOCALE || "").trim()
    };
}

export function resolveEnvPath(moduleDir) {
    const appRoot = path.resolve(moduleDir, "..", ".env");
    const besideHost = path.resolve(moduleDir, ".env");
    if (fs.existsSync(appRoot)) return appRoot;
    if (fs.existsSync(besideHost)) return besideHost;
    return appRoot;
}

export function loadEnvFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return { cookie: "", domain: "", locale: "", philipsHost: "", path: filePath || "", found: false };
    }
    const values = parseEnv(fs.readFileSync(filePath, "utf8"));
    return {
        ...cookieSettingsFromEnv(values),
        philipsHost: String(values.PHILIPS_HOST || "").trim(),
        path: filePath,
        found: true
    };
}

export function formatEnvValue(value) {
    return `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r?\n/g, " ")}"`;
}

export function upsertEnv(text, updates) {
    const lines = String(text ?? "").split(/\r?\n/);
    const pending = { ...updates };
    const next = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) return line;
        const key = trimmed.slice(0, eq).trim().replace(/^export\s+/i, "");
        if (!Object.prototype.hasOwnProperty.call(pending, key)) return line;
        const value = pending[key];
        delete pending[key];
        return `${key}=${formatEnvValue(value)}`;
    });
    const missing = Object.keys(pending);
    if (missing.length) {
        if (next.length && next[next.length - 1] !== "") next.push("");
        for (const key of missing) next.push(`${key}=${formatEnvValue(pending[key])}`);
    }
    return `${next.join("\n").replace(/\n+$/, "")}\n`;
}

export function writeEnvValues(filePath, updates) {
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : HEADER;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, upsertEnv(current, updates), "utf8");
}
