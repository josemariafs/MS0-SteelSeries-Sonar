import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const alexaCookie = require("alexa-cookie2");

export function sessionPath(moduleDir) {
    return path.resolve(moduleDir, "..", "alexa-session.json");
}

export function deviceStorePath(moduleDir) {
    return path.resolve(moduleDir, "..", "alexa-device.json");
}

export function loadSession(filePath) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return null;
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return data && typeof data === "object" ? data : null;
    } catch {
        return null;
    }
}

export function saveSession(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
}

export function cookieFromSession(session) {
    return String(session?.localCookie || session?.cookie || "").trim();
}

export function loginUrlFromError(error) {
    const match = String(error?.message || error || "").match(/https?:\/\/\S+/);
    return match ? match[0].replace(/[.)]+$/, "") : "";
}

function proxyOptions(domain, locale, moduleDir, session) {
    return {
        amazonPage: domain || "amazon.es",
        acceptLanguage: locale || "es-ES",
        amazonPageProxyLanguage: String(locale || "es-ES").replace("-", "_"),
        baseAmazonPage: "amazon.com",
        proxyOnly: true,
        setupProxy: true,
        proxyOwnIp: "127.0.0.1",
        proxyListenBind: "127.0.0.1",
        proxyPort: 3457,
        proxyLogLevel: "error",
        deviceAppName: "MS0 Iluminacion",
        formerDataStorePath: deviceStorePath(moduleDir),
        formerRegistrationData: session?.refreshToken ? session : undefined,
        proxyCloseWindowHTML: "Sesión de Alexa guardada. Ya puedes cerrar esta ventana.",
        logger() {}
    };
}

export function beginLogin({ domain, locale, moduleDir, session, onUrl }) {
    return new Promise((resolve, reject) => {
        let settled = false;
        alexaCookie.generateAlexaCookie(proxyOptions(domain, locale, moduleDir, session), (error, result) => {
            const url = loginUrlFromError(error);
            if (url) {
                if (onUrl) onUrl(url);
                return;
            }
            if (settled) return;
            settled = true;
            if (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            if (!result?.refreshToken || !cookieFromSession(result)) {
                reject(new Error("Amazon no devolvió una sesión renovable."));
                return;
            }
            resolve(result);
        });
    });
}

export function refreshLogin({ domain, locale, moduleDir, session }) {
    return new Promise((resolve, reject) => {
        alexaCookie.refreshAlexaCookie({
            ...proxyOptions(domain, locale, moduleDir, null),
            formerRegistrationData: session
        }, (error, result) => {
            if (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            if (!cookieFromSession(result)) {
                reject(new Error("Amazon no devolvió una cookie nueva."));
                return;
            }
            resolve(result);
        });
    });
}

export function stopLogin() {
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        try {
            alexaCookie.stopProxyServer(finish);
        } catch {
            finish();
        }
        setTimeout(finish, 400);
    });
}

export function openLogin(url) {
    const child = spawn("rundll32", ["url.dll,FileProtocolHandler", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
    });
    child.unref();
}
