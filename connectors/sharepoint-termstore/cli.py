"""CLI: pull a SharePoint term store (or convert a saved export) to SKOS Turtle.

Examples:
  # Offline — convert a Graph-shaped JSON export (no tenant access needed):
  python cli.py --from sample_termstore.json --base https://acme.sharepoint.com/terms/ -o acme.ttl

  # Live — delegated sign-in (a user opens a browser and enters a code):
  SP_TENANT=<tenant> SP_CLIENT_ID=<app-id> python cli.py --mode device -o acme.ttl

  # Live — app-only (unattended; admin-consented app):
  SP_TENANT=<tenant> SP_CLIENT_ID=<app-id> SP_CLIENT_SECRET=<secret> \
      python cli.py --mode app -o acme.ttl

Import the resulting .ttl into the editor: Import… -> choose the file -> Import.
"""
import argparse
import json
import sys

from termstore_to_skos import to_turtle


def main():
    ap = argparse.ArgumentParser(description="SharePoint term store -> SKOS Turtle")
    ap.add_argument("--from", dest="src", help="Graph-shaped JSON file (offline). Omit to pull live from Graph.")
    ap.add_argument("--mode", choices=["device", "app"], help="Live auth mode (delegated device code, or app-only).")
    ap.add_argument("--tenant", help="Azure AD tenant (or SP_TENANT env).")
    ap.add_argument("--client-id", help="App registration client id (or SP_CLIENT_ID env).")
    ap.add_argument("--client-secret", help="App-only secret (or SP_CLIENT_SECRET env).")
    ap.add_argument("--site", help="Site locator: 'root', a site id, or 'host:/sites/path' (or SP_SITE env).")
    ap.add_argument("--base", default="https://sharepoint.example/termstore/", help="Base namespace for minted concept/scheme URIs.")
    ap.add_argument("--xl", action="store_true", help="Emit SKOS-XL labels alongside plain skos labels.")
    ap.add_argument("-o", "--out", help="Output .ttl (default: stdout).")
    args = ap.parse_args()

    if args.src:
        data = json.load(open(args.src))
    else:
        from graph_client import pull_termstore   # imported lazily so offline use needs no msal/requests
        data = pull_termstore(mode=args.mode, tenant=args.tenant, client_id=args.client_id,
                              client_secret=args.client_secret, site=args.site)

    ttl = to_turtle(data, base=args.base, xl=args.xl)
    if args.out:
        open(args.out, "w").write(ttl)
        n = len(data.get("sets", []))
        print(f"Wrote {args.out} — {n} term set{'' if n == 1 else 's'}.", file=sys.stderr)
    else:
        sys.stdout.write(ttl)


if __name__ == "__main__":
    main()
