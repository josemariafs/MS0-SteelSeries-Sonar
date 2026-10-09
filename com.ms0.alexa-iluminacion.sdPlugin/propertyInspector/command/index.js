const $local = false, $back = false, $dom = {
    main: $(".sdpi-wrapper"),
    heading: $("#heading"),
    voiceBox: $("#voiceBox"),
    knobBox: $("#knobBox"),
    phrase: $("#phrase"),
    bulb1Name: $("#bulb1Name"),
    bulb2Name: $("#bulb2Name"),
    bulb3Name: $("#bulb3Name"),
    custom: $("#custom"),
    test: $("#test"),
    lightsName: $("#lightsName"),
    domain: $("#domain"),
    locale: $("#locale"),
    sessionState: $("#sessionState"),
    startLogin: $("#startLogin"),
    cookieBox: $("#cookieBox"),
    cookieState: $("#cookieState"),
    cookieHint: $("#cookieHint"),
    cookie: $("#cookie"),
    saveCookie: $("#saveCookie"),
    openAlexa: $("#openAlexa"),
    device: $("#device"),
    status: $("#status")
};

let devices = [];
let applying = false;

function notify(payload) {
    $websocket.sendToPlugin({
        ...payload,
        actionContext: $context
    });
}

function setIdleValue(element, value) {
    if (document.activeElement === element) return;
    if (element.value !== value) element.value = value;
}

function renderDevices(selectedSerial) {
    if (document.activeElement === $dom.device) return;
    const options = devices.length ? devices : [];
    $dom.device.replaceChildren();
    if (!options.length) {
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Busca un Echo";
        $dom.device.append(empty);
        return;
    }
    for (const device of options) {
        const option = document.createElement("option");
        option.value = device.serial;
        const state = device.online === false ? "desconectado" : "en línea";
        option.textContent = `${device.name} (${state})`;
        $dom.device.append(option);
    }
    if (selectedSerial) $dom.device.value = selectedSerial;
}

const $propEvent = {
    didReceiveSettings() {
        notify({ type: "ready" });
    },
    sendToPropertyInspector(data) {
        if (!data || data.type !== "state") return;
        applying = true;
        $dom.heading.textContent = data.category && data.name ? `${data.category}: ${data.name}` : "Comando";
        $dom.custom.checked = Boolean(data.custom);
        $dom.phrase.readOnly = !data.custom;
        setIdleValue($dom.phrase, data.phrase || "");
        setIdleValue($dom.lightsName, data.lightsName || "luces");
        setIdleValue($dom.bulb1Name, data.bulb1Name || "Smart Bulb");
        setIdleValue($dom.bulb2Name, data.bulb2Name || "Smart Bulb 2");
        setIdleValue($dom.bulb3Name, data.bulb3Name || "Smart Bulb 3");
        $dom.knobBox.hidden = !data.knob;
        $dom.voiceBox.hidden = Boolean(data.knob);
        setIdleValue($dom.domain, data.domain || "amazon.es");
        setIdleValue($dom.locale, data.locale || "es-ES");
        if (Array.isArray(data.devices)) devices = data.devices;
        renderDevices(data.device?.serial || "");
        const signedIn = data.hasSession && data.hasCookie && !data.sessionRejected;
        $dom.cookieBox.hidden = signedIn;
        $dom.cookieState.hidden = !signedIn;
        $dom.sessionState.hidden = signedIn;
        $dom.startLogin.hidden = signedIn;
        $dom.cookieHint.textContent = data.sessionRejected
            ? "Alexa ha rechazado la sesión. Vuelve a iniciar sesión. Si no termina, pega una cabecera Cookie de alexa.amazon.es."
            : "Si el inicio de sesión no termina, pega aquí la cabecera Cookie de alexa.amazon.es (F12, Red, recarga).";
        $dom.saveCookie.textContent = data.sessionRejected ? "Guardar cookie y buscar Echo" : "Guardar cookie y buscar Echo";
        const cookieNote = !data.hasCookie || data.cookieSource === "env" ? "" : "Cookie de la app. ";
        $dom.status.textContent = `${cookieNote}${data.status || ""}`.trim();
        applying = false;
        if ($dom.main.style.display === "none") $dom.main.style.display = "block";
    }
};

$dom.custom.addEventListener("change", () => {
    if (applying) return;
    $dom.phrase.readOnly = !$dom.custom.checked;
    notify({
        type: "setPhrase",
        custom: $dom.custom.checked,
        phrase: $dom.custom.checked ? $dom.phrase.value.trim() : ""
    });
});

$dom.phrase.addEventListener("change", () => {
    if (applying || !$dom.custom.checked) return;
    notify({
        type: "setPhrase",
        custom: true,
        phrase: $dom.phrase.value.trim()
    });
});

function saveNames() {
    if (applying) return;
    notify({
        type: "setNames",
        lightsName: $dom.lightsName.value.trim() || "luces",
        bulb1Name: $dom.bulb1Name.value.trim() || "Smart Bulb",
        bulb2Name: $dom.bulb2Name.value.trim() || "Smart Bulb 2",
        bulb3Name: $dom.bulb3Name.value.trim() || "Smart Bulb 3",
        domain: $dom.domain.value,
        locale: $dom.locale.value.trim() || "es-ES"
    });
}

$dom.lightsName.addEventListener("change", saveNames);
$dom.bulb1Name.addEventListener("change", saveNames);
$dom.bulb2Name.addEventListener("change", saveNames);
$dom.bulb3Name.addEventListener("change", saveNames);
$dom.domain.addEventListener("change", saveNames);
$dom.locale.addEventListener("change", saveNames);

$dom.startLogin.addEventListener("click", () => {
    $dom.status.textContent = "Abriendo el inicio de sesión de Amazon...";
    notify({ type: "startLogin" });
});

$dom.saveCookie.addEventListener("click", () => {
    const cookie = $dom.cookie.value.trim();
    if (!cookie) {
        $dom.status.textContent = "Pega la cabecera Cookie antes de guardar.";
        return;
    }
    $dom.status.textContent = "Guardando cookie...";
    notify({ type: "setCookie", cookie });
    $dom.cookie.value = "";
});

$dom.openAlexa.addEventListener("click", () => {
    const domain = $dom.domain.value || "amazon.es";
    $websocket.openUrl(`https://alexa.${domain}`);
});

$dom.device.addEventListener("change", () => {
    if (applying || !$dom.device.value) return;
    notify({ type: "setDevice", serial: $dom.device.value });
});

$dom.test.addEventListener("click", () => {
    if ($dom.custom.checked) {
        notify({
            type: "setPhrase",
            custom: true,
            phrase: $dom.phrase.value.trim()
        });
    }
    notify({ type: "test" });
});
