#!/usr/bin/env python3
# Intentional Arrangement SKOS Editor © 2026 Contextually LLC (d/b/a Ontology Pipeline)
# Size-based source-available license: Apache License 2.0 for organizations under 75
# employees; a written enterprise license is required at 75+ (Hello@ontologypipeline.com).
# Not an OSI-approved open-source license. See LICENSE / NOTICE.
"""
Intentional Arrangement SKOS — REST API (thin Flask wrapper over skoslib).

  POST /validate[?detail=full|summary]   qSKOS-style validation of a SKOS vocabulary
  POST /profile                          the profile alone: counts, coverage, SHACL counts by severity
  POST /parse                            the vocabulary itself as plain data, filtered and paged
  POST /convert?to=<fmt>                 convert between RDF serializations
  GET  /                                 self-describing index

    pip install -r requirements.txt
    python server.py                 # http://127.0.0.1:8000

Send RDF as the raw request body with a Content-Type (e.g. text/turtle), or add
?from=ttl. CORS is open so the browser app can call this directly.
"""
import logging
import os
from flask import Flask, request, Response, jsonify
import skoslib

app = Flask(__name__)
log = logging.getLogger("iaskos.api")


@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


def _hint():
    return (request.args.get("from") or (request.content_type or "").split(";")[0].strip() or "").lower()


def _unsupported(e):
    """A format the engine does not offer: say which, and what is offered, so it is never mistaken for bad input."""
    return jsonify({"ok": False, "error": str(e),
                    "supported_input": skoslib.INPUT_FORMATS, "supported_output": skoslib.OUTPUT_FORMATS}), 400


@app.route("/validate", methods=["POST", "OPTIONS"])
def validate():
    if request.method == "OPTIONS":
        return Response(status=204)
    try:
        return jsonify(skoslib.validate_rdf(request.get_data(), _hint(), request.args.get("detail", "full")))
    except skoslib.UnsupportedFormat as e:
        return _unsupported(e)
    except Exception:
        # Log the detail server-side; never return exception/stack text to the
        # client (code-scanning: py/stack-trace-exposure).
        log.exception("validate failed")
        return jsonify({"ok": False, "error": "Could not validate the submitted RDF. Check that it is well-formed and the format hint is correct."}), 400


@app.route("/profile", methods=["POST", "OPTIONS"])
def profile():
    if request.method == "OPTIONS":
        return Response(status=204)
    try:
        return jsonify(skoslib.profile_rdf(request.get_data(), _hint()))
    except skoslib.UnsupportedFormat as e:
        return _unsupported(e)
    except Exception:
        log.exception("profile failed")
        return jsonify({"ok": False, "error": "Could not profile the submitted RDF. Check that it is well-formed and the format hint is correct."}), 400


@app.route("/parse", methods=["POST", "OPTIONS"])
def parse():
    """The vocabulary's content as plain data: ?detail=counts|labels|concepts|full &scheme= &query= &lang= &limit= &offset="""
    if request.method == "OPTIONS":
        return Response(status=204)
    a = request.args
    try:
        return jsonify(skoslib.parse_vocabulary(request.get_data(), _hint(), scheme=a.get("scheme"), query=a.get("query"),
                                                lang=a.get("lang"), detail=a.get("detail", "concepts"),
                                                limit=a.get("limit", 200), offset=a.get("offset", 0)))
    except skoslib.UnsupportedFormat as e:
        return _unsupported(e)
    except Exception:
        log.exception("parse failed")
        return jsonify({"ok": False, "error": "Could not parse the submitted RDF. Check that it is well-formed and the format hint is correct."}), 400


@app.route("/convert", methods=["POST", "OPTIONS"])
def convert():
    if request.method == "OPTIONS":
        return Response(status=204)
    try:
        text, mime, ext = skoslib.convert_rdf(request.get_data(), request.args.get("to", "turtle"), _hint())
        resp = Response(text, mimetype=mime)
        resp.headers["Content-Disposition"] = f'inline; filename="vocabulary.{ext}"'
        return resp
    except skoslib.UnsupportedFormat as e:
        return _unsupported(e)
    except Exception:
        # Log the detail server-side; never return exception/stack text to the
        # client (code-scanning: py/stack-trace-exposure).
        log.exception("convert failed")
        return jsonify({"ok": False, "error": "Could not convert the submitted RDF. Check that it is well-formed."}), 400


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "name": "Intentional Arrangement SKOS — API",
        "endpoints": {
            "POST /validate": "qSKOS-style validation (SHACL integrity + structural). Send SKOS RDF; get a JSON report. "
                              "?detail=summary groups the SHACL results by shape and drops the text report.",
            "POST /profile": "the profile alone: concepts, coverage, top concepts, structural findings, SHACL counts by severity, and sound (no violations).",
            "POST /parse": "the vocabulary itself as plain data, paged: schemes, counts, concepts with labels, notes and relations. ?detail=counts|labels|concepts|full, ?scheme=, ?query=, ?lang=, ?limit=, ?offset=.",
            "POST /convert?to=<fmt>": "convert between " + " | ".join(skoslib.OUTPUT_FORMATS),
        },
        "input_formats": skoslib.INPUT_FORMATS,
        "output_formats": skoslib.OUTPUT_FORMATS,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Intentional Arrangement SKOS API → http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port)
