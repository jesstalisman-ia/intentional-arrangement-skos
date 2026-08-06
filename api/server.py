#!/usr/bin/env python3
"""
Intentional Arrangement SKOS — REST API (thin Flask wrapper over skoslib).

  POST /validate            qSKOS-style validation of a SKOS vocabulary
  POST /convert?to=<fmt>    convert between RDF serializations
  GET  /                    self-describing index

    pip install -r requirements.txt
    python server.py                 # http://127.0.0.1:8000

Send RDF as the raw request body with a Content-Type (e.g. text/turtle), or add
?from=ttl. CORS is open so the browser app can call this directly.
"""
import os
from flask import Flask, request, Response, jsonify
import skoslib

app = Flask(__name__)


@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


def _hint():
    return (request.args.get("from") or (request.content_type or "").split(";")[0].strip() or "").lower()


@app.route("/validate", methods=["POST", "OPTIONS"])
def validate():
    if request.method == "OPTIONS":
        return Response(status=204)
    try:
        return jsonify(skoslib.validate_rdf(request.get_data(), _hint()))
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@app.route("/convert", methods=["POST", "OPTIONS"])
def convert():
    if request.method == "OPTIONS":
        return Response(status=204)
    try:
        text, mime, ext = skoslib.convert_rdf(request.get_data(), request.args.get("to", "turtle"), _hint())
        resp = Response(text, mimetype=mime)
        resp.headers["Content-Disposition"] = f'inline; filename="vocabulary.{ext}"'
        return resp
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "name": "Intentional Arrangement SKOS — API",
        "endpoints": {
            "POST /validate": "qSKOS-style validation (SHACL integrity + structural). Send SKOS RDF; get a JSON report.",
            "POST /convert?to=<fmt>": "convert between " + " | ".join(skoslib.OUTPUT_FORMATS),
        },
        "input_formats": skoslib.INPUT_FORMATS,
        "output_formats": skoslib.OUTPUT_FORMATS,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Intentional Arrangement SKOS API → http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port)
