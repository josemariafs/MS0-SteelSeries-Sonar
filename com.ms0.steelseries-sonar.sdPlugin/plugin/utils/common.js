//import { connection } from './connection.js';

const Timer = new Worker('./utils/worker.js');






class Actions {
    constructor(data) {
        this.data = {};
        this.default = {};
        Object.assign(this, data);
    }
    static currentAction = null;
    static currentContext = null;
    propertyInspectorDidAppear({ action, context }) {
        Actions.currentAction = action;
        Actions.currentContext = context;
        this._propertyInspectorDidAppear?.(data);
    }
    willAppear(data) {
        const { context, payload: { settings } } = data;
        this.data[context] = Object.assign({ ...this.default }, settings);
        this._willAppear?.(data);
    }
    willDisappear(data) {
        this._willDisappear?.(data);
        delete this.data[data.context];
    }
}

class Plugins {
    constructor(name) {
        this.name = name;
    }
}

window.connectElgatoStreamDeckSocket = function () {
    const uuid = arguments[1], event = arguments[2];
    window.info = JSON.parse(arguments[3]);
    window.socket = new WebSocket("ws://127.0.0.1:" + arguments[0]);

    WebSocket.prototype.openUrl = function (url) {
        this.send(JSON.stringify({
            event: "openUrl",
            payload: { url }
        }));
    };

    WebSocket.prototype.sendToPropertyInspector = function (payload) {
        this.send(JSON.stringify({
            payload,
            event: "sendToPropertyInspector",
            action: Actions.currentAction,
            context: Actions.currentContext
        }));
    };

    WebSocket.prototype.setSettings = function (context, payload) {
        this.send(JSON.stringify({
            event: "setSettings",
            context, payload
        }));
    };

    WebSocket.prototype.setImage = function (context, url) {
        const image = new Image();
        image.src = url;
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);
            this.send(JSON.stringify({
                event: "setImage",
                context, payload: {
                    target: 0,
                    image: canvas.toDataURL("image/png")
                }
            }));
        };
    };

    WebSocket.prototype.setTitle = function (context, str, row = 0, num = 6) {
        let newStr = '';
        if (row) {
            let nowRow = 1, strArr = str.split('');
            strArr.forEach((item, index) => {
                if (nowRow < row && index >= nowRow * num) {
                    nowRow++;
                    newStr += '\n';
                }
                if (nowRow <= row && index < nowRow * num) {
                    newStr += item;
                }
            });
            if (strArr.length > row * num) {
                newStr = newStr.substring(0, newStr.length - 1);
                newStr += '..';
            }
        }
        this.send(JSON.stringify({
            event: "setTitle",
            context, payload: {
                target: 0,
                title: newStr || str
            }
        }));
    };

    WebSocket.prototype.setState = function (context, state) {
        this.send(JSON.stringify({
            event: "setState",
            payload: { state },
            context
        }));
    };

    window.socket.onopen = () => window.socket.send(JSON.stringify({ uuid, event }));
    window.socket.onmessage = e => {
        const data = JSON.parse(e.data);
        plugin[data.action?.split('.').pop()]?.[data.event]?.(data);
        plugin[data.event]?.(data);
    };
};