#!/usr/bin/env python3
"""No-cache static server for the Intentional Arrangement SKOS app.
    python3 serve.py            # http://localhost:8080  (serves ./app)
    python3 serve.py 8090
"""
import http.server, socketserver, os, sys
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=APP, **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()
    def log_message(self, *a): pass
class S(socketserver.ThreadingTCPServer): allow_reuse_address = True
print(f"Intentional Arrangement SKOS -> http://localhost:{PORT}  (serving {APP})")
S(("", PORT), H).serve_forever()
