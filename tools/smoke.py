#!/usr/bin/env python3
"""Smoke test — loads the editor in headless Chrome and asserts it actually works.

Catches the failures a syntax check cannot: a truncated or invisible concept
form, a broken tab shell, console errors on load, a dead export/import round
trip. Self-contained: serves app/ itself on an ephemeral port, so no dev server
needs to be running.

Usage:  python3 tools/smoke.py            (from the repo root)
Exit 0 = pass, 1 = fail (findings printed).
"""
import base64
import hashlib
import http.client
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a):  # request logging is noise in a test
        pass

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.path.join(ROOT, "app")
WINDOW = "1440,820"          # a realistic laptop window, not a giant test viewport

# ---------------------------------------------------------------- tiny ws client
class WS:
    def __init__(self, url):
        m = re.match(r"ws://([^:/]+):(\d+)(/.*)", url)
        host, port, path = m.group(1), int(m.group(2)), m.group(3)
        self.sock = socket.create_connection((host, port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((
            f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        ).encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            resp += self.sock.recv(4096)
        assert b"101" in resp.split(b"\r\n")[0], "websocket handshake failed"
        self.buf = b""

    def send(self, obj):
        data = json.dumps(obj).encode()
        head = b"\x81"
        n = len(data)
        if n < 126:
            head += struct.pack("B", 0x80 | n)
        elif n < 65536:
            head += struct.pack("!BH", 0x80 | 126, n)
        else:
            head += struct.pack("!BQ", 0x80 | 127, n)
        mask = os.urandom(4)
        self.sock.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError("websocket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        b1, b2 = self._read_exact(2)
        n = b2 & 0x7F
        if n == 126:
            n = struct.unpack("!H", self._read_exact(2))[0]
        elif n == 127:
            n = struct.unpack("!Q", self._read_exact(8))[0]
        payload = self._read_exact(n)
        if (b1 & 0x0F) == 8:
            raise EOFError("websocket close frame")
        return json.loads(payload.decode()) if payload else {}

# ---------------------------------------------------------------- cdp helpers
class CDP:
    def __init__(self, ws):
        self.ws = ws
        self.next_id = 0
        self.events = []

    def call(self, method, params=None, timeout=30):
        self.next_id += 1
        mid = self.next_id
        self.ws.send({"id": mid, "method": method, "params": params or {}})
        end = time.time() + timeout
        while time.time() < end:
            msg = self.ws.recv()
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            if "method" in msg:
                self.events.append(msg)
        raise TimeoutError(method)

    def wait_event(self, name, timeout=20):
        for e in self.events:
            if e["method"] == name:
                return e
        end = time.time() + timeout
        while time.time() < end:
            msg = self.ws.recv()
            if "method" in msg:
                self.events.append(msg)
                if msg["method"] == name:
                    return msg
        raise TimeoutError(name)

# ---------------------------------------------------------------- in-page test
PAGE_TEST = r"""
(async () => {
  const out = { failures: [], info: {} };
  const $ = s => document.querySelector(s);
  const fail = m => out.failures.push(m);

  if (!($('#tabs') || $('#journey'))) fail('app shell missing (#tabs / #journey)');

  // Build room: select the first concept and demand a complete, VISIBLE form
  const row = document.querySelector('.trow');
  if (!row) fail('concept tree empty — no .trow to select');
  else {
    row.click();
    await new Promise(r => setTimeout(r, 700));
    const ed = document.getElementById('editor');
    const groups = ed ? [...ed.querySelectorAll('.grp')] : [];
    out.info.formGroups = groups.length;
    if (groups.length < 12) fail(`concept form has ${groups.length} field groups (expected >= 12)`);
    const last = groups[groups.length - 1];
    if (last) {
      const r2 = last.getBoundingClientRect();
      if (!last.offsetParent || r2.height <= 0) fail('last form group is not visible');
      // clipped-container detector: if an ancestor scrolls, enough of the form must
      // actually be visible inside it — a capped container showing only the header
      // row (the v0.17.0 truncated-form bug) fails here
      let n = last.parentElement;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (cs.overflowY !== 'visible' && n.scrollHeight > n.clientHeight + 4) {
          const box = n.getBoundingClientRect();
          const visible = groups.filter(g => { const r3 = g.getBoundingClientRect();
            return r3.top >= box.top - 1 && r3.bottom <= box.bottom + 1; }).length;
          if (visible < 8 && n.clientHeight < 600)
            fail(`concept form clipped: scroll container ${Math.round(n.clientHeight)}px tall shows only ${visible} of ${groups.length} field groups`);
        }
        n = n.parentElement;
      }
    }
  }

  // standards engine: build → export → re-import → validate
  try {
    const m = newModel(); m.scheme.title = 'Smoke';
    const c = Core.emptyConcept('SmokeTest');
    c.pref = [{ lang: 'en', val: 'Smoke Test' }]; c.top = true;
    m.concepts['SmokeTest'] = c; m.order = ['SmokeTest'];
    const ttl = Core.toTurtle(m, { dc: true });
    if (!/skos:prefLabel "Smoke Test"@en/.test(ttl)) fail('Turtle export missing prefLabel');
    const m2 = modelFromTTL(ttl);
    if (!(m2 && m2.concepts && m2.concepts.SmokeTest)) fail('Turtle round-trip lost the concept');
    if (!Array.isArray(Core.validate(m))) fail('Core.validate did not return an array');
  } catch (e) { fail('engine: ' + String(e.message || e)); }

  return JSON.stringify(out);
})()
"""

# ---------------------------------------------------------------- main
def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p

def main():
    if not os.path.exists(CHROME):
        print("SKIP: Chrome not found at", CHROME)
        return 0
    port = free_port()
    handler = partial(QuietHandler, directory=APP_DIR)
    httpd = HTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    dbg = free_port()
    profile = tempfile.mkdtemp(prefix="smoke-chrome-")
    proc = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={dbg}",
         f"--user-data-dir={profile}", f"--window-size={WINDOW}",
         "--no-first-run", "--disable-extensions", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failures, info = [], {}
    try:
        ws_url = None
        for _ in range(50):
            try:
                conn = http.client.HTTPConnection("127.0.0.1", dbg, timeout=2)
                conn.request("GET", "/json")
                tabs = json.loads(conn.getresponse().read())
                pages = [t for t in tabs if t.get("type") == "page"]
                if pages:
                    ws_url = pages[0]["webSocketDebuggerUrl"]
                    break
            except Exception:
                pass
            time.sleep(0.2)
        if not ws_url:
            print("FAIL: could not reach headless Chrome")
            return 1
        cdp = CDP(WS(ws_url))
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Log.enable")
        cdp.call("Page.navigate", {"url": f"http://127.0.0.1:{port}/index.html"})
        cdp.wait_event("Page.loadEventFired")
        time.sleep(1.0)
        # console + uncaught errors during load
        for e in cdp.events:
            if e["method"] == "Log.entryAdded" and e["params"]["entry"].get("level") == "error":
                failures.append("console: " + e["params"]["entry"].get("text", "")[:160])
            if e["method"] == "Runtime.exceptionThrown":
                d = e["params"]["exceptionDetails"]
                failures.append("uncaught: " + (d.get("exception", {}).get("description") or d.get("text", ""))[:160])
        res = cdp.call("Runtime.evaluate",
                       {"expression": PAGE_TEST, "awaitPromise": True, "returnByValue": True},
                       timeout=40)
        payload = json.loads(res["result"]["value"])
        failures.extend(payload["failures"])
        info = payload.get("info", {})
    finally:
        proc.terminate()
        httpd.shutdown()
        shutil.rmtree(profile, ignore_errors=True)

    name = os.path.basename(ROOT)
    if failures:
        print(f"SMOKE FAIL — {name} ({len(failures)} finding{'s' if len(failures) != 1 else ''}):")
        for f in failures:
            print("  ✗", f)
        return 1
    print(f"SMOKE PASS — {name} (form groups: {info.get('formGroups', '?')}, engine round-trip ok, console clean)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
