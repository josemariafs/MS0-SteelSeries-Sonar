import asyncio
import json
import os
import socket
import sys

from aiocoap import Context, Message, Unreliable
from aiocoap.numbers.codes import GET, POST
from aioairctrl.coap.encryption import EncryptionContext

PORT = 5683
SYNC_PATH = "/sys/dev/sync"
STATUS_PATH = "/sys/dev/status"
CONTROL_PATH = "/sys/dev/control"

COMMANDS = {
    "on": {"D03102": 1},
    "off": {"D03102": 0},
    "high": {"D03102": 1, "D0310A": 3, "D0310C": 65},
    "low": {"D03102": 1, "D0310A": 3, "D0310C": 66},
    "fan": {"D03102": 1, "D0310A": 1, "D0310C": -127},
}
SWING_ON = 17222
STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cx5120-state.json")


class Heater:
    def __init__(self, host):
        self.host = host
        self.context = None
        self.crypto = EncryptionContext()

    async def open(self):
        self.context = await Context.create_client_context()
        await self._sync()

    async def close(self):
        if not self.context:
            return
        try:
            await asyncio.wait_for(self.context.shutdown(), timeout=2)
        except Exception:
            pass

    async def _request(self, message):
        try:
            return await asyncio.wait_for(self.context.request(message).response, timeout=4)
        except TimeoutError as error:
            raise RuntimeError("El CX5120 no responde en la red local.") from error

    async def _sync(self):
        token = os.urandom(4).hex().upper()
        response = await self._request(Message(
            code=POST,
            uri=f"coap://{self.host}:{PORT}{SYNC_PATH}",
            payload=token.encode(),
        ))
        self.crypto.set_client_key(response.payload.decode())

    def swing_enabled(self):
        try:
            with open(STATE_PATH, encoding="utf-8") as handle:
                return bool(json.load(handle).get("swing"))
        except (OSError, ValueError):
            return False

    def remember_swing(self, enabled):
        with open(STATE_PATH, "w", encoding="utf-8") as handle:
            json.dump({"swing": bool(enabled)}, handle)

    async def toggle_swing(self):
        enabled = not self.swing_enabled()
        await self.apply({"D0320F": SWING_ON if enabled else 0})
        self.remember_swing(enabled)
        return enabled

    async def status(self):
        request = Message(
            code=GET,
            uri=f"coap://{self.host}:{PORT}{STATUS_PATH}",
        )
        request.opt.observe = 0
        response = await self._request(request)
        payload = self.crypto.decrypt(response.payload.decode())
        reported = json.loads(payload)["state"]["reported"]
        return {
            "model": reported.get("D01S05", ""),
            "power": reported.get("D03102"),
            "modeA": reported.get("D0310A"),
            "modeB": reported.get("D0310C"),
            "target": reported.get("D0310E"),
            "swing": reported.get("D0320F"),
        }

    async def apply(self, values):
        last = "El CX5120 no aceptó la orden."
        for _attempt in range(2):
            body = {
                "state": {
                    "desired": {
                        "CommandType": "app",
                        "DeviceId": "",
                        "EnduserId": "",
                        **values,
                    }
                }
            }
            request = Message(
                code=POST,
                uri=f"coap://{self.host}:{PORT}{CONTROL_PATH}",
                payload=self.crypto.encrypt(json.dumps(body)).encode(),
                transport_tuning=Unreliable,
            )
            response = await self._request(request)
            result = json.loads(response.payload)
            if result.get("status") == "success":
                return
            last = "El CX5120 rechazó la orden."
            await self._sync()
        raise RuntimeError(last)


def local_prefixes():
    addresses = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.settimeout(1)
        probe.connect(("8.8.8.8", 80))
        addresses.add(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass
    prefixes = []
    for ip in addresses:
        parts = ip.split(".")
        if len(parts) != 4 or ip.startswith("127.") or ip.startswith("169.254."):
            continue
        prefix = ".".join(parts[:3])
        if prefix not in prefixes:
            prefixes.append(prefix)
    return prefixes


def looks_like_philips(payload):
    try:
        text = payload.decode("ascii")
    except UnicodeDecodeError:
        return False
    return len(text) == 8 and all(char in "0123456789ABCDEFabcdef" for char in text)


async def answers_philips(context, host, timeout):
    request = Message(
        code=POST,
        uri=f"coap://{host}:{PORT}{SYNC_PATH}",
        payload=os.urandom(4).hex().upper().encode(),
    )
    try:
        response = await asyncio.wait_for(context.request(request).response, timeout)
    except Exception:
        return False
    return looks_like_philips(response.payload)


async def locate(preferred):
    context = await Context.create_client_context()
    try:
        current = str(preferred or "").strip()
        if current and await answers_philips(context, current, 2):
            return current
        found = []
        for prefix in local_prefixes():
            ips = [f"{prefix}.{number}" for number in range(1, 255) if f"{prefix}.{number}" != current]
            for start in range(0, len(ips), 40):
                batch = ips[start:start + 40]
                results = await asyncio.gather(*(answers_philips(context, ip, 1.2) for ip in batch))
                found.extend(ip for ip, ok in zip(batch, results) if ok)
        return found[0] if found else ""
    finally:
        try:
            await asyncio.wait_for(context.shutdown(), timeout=2)
        except Exception:
            pass


async def main():
    action = sys.argv[1]
    if action == "locate":
        found = await locate(sys.argv[2] if len(sys.argv) > 2 else "")
        if not found:
            raise RuntimeError("No encuentro el CX5120 en la red.")
        print(json.dumps({"host": found}))
        return
    host = sys.argv[2]
    heater = Heater(host)
    try:
        await heater.open()
        if action == "status":
            print(json.dumps(await heater.status()))
            return
        if action == "rotate":
            enabled = await heater.toggle_swing()
            print(json.dumps({"ok": True, "action": "rotate", "swing": enabled}))
            return
        values = COMMANDS.get(action)
        if not values:
            raise RuntimeError(f"Orden desconocida: {action}")
        await heater.apply(values)
        print(json.dumps({"ok": True, "action": action}))
    finally:
        await heater.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
