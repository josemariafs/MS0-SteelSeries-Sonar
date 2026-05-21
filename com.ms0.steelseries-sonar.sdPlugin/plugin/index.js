/// <reference path="./utils/common.js" />
/// <reference path="./utils/axios.js" />
/// <reference path="./utils/worker.js" />

const plugin = new Plugins("Dials Volume Mixer");
const CORE_PROPS_URL = "file:///C:/ProgramData/SteelSeries/SteelSeries%20Engine%203/coreProps.json";
const SYNC_INTERVAL_MS = 3000;
const RETRY_INTERVAL_MS = 5000;
const VOLUME_STEP = 0.05;
const MIN_KNOB_VOLUME = 0.01;
const MUTED_EPSILON = 0.001;
const VOLUME_LAYOUT = "$B1";
const AUX_MEDIA_LAYOUT = "$AUXMEDIA";
const METER_VOLUME_LAYOUT = "$MIXERMETER";
const METER_AUX_MEDIA_LAYOUT = "$AUXMEDIAMETER";

let ggEncryptedAddress = "";
let webServerAddress = "";
let sonarMode = "";
let syncTimer = null;
let retryTimer = null;
let isSyncing = false;
let syncPromise = null;
let isInitializing = false;
let alignRight = "          ";
let currentLayoutIndex = 0;
let lastLayoutToggleAt = 0;
let visualFrame = 0;
let visualAnimationTimer = null;

const MIXER_LAYOUT_PRESETS = [
    {
        name: "Inicial",
        channelLayout: VOLUME_LAYOUT,
        auxMediaLayout: AUX_MEDIA_LAYOUT,
        displayMode: "numeric"
    },
    {
        name: "Meter",
        channelLayout: METER_VOLUME_LAYOUT,
        auxMediaLayout: METER_AUX_MEDIA_LAYOUT,
        displayMode: "meter"
    }
];

const volumeState = {
    master: 0,
    game: 0,
    chat: 0,
    media: 0,
    aux: 0
};

const previousVolumeState = {
    master: 0.5,
    game: 0.5,
    chat: 0.5,
    media: 0.5,
    aux: 0.5
};

const CHANNELS = {
    master: {
        actionName: "masterAction",
        apiChannel: "master",
        read: data => data.masters[sonarMode].volume,
        label: "Master",
        icon: "static/iconpack3/iconMaster"
    },
    game: {
        actionName: "gameAction",
        apiChannel: "game",
        read: data => data.devices.game[sonarMode].volume,
        label: "Game",
        icon: "static/iconpack3/iconGame"
    },
    chat: {
        actionName: "chatAction",
        apiChannel: "chatRender",
        read: data => data.devices.chatRender[sonarMode].volume,
        label: "Chat",
        icon: "static/iconpack3/iconChat"
    },
    media: {
        actionName: "mediaAction",
        apiChannel: "media",
        read: data => data.devices.media[sonarMode].volume,
        label: "Media",
        icon: "static/iconpack3/iconMedia"
    },
    aux: {
        actionName: "auxAction",
        apiChannel: "aux",
        read: data => data.devices.aux[sonarMode].volume,
        label: "Aux",
        icon: "static/iconpack3/iconAux"
    }
};

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 5000);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function getFetch(url) {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
        throw new Error("GET failed " + response.status + " for " + url);
    }
    return response.json();
}

async function setPut(url) {
    const response = await fetchWithTimeout(url, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        }
    });
    if (!response.ok) {
        throw new Error("PUT failed " + response.status + " for " + url);
    }
}

function clampVolume(value) {
    return Math.min(1, Math.max(0, value));
}

function clampKnobVolume(value) {
    return Math.min(1, Math.max(MIN_KNOB_VOLUME, value));
}

function formatPercent(value) {
    return parseInt(clampVolume(value) * 100) + "%";
}

function formatBar(value, width = 6) {
    const filled = Math.round(clampVolume(value) * width);
    return "[" + "#".repeat(filled) + "-".repeat(width - filled) + "]";
}

function formatDots(value, width = 6) {
    const filled = Math.round(clampVolume(value) * width);
    return "o".repeat(filled) + ".".repeat(width - filled);
}

function formatMeter(value, width = 7) {
    const position = Math.min(width - 1, Math.max(0, Math.round(clampVolume(value) * (width - 1))));
    return "|".repeat(position) + ">" + ".".repeat(width - position - 1);
}

function formatChannelTitle(value) {
    if (getCurrentLayoutPreset().displayMode === "meter") {
        return " ";
    }
    return alignRight + formatPercent(value);
}

function formatAuxMediaTitle() {
    if (getCurrentLayoutPreset().displayMode === "meter") {
        return " ";
    }
    return formatPercent(volumeState.aux) + " / " + formatPercent(volumeState.media);
}

function encodeSvg(svg) {
    return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

function renderOrbSvg(value, label) {
    const amount = clampVolume(value);
    const radius = 24 + (visualFrame % 4);
    const glow = 0.35 + (amount * 0.55);
    return encodeSvg(`
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
            <defs>
                <radialGradient id="g" cx="50%" cy="45%" r="60%">
                    <stop offset="0%" stop-color="#ffffff" stop-opacity="${glow}"/>
                    <stop offset="45%" stop-color="#00d5ff"/>
                    <stop offset="100%" stop-color="#7a3cff"/>
                </radialGradient>
                <filter id="blur"><feGaussianBlur stdDeviation="4"/></filter>
            </defs>
            <rect width="96" height="96" rx="18" fill="#05070d"/>
            <circle cx="48" cy="48" r="${radius + amount * 14}" fill="#00d5ff" opacity="0.16" filter="url(#blur)"/>
            <circle cx="48" cy="48" r="${radius}" fill="url(#g)"/>
            <path d="M24 66 Q48 ${66 - amount * 44} 72 66" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
            <text x="48" y="88" text-anchor="middle" font-size="12" font-family="Arial" fill="#ffffff">${label}</text>
        </svg>
    `);
}

function renderWaveSvg(value, label) {
    const amount = clampVolume(value);
    const phase = visualFrame % 6;
    const y = 68 - amount * 46;
    return encodeSvg(`
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
            <rect width="96" height="96" rx="18" fill="#05070d"/>
            <path d="M0 ${y + phase} C18 ${y - 18} 30 ${y + 18} 48 ${y} C66 ${y - 18} 78 ${y + 18} 96 ${y}" fill="none" stroke="#00f0ff" stroke-width="7" opacity="0.9"/>
            <path d="M0 ${y + 14 - phase} C18 ${y - 4} 30 ${y + 32} 48 ${y + 14} C66 ${y - 4} 78 ${y + 32} 96 ${y + 14}" fill="none" stroke="#9d4dff" stroke-width="5" opacity="0.65"/>
            <rect x="14" y="${y}" width="68" height="${82 - y}" rx="10" fill="#00f0ff" opacity="0.18"/>
            <text x="48" y="88" text-anchor="middle" font-size="12" font-family="Arial" fill="#ffffff">${label}</text>
        </svg>
    `);
}

function renderMeterSvg(value, label) {
    const amount = clampVolume(value);
    const angle = -130 + amount * 260;
    const color = amount > 0.82 ? "#ff3030" : amount > 0.6 ? "#f5d742" : "#19d66b";
    const percent = formatPercent(amount);
    return encodeSvg(`
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
            <rect width="96" height="96" rx="18" fill="#05070d"/>
            <text x="48" y="22" text-anchor="middle" font-size="21" font-weight="700" font-family="Arial" fill="#ffffff">${percent}</text>
            <path d="M18 63 A30 30 0 0 1 78 63" fill="none" stroke="#222b36" stroke-width="10" stroke-linecap="round"/>
            <path d="M18 63 A30 30 0 0 1 78 63" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${amount * 100} 100"/>
            <line x1="48" y1="63" x2="48" y2="38" stroke="#ffffff" stroke-width="5" stroke-linecap="round" transform="rotate(${angle} 48 63)"/>
            <circle cx="48" cy="63" r="6" fill="#ffffff"/>
            <text x="48" y="88" text-anchor="middle" font-size="16" font-weight="700" font-family="Arial" fill="#ffffff" opacity="0.95">${label}</text>
        </svg>
    `);
}

function renderInitialIconSvg(key, label) {
    const colors = {
        master: "#9aa4b2",
        game: "#ff4b4b",
        chat: "#00aaff",
        media: "#00c875",
        aux: "#f0c21a"
    };
    const color = colors[key] || "#ffffff";
    const icon = {
        master: `
            <path d="M24 58 H38 L54 42 V102 L38 86 H24 Z" fill="${color}"/>
            <path d="M64 54 Q78 72 64 90" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
            <path d="M74 42 Q96 72 74 102" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" opacity="0.75"/>
        `,
        game: `
            <rect x="22" y="52" width="100" height="48" rx="22" fill="${color}"/>
            <circle cx="44" cy="76" r="6" fill="#05070d"/>
            <rect x="38" y="66" width="12" height="22" rx="3" fill="#05070d"/>
            <rect x="33" y="71" width="22" height="12" rx="3" fill="#05070d"/>
            <circle cx="94" cy="70" r="6" fill="#05070d"/>
            <circle cx="108" cy="82" r="6" fill="#05070d"/>
            <path d="M48 52 Q72 30 96 52" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>
        `,
        chat: `
            <path d="M28 50 Q72 20 116 50 V92 Q72 116 28 92 Z" fill="${color}"/>
            <circle cx="54" cy="72" r="7" fill="#05070d"/>
            <circle cx="90" cy="72" r="7" fill="#05070d"/>
            <path d="M48 92 Q72 104 96 92" fill="none" stroke="#05070d" stroke-width="6" stroke-linecap="round"/>
        `,
        media: `
            <circle cx="72" cy="72" r="42" fill="${color}"/>
            <path d="M48 62 Q72 52 96 62" fill="none" stroke="#05070d" stroke-width="6" stroke-linecap="round"/>
            <path d="M50 76 Q72 68 94 76" fill="none" stroke="#05070d" stroke-width="6" stroke-linecap="round"/>
            <path d="M54 90 Q72 84 90 90" fill="none" stroke="#05070d" stroke-width="5" stroke-linecap="round"/>
        `,
        aux: `
            <circle cx="72" cy="72" r="42" fill="${color}"/>
            <path d="M30 72 H114 M72 30 V114" stroke="#05070d" stroke-width="7"/>
            <path d="M42 44 Q72 58 102 44 M42 100 Q72 86 102 100" fill="none" stroke="#05070d" stroke-width="6"/>
            <ellipse cx="72" cy="72" rx="18" ry="42" fill="none" stroke="#05070d" stroke-width="6"/>
        `
    }[key] || "";

    return encodeSvg(`
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" rx="24" fill="#05070d"/>
            <text x="72" y="26" text-anchor="middle" font-size="22" font-weight="700" font-family="Arial" fill="${color}">${label}</text>
            ${icon}
        </svg>
    `);
}

function renderInitialAuxMediaSvg() {
    return encodeSvg(`
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" rx="24" fill="#05070d"/>
            <text x="72" y="26" text-anchor="middle" font-size="18" font-weight="700" font-family="Arial" fill="#ffffff">Aux + Media</text>
            <circle cx="48" cy="78" r="30" fill="#f0c21a"/>
            <path d="M22 78 H74 M48 48 V108" stroke="#05070d" stroke-width="5"/>
            <ellipse cx="48" cy="78" rx="13" ry="30" fill="none" stroke="#05070d" stroke-width="5"/>
            <circle cx="96" cy="78" r="30" fill="#00c875"/>
            <path d="M80 70 Q96 62 112 70 M82 82 Q96 76 110 82 M86 94 Q96 90 106 94" fill="none" stroke="#05070d" stroke-width="5" stroke-linecap="round"/>
        </svg>
    `);
}

function renderDualSvg(auxValue, mediaValue) {
    const aux = clampVolume(auxValue);
    const media = clampVolume(mediaValue);
    const pulse = 0.2 + ((visualFrame % 6) * 0.04);
    return encodeSvg(`
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <defs>
                <linearGradient id="aux" x1="0%" x2="100%">
                    <stop offset="0%" stop-color="#f7c600"/>
                    <stop offset="100%" stop-color="#ff7a00"/>
                </linearGradient>
                <linearGradient id="media" x1="0%" x2="100%">
                    <stop offset="0%" stop-color="#00e676"/>
                    <stop offset="100%" stop-color="#00c2ff"/>
                </linearGradient>
                <filter id="glow"><feGaussianBlur stdDeviation="3"/></filter>
            </defs>
            <rect width="144" height="144" rx="26" fill="#05070d"/>
            <circle cx="44" cy="72" r="${20 + aux * 22}" fill="url(#aux)" opacity="${0.35 + aux * 0.45}" filter="url(#glow)"/>
            <circle cx="100" cy="72" r="${20 + media * 22}" fill="url(#media)" opacity="${0.35 + media * 0.45}" filter="url(#glow)"/>
            <path d="M24 116 H${24 + aux * 42}" stroke="url(#aux)" stroke-width="10" stroke-linecap="round"/>
            <path d="M78 116 H${78 + media * 42}" stroke="url(#media)" stroke-width="10" stroke-linecap="round"/>
            <circle cx="44" cy="72" r="${8 + pulse * 8}" fill="#fff" opacity="0.35"/>
            <circle cx="100" cy="72" r="${8 + pulse * 8}" fill="#fff" opacity="0.35"/>
            <text x="44" y="128" text-anchor="middle" font-size="13" font-family="Arial" fill="#ffffff">Aux</text>
            <text x="100" y="128" text-anchor="middle" font-size="13" font-family="Arial" fill="#ffffff">Media</text>
        </svg>
    `);
}

function renderVolumeImage(value, label) {
    switch (getCurrentLayoutPreset().displayMode) {
        case "orb":
            return renderOrbSvg(value, label);
        case "wave":
            return renderWaveSvg(value, label);
        case "meter":
            return renderMeterSvg(value, label);
        default:
            return "";
    }
}

function isVisualPreset() {
    return getCurrentLayoutPreset().displayMode !== "numeric";
}

function normalizeMode(mode) {
    return mode === "stream" ? "streamer" : mode;
}

function canUseSonar() {
    return Boolean(webServerAddress && sonarMode);
}

function setTitle(context, title) {
    if (window.socket && context) {
        window.socket.setTitle(context, title);
    }
}

function setActionTitle(actionName, title) {
    const action = plugin[actionName];
    if (!action || !action.contextList) {
        return;
    }
    action.contextList.forEach(context => setTitle(context, title));
}

function setFeedback(context, payload) {
    if (window.socket && context && window.socket.setFeedback) {
        window.socket.setFeedback(context, payload);
    }
}

function setImage(context, image) {
    if (!window.socket || !context || !image) {
        return;
    }
    if (image.startsWith("data:") && window.socket.setImageData) {
        window.socket.setImageData(context, image);
    } else {
        window.socket.setImage(context, image);
    }
}

function setState(context, state) {
    if (window.socket && context && window.socket.setState) {
        window.socket.setState(context, state);
    }
}

function clearImage(context) {
    if (window.socket && context && window.socket.clearImage) {
        window.socket.clearImage(context);
    }
}

function setActionImage(actionName, image) {
    const action = plugin[actionName];
    if (!action || !action.contextList) {
        return;
    }
    action.contextList.forEach(context => setImage(context, image));
}

function clearActionImage(actionName) {
    const action = plugin[actionName];
    if (!action || !action.contextList) {
        return;
    }
    action.contextList.forEach(context => {
        clearImage(context);
        setState(context, 0);
        setTimeout(() => setState(context, 0), 100);
    });
}

function setActionState(actionName, state) {
    const action = plugin[actionName];
    if (!action || !action.contextList) {
        return;
    }
    action.contextList.forEach(context => setState(context, state));
}

function setFeedbackLayout(context, layout) {
    if (window.socket && context && window.socket.setFeedbackLayout) {
        window.socket.setFeedbackLayout(context, layout);
    }
}

function setActionFeedbackLayout(actionName, layout) {
    const action = plugin[actionName];
    if (!action || !action.contextList) {
        return;
    }
    action.contextList.forEach(context => setFeedbackLayout(context, layout));
}

function setActionFeedback(actionName, payload) {
    const action = plugin[actionName];
    if (!action || !action.contextList) {
        return;
    }
    action.contextList.forEach(context => setFeedback(context, payload));
}

function toIndicatorValue(value) {
    return Math.round(clampVolume(value) * 100);
}

function updateChannelFeedback(key) {
    const channel = CHANNELS[key];
    const image = renderVolumeImage(volumeState[key], channel.label);
    setActionFeedback(channel.actionName, {
        title: channel.label,
        value: "",
        indicator: toIndicatorValue(volumeState[key]),
        icon: image
    });
    if (image) {
        setActionImage(channel.actionName, image);
    } else {
        clearActionImage(channel.actionName);
    }
}

function updateAuxMediaFeedback() {
    const auxImage = renderVolumeImage(volumeState.aux, "Aux");
    const mediaImage = renderVolumeImage(volumeState.media, "Media");
    const dualImage = isVisualPreset() ? renderDualSvg(volumeState.aux, volumeState.media) : "";
    setActionFeedback("auxMediaAction", {
        title: "Aux + Media",
        auxLabel: "Aux",
        auxIcon: auxImage,
        auxIndicator: toIndicatorValue(volumeState.aux),
        mediaLabel: "Media",
        mediaIcon: mediaImage,
        mediaIndicator: toIndicatorValue(volumeState.media)
    });
    if (dualImage) {
        setActionImage("auxMediaAction", dualImage);
    } else {
        clearActionImage("auxMediaAction");
    }
}

function getCurrentLayoutPreset() {
    return MIXER_LAYOUT_PRESETS[currentLayoutIndex];
}

function getLayoutActionTitle() {
    return (currentLayoutIndex + 1) + "/" + MIXER_LAYOUT_PRESETS.length + "\n" + getCurrentLayoutPreset().name;
}

function applyCurrentLayouts() {
    const preset = getCurrentLayoutPreset();
    Object.keys(CHANNELS).forEach(key => {
        setActionFeedbackLayout(CHANNELS[key].actionName, preset.channelLayout);
    });
    setActionFeedbackLayout("auxMediaAction", preset.auxMediaLayout);
    updateDisplays();
    setTimeout(updateDisplays, 150);
    updateVisualAnimationTimer();
    updateLayoutActionTitles();
}

function updateLayoutActionTitles() {
    setActionTitle("layoutAction", getLayoutActionTitle());
}

function selectNextLayout() {
    currentLayoutIndex += 1;
    if (currentLayoutIndex >= MIXER_LAYOUT_PRESETS.length) {
        currentLayoutIndex = 0;
    }
    visualFrame = 0;
    applyCurrentLayouts();
}

function toggleLayoutFromKey(data) {
    const now = Date.now();
    if (now - lastLayoutToggleAt < 250) {
        return;
    }
    lastLayoutToggleAt = now;
    selectNextLayout();
    if (data?.context) {
        setTitle(data.context, getLayoutActionTitle());
    }
}

function updateVisualAnimationTimer() {
    if (!isVisualPreset()) {
        if (visualAnimationTimer) {
            clearInterval(visualAnimationTimer);
            visualAnimationTimer = null;
        }
        return;
    }
    if (visualAnimationTimer) {
        return;
    }
    visualAnimationTimer = setInterval(() => {
        visualFrame = (visualFrame + 1) % 12;
        updateDisplays();
    }, 450);
}

function showActionError(actionName) {
    setActionTitle(actionName, alignRight + "SONAR?");
}

function showAllErrors() {
    Object.keys(CHANNELS).forEach(key => showActionError(CHANNELS[key].actionName));
    setActionTitle("auxMediaAction", "SONAR?");
}

function updateDisplays() {
    Object.keys(CHANNELS).forEach(key => {
        const channel = CHANNELS[key];
        setActionTitle(channel.actionName, formatChannelTitle(volumeState[key]));
        updateChannelFeedback(key);
    });
    setActionTitle("auxMediaAction", formatAuxMediaTitle());
    updateAuxMediaFeedback();
}

async function getVolumeSettings() {
    if (!canUseSonar()) {
        throw new Error("Sonar is not initialized");
    }
    return getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
}

function applyVolumeSettings(data) {
    Object.keys(CHANNELS).forEach(key => {
        const nextValue = clampVolume(CHANNELS[key].read(data));
        if (nextValue > MUTED_EPSILON) {
            previousVolumeState[key] = nextValue;
        }
        volumeState[key] = nextValue;
    });
}

async function updateAllVolumes(options = {}) {
    const force = Boolean(options.force);
    const suppressErrors = options.suppressErrors !== false;
    if (!canUseSonar()) {
        const error = new Error("Sonar is not initialized");
        showAllErrors();
        if (!suppressErrors) {
            throw error;
        }
        return;
    }
    if (isSyncing) {
        if (force && syncPromise) {
            await syncPromise.catch(() => {});
        } else {
            return syncPromise;
        }
    }
    isSyncing = true;
    syncPromise = (async () => {
        sonarMode = normalizeMode(await getFetch(webServerAddress + "/mode/"));
        const data = await getVolumeSettings();
        applyVolumeSettings(data);
        updateDisplays();
    })();
    try {
        await syncPromise;
    } catch (error) {
        console.error("Error updating volumes:", error);
        showAllErrors();
        scheduleSonarRetry();
        if (!suppressErrors) {
            throw error;
        }
    } finally {
        isSyncing = false;
        syncPromise = null;
    }
}

async function writeVolume(apiChannel, value) {
    await setPut(webServerAddress + "/volumeSettings/" + sonarMode + "/" + apiChannel + "/Volume/" + JSON.stringify(clampVolume(value)));
}

async function writeAndConfirm(changes) {
    if (!canUseSonar()) {
        throw new Error("Sonar is not initialized");
    }
    try {
        for (const change of changes) {
            await writeVolume(change.apiChannel, change.value);
        }
    } catch (error) {
        await updateAllVolumes({ force: true }).catch(() => {});
        throw error;
    }
    await updateAllVolumes({ force: true, suppressErrors: false });
}

function startSyncTimer() {
    if (syncTimer) {
        return;
    }
    syncTimer = setInterval(updateAllVolumes, SYNC_INTERVAL_MS);
}

function scheduleSonarRetry() {
    if (retryTimer) {
        return;
    }
    retryTimer = setInterval(async () => {
        try {
            await initializeSonar();
        } catch (error) {
            console.error("Error retrying Sonar initialization:", error);
        }
    }, RETRY_INTERVAL_MS);
}

function clearRetryTimer() {
    if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
    }
}

async function initializeSonar() {
    if (isInitializing) {
        return;
    }
    isInitializing = true;
    try {
        const coreProps = await fetchWithTimeout(CORE_PROPS_URL).then(response => response.json());
        ggEncryptedAddress = coreProps.ggEncryptedAddress;

        const subAppsData = await getFetch("https://" + ggEncryptedAddress + "/subApps");
        webServerAddress = subAppsData.subApps.sonar.metadata.webServerAddress;
        sonarMode = normalizeMode(await getFetch(webServerAddress + "/mode/"));

        clearRetryTimer();
        await updateAllVolumes({ force: true, suppressErrors: false });
        startSyncTimer();
    } finally {
        isInitializing = false;
    }
}

initializeSonar().catch(error => {
    console.error("Error initializing Sonar:", error);
    showAllErrors();
    scheduleSonarRetry();
});

function createVolumeAction(channelKey) {
    const channel = CHANNELS[channelKey];

    return new Actions({
        default: {},
        async _willAppear({ context }) {
            setFeedbackLayout(context, getCurrentLayoutPreset().channelLayout);
            try {
                await updateAllVolumes({ force: true, suppressErrors: false });
                setTitle(context, formatChannelTitle(volumeState[channelKey]));
                setFeedback(context, {
                    title: channel.label,
                    value: "",
                    indicator: toIndicatorValue(volumeState[channelKey]),
                    icon: renderVolumeImage(volumeState[channelKey], channel.label)
                });
                if (isVisualPreset()) {
                    setImage(context, renderVolumeImage(volumeState[channelKey], channel.label));
                }
            } catch (error) {
                console.error("Error on connect:", error);
                showActionError(channel.actionName);
                scheduleSonarRetry();
            }
        },

        async dialRotate(data) {
            try {
                if (data.payload.ticks === 0) {
                    return;
                }
                const direction = data.payload.ticks > 0 ? 1 : -1;
                const current = volumeState[channelKey];
                const nextValue = clampKnobVolume(current + (direction * VOLUME_STEP));
                await writeAndConfirm([{ apiChannel: channel.apiChannel, value: nextValue }]);
            } catch (error) {
                console.error("Error rotating dial:", error);
                setActionTitle(channel.actionName, alignRight + "ERROR");
                scheduleSonarRetry();
            }
        },

        async dialDown(data) {
            try {
                const current = volumeState[channelKey];
                const nextValue = current <= MUTED_EPSILON ? previousVolumeState[channelKey] : 0;
                if (current > MUTED_EPSILON) {
                    previousVolumeState[channelKey] = current;
                }
                await writeAndConfirm([{ apiChannel: channel.apiChannel, value: nextValue }]);
            } catch (error) {
                console.error("Error pressing dial:", error);
                setActionTitle(channel.actionName, alignRight + "ERROR");
                scheduleSonarRetry();
            }
        }
    });
}

plugin.masterAction = createVolumeAction("master");
plugin.gameAction = createVolumeAction("game");
plugin.chatAction = createVolumeAction("chat");
plugin.mediaAction = createVolumeAction("media");
plugin.auxAction = createVolumeAction("aux");

plugin.auxMediaAction = new Actions({
    default: {},
    async _willAppear({ context }) {
        setFeedbackLayout(context, getCurrentLayoutPreset().auxMediaLayout);
        try {
            await updateAllVolumes({ force: true, suppressErrors: false });
            setTitle(context, formatAuxMediaTitle());
            setFeedback(context, {
                title: "Aux + Media",
                auxLabel: "Aux",
                auxIcon: renderVolumeImage(volumeState.aux, "Aux"),
                auxIndicator: toIndicatorValue(volumeState.aux),
                mediaLabel: "Media",
                mediaIcon: renderVolumeImage(volumeState.media, "Media"),
                mediaIndicator: toIndicatorValue(volumeState.media)
            });
            if (isVisualPreset()) {
                setImage(context, renderDualSvg(volumeState.aux, volumeState.media));
            }
        } catch (error) {
            console.error("Error on connect:", error);
            setActionTitle("auxMediaAction", "SONAR?");
            scheduleSonarRetry();
        }
    },

    async dialRotate(data) {
        try {
            if (data.payload.ticks === 0) {
                return;
            }
            const direction = data.payload.ticks > 0 ? 1 : -1;
            const nextAux = clampKnobVolume(volumeState.aux + (direction * VOLUME_STEP));
            const nextMedia = clampKnobVolume(volumeState.media + (direction * VOLUME_STEP));
            await writeAndConfirm([
                { apiChannel: CHANNELS.aux.apiChannel, value: nextAux },
                { apiChannel: CHANNELS.media.apiChannel, value: nextMedia }
            ]);
        } catch (error) {
            console.error("Error rotating Aux + Media dial:", error);
            setActionTitle("auxMediaAction", "ERROR");
            scheduleSonarRetry();
        }
    },

    async dialDown(data) {
        try {
            const auxMuted = volumeState.aux <= MUTED_EPSILON;
            const mediaMuted = volumeState.media <= MUTED_EPSILON;

            if (!auxMuted) {
                previousVolumeState.aux = volumeState.aux;
            }
            if (!mediaMuted) {
                previousVolumeState.media = volumeState.media;
            }

            const nextAux = auxMuted && mediaMuted ? previousVolumeState.aux : 0;
            const nextMedia = auxMuted && mediaMuted ? previousVolumeState.media : 0;

            await writeAndConfirm([
                { apiChannel: CHANNELS.aux.apiChannel, value: nextAux },
                { apiChannel: CHANNELS.media.apiChannel, value: nextMedia }
            ]);
        } catch (error) {
            console.error("Error pressing Aux + Media dial:", error);
            setActionTitle("auxMediaAction", "ERROR");
            scheduleSonarRetry();
        }
    }
});

plugin.layoutAction = new Actions({
    default: {},
    _willAppear({ context }) {
        setTitle(context, getLayoutActionTitle());
    },

    keyDown(data) {
        toggleLayoutFromKey(data);
    },

    keyUp(data) {
        toggleLayoutFromKey(data);
    }
});