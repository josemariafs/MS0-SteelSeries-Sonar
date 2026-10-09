const $local = false, $back = false, $dom = {
    main: $(".sdpi-wrapper"),
    heading: $("#heading"),
    phrase: $("#phrase"),
    host: $("#host"),
    test: $("#test"),
    status: $("#status")
};

function notify(payload) {
    $websocket.sendToPlugin({
        ...payload,
        actionContext: $context
    });
}

const $propEvent = {
    didReceiveSettings() {
        notify({ type: "ready" });
    },
    sendToPropertyInspector(data) {
        if (!data || data.type !== "state") return;
        $dom.heading.textContent = data.category && data.name ? `${data.category}: ${data.name}` : "Calefactor";
        $dom.phrase.value = data.phrase || "";
        $dom.host.value = data.host || "";
        $dom.status.textContent = data.status || "";
        if ($dom.main.style.display === "none") $dom.main.style.display = "block";
    }
};

$dom.test.addEventListener("click", () => {
    notify({ type: "test" });
});
