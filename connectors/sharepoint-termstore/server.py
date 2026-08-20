# Provided AS-IS, without warranty of any kind; the author accepts no liability.
# Not hardened for production (no auth, permissive CORS by default). You are
# responsible for securing it. See README.md "Disclaimer". Use at your own risk.
"""Bridge service for the *repeatable / live sync* case.

The editor is a static page and can't hold tenant secrets, so this small Flask
service authenticates to Microsoft Graph server-side and hands the browser SKOS
Turtle. Point the editor's importer at it, or wire a "Connect to SharePoint" fetch.

Endpoints:
  GET /health            -> {"ok": true}
  GET /sets              -> [{"id","name","group"}]  (list term sets to pick from)
  GET /skos.ttl          -> Turtle for the whole store
  GET /skos.ttl?set=<id> -> Turtle for one term set
  query: xl=1 to emit SKOS-XL; base=<uri> to override the URI namespace

Config via env: SP_AUTH_MODE (device|app), SP_TENANT, SP_CLIENT_ID,
SP_CLIENT_SECRET (app mode), SP_SITE, SP_BASE_URI, and CORS_ORIGIN (lock this to
your editor's origin before deploying — see README security notes).

NOT hardened as shipped: no auth on the bridge itself, permissive CORS default.
Review README.md before exposing it.
"""
import os
from flask import Flask, request, jsonify, Response

from termstore_to_skos import to_turtle

app = Flask(__name__)
_CACHE = {}   # trivial in-process cache of the last pull


def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = os.environ.get("CORS_ORIGIN", "*")
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


def _pull():
    from graph_client import pull_termstore
    return pull_termstore()


@app.route("/health")
def health():
    return _cors(jsonify({"ok": True}))


@app.route("/sets")
def sets():
    data = _pull(); _CACHE["data"] = data
    default = (data.get("store") or {}).get("defaultLanguageTag", "en")
    out = []
    for s in data.get("sets", []):
        names = s.get("localizedNames") or []
        name = next((n["name"] for n in names if n.get("languageTag") == default), None) or (names[0]["name"] if names else s["id"])
        out.append({"id": s["id"], "name": name, "group": (s.get("group") or {}).get("name")})
    return _cors(jsonify(out))


@app.route("/skos.ttl")
def skos_ttl():
    data = _CACHE.get("data") or _pull(); _CACHE["data"] = data
    set_id = request.args.get("set")
    if set_id:
        data = {"store": data.get("store", {}), "sets": [s for s in data.get("sets", []) if s["id"] == set_id]}
    base = request.args.get("base") or os.environ.get("SP_BASE_URI", "https://sharepoint.example/termstore/")
    ttl = to_turtle(data, base=base, xl=request.args.get("xl") in ("1", "true", "yes"))
    return _cors(Response(ttl, mimetype="text/turtle"))


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8020")))
