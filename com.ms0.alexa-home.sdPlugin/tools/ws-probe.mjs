import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = path.join(root, "plugin", "AlexaHome.exe");

function decodeFrames(buffer) {
    const messages = [];
    let offset = 0;
    while (buffer.length - offset >= 2) {
        const lengthByte = buffer[offset + 1] & 0x7f;
        const masked = (buffer[offset + 1] & 0x80) !== 0;
        let header = 2;
        let length = lengthByte;
        if (lengthByte === 126) {
            if (buffer.length - offset < 4) break;
            length = buffer.readUInt16BE(offset + 2);
            header = 4;
        }
        const maskLength = masked ? 4 : 0;
        if (buffer.length - offset < header + maskLength + length) break;
        const mask = masked ? buffer.subarray(offset + header, offset + header + 4) : null;
        const start = offset + header + maskLength;
        const payload = Buffer.alloc(length);
        for (let i = 0; i < length; i += 1) {
            payload[i] = buffer[start + i] ^ (mask ? mask[i % 4] : 0);
        }
        messages.push(payload.toString("utf8"));
        offset = start + length;
    }
    return { messages, rest: buffer.subarray(offset) };
}

const server = net.createServer(socket => {
    let http = Buffer.alloc(0);
    let frames = Buffer.alloc(0);
    let accepted = false;
    socket.on("data", chunk => {
        if (!accepted) {
            http = Buffer.concat([http, chunk]);
            const split = http.indexOf("\r\n\r\n");
            if (split < 0) return;
            const header = http.subarray(0, split).toString("utf8");
            const key = header.match(/Sec-WebSocket-Key:\s*(.+)/i)?.[1]?.trim();
            const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
            socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
            accepted = true;
            frames = http.subarray(split + 4);
        } else {
            frames = Buffer.concat([frames, chunk]);
        }
        const decoded = decodeFrames(frames);
        frames = decoded.rest;
        for (const message of decoded.messages) {
            console.log(message);
            socket.end();
        }
    });
});

server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    const child = spawn(exe, ["-port", String(port), "-pluginUUID", "com.ms0.alexa-home", "-registerEvent", "registerPlugin", "-info", "{}"], {
        cwd: root,
        windowsHide: true
    });
    const timer = setTimeout(() => {
        console.error("timeout");
        child.kill();
        server.close();
        process.exit(1);
    }, 8000);
    child.on("exit", () => {
        clearTimeout(timer);
        server.close();
    });
});
