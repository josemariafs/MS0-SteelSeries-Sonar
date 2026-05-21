/// <reference path="./utils/common.js" />
/// <reference path="./utils/axios.js" />
/// <reference path="./utils/worker.js" />

const plugin = new Plugins("Dials Volume Mixer");
const CORE_PROPS_URL = "file:///C:/ProgramData/SteelSeries/SteelSeries%20Engine%203/coreProps.json";
const SYNC_INTERVAL_MS = 3000;
const RETRY_INTERVAL_MS = 5000;
const VOLUME_STEP = 0.05;
const MUTED_EPSILON = 0.001;

let ggEncryptedAddress = "";
let webServerAddress = "";
let sonarMode = "";
let syncTimer = null;
let retryTimer = null;
let isSyncing = false;
let syncPromise = null;
let isInitializing = false;
let alignRight = "          ";

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
        format: value => alignRight + formatPercent(value)
    },
    game: {
        actionName: "gameAction",
        apiChannel: "game",
        read: data => data.devices.game[sonarMode].volume,
        format: value => alignRight + formatPercent(value),
        layout: "$B1"
    },
    chat: {
        actionName: "chatAction",
        apiChannel: "chatRender",
        read: data => data.devices.chatRender[sonarMode].volume,
        format: value => alignRight + formatPercent(value)
    },
    media: {
        actionName: "mediaAction",
        apiChannel: "media",
        read: data => data.devices.media[sonarMode].volume,
        format: value => alignRight + formatPercent(value)
    },
    aux: {
        actionName: "auxAction",
        apiChannel: "aux",
        read: data => data.devices.aux[sonarMode].volume,
        format: value => alignRight + formatPercent(value)
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

function formatPercent(value) {
    return parseInt(clampVolume(value) * 100) + "%";
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
        setActionTitle(channel.actionName, channel.format(volumeState[key]));
    });
    setActionTitle("auxMediaAction", formatPercent(volumeState.aux) + " / " + formatPercent(volumeState.media));
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
            if (channel.layout) {
                window.socket.setFeedbackLayout(context, channel.layout);
            }
            try {
                await updateAllVolumes({ force: true, suppressErrors: false });
                setTitle(context, channel.format(volumeState[channelKey]));
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
                const nextValue = clampVolume(current + (direction * VOLUME_STEP));
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
        try {
            await updateAllVolumes({ force: true, suppressErrors: false });
            setTitle(context, formatPercent(volumeState.aux) + " / " + formatPercent(volumeState.media));
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
            const nextAux = clampVolume(volumeState.aux + (direction * VOLUME_STEP));
            const nextMedia = clampVolume(volumeState.media + (direction * VOLUME_STEP));
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