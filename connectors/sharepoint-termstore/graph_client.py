# Provided AS-IS, without warranty of any kind; the author accepts no liability.
# You are responsible for the app registration, credentials, and compliance.
# See README.md "Disclaimer". Use at your own risk.
"""Pull a SharePoint Online term store via Microsoft Graph, normalized for the mapper.

Two auth modes, chosen because the client's IT hasn't decided which they'll grant:

  * delegated (device code) — a user who can see the term store signs in in a browser;
    no client secret, no admin consent if TermStore.Read.All is granted to the user.
  * app-only (client credentials) — unattended; needs an admin to grant the app
    TermStore.Read.All (application) and a client secret or certificate.

Graph term store shapes:
  GET /sites/{site}/termStore/groups
  GET /sites/{site}/termStore/groups/{gid}/sets
  GET /sites/{site}/termStore/sets/{sid}/children      (top-level terms)
  GET /sites/{site}/termStore/terms/{tid}/children     (recurse)
Docs: https://learn.microsoft.com/en-us/graph/api/resources/termstore-term

This module is structured to the documented API but is not exercised here against a
live tenant (there are no credentials in the repo). Run it against your tenant once
the app registration exists; see README.md.
"""
import os
import requests

GRAPH = "https://graph.microsoft.com/v1.0"
AUTHORITY = "https://login.microsoftonline.com/{tenant}"


def get_token(mode, tenant, client_id, client_secret=None):
    """Return a bearer token. mode: 'device' (delegated) or 'app' (client credentials)."""
    import msal
    authority = AUTHORITY.format(tenant=tenant)
    if mode == "app":
        app = msal.ConfidentialClientApplication(client_id, authority=authority, client_credential=client_secret)
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    elif mode == "device":
        app = msal.PublicClientApplication(client_id, authority=authority)
        flow = app.initiate_device_flow(scopes=["https://graph.microsoft.com/TermStore.Read.All"])
        if "user_code" not in flow:
            raise RuntimeError("Could not start device flow: " + str(flow))
        print(flow["message"], flush=True)   # "To sign in, use a web browser to open https://microsoft.com/devicelogin and enter code ..."
        result = app.acquire_token_by_device_flow(flow)
    else:
        raise ValueError("mode must be 'device' or 'app'")
    if "access_token" not in result:
        raise RuntimeError("Auth failed: " + result.get("error_description", str(result)))
    return result["access_token"]


class GraphTermStore:
    def __init__(self, token, site="root"):
        self.h = {"Authorization": "Bearer " + token, "Accept": "application/json"}
        self.site_id = self._resolve_site(site)

    def _get(self, url):
        if url.startswith("/"):
            url = GRAPH + url
        r = requests.get(url, headers=self.h, timeout=60)
        r.raise_for_status()
        return r.json()

    def _paged(self, url):
        out = []
        data = self._get(url)
        out.extend(data.get("value", []))
        while data.get("@odata.nextLink"):
            data = self._get(data["@odata.nextLink"])
            out.extend(data.get("value", []))
        return out

    def _resolve_site(self, site):
        # "root", a site id, or a "hostname:/sites/path" server-relative locator
        if site == "root":
            return self._get("/sites/root")["id"]
        if ":" in site and "/" in site:
            return self._get("/sites/" + site)["id"]
        return site

    def _term(self, t):
        """Normalize a Graph term (+ recurse children) into the mapper's shape."""
        node = {
            "id": t["id"],
            "labels": t.get("labels", []),
            "descriptions": t.get("descriptions", []),
            "properties": t.get("properties", []),
            "isDeprecated": t.get("isDeprecated", False),
            "createdDateTime": t.get("createdDateTime"),
            "lastModifiedDateTime": t.get("lastModifiedDateTime"),
            "children": [],
        }
        base = f"/sites/{self.site_id}/termStore/terms/{t['id']}/children"
        for child in self._paged(base):
            node["children"].append(self._term(child))
        return node

    def pull(self):
        """Walk groups -> sets -> terms and return the normalized {store, sets} dict."""
        store = self._get(f"/sites/{self.site_id}/termStore")
        data = {
            "store": {
                "defaultLanguageTag": store.get("defaultLanguageTag", "en-US"),
                "languageTags": store.get("languageTags", []),
            },
            "sets": [],
        }
        for group in self._paged(f"/sites/{self.site_id}/termStore/groups"):
            for s in self._paged(f"/sites/{self.site_id}/termStore/groups/{group['id']}/sets"):
                set_node = {
                    "id": s["id"],
                    "localizedNames": s.get("localizedNames", []),
                    "description": s.get("description"),
                    "group": {"id": group.get("id"), "name": group.get("displayName")},
                    "terms": [],
                }
                for t in self._paged(f"/sites/{self.site_id}/termStore/sets/{s['id']}/children"):
                    set_node["terms"].append(self._term(t))
                data["sets"].append(set_node)
        return data


def pull_termstore(mode=None, tenant=None, client_id=None, client_secret=None, site=None):
    """Convenience: read config from args or env, authenticate, and pull."""
    mode = mode or os.environ.get("SP_AUTH_MODE", "device")
    tenant = tenant or os.environ.get("SP_TENANT")
    client_id = client_id or os.environ.get("SP_CLIENT_ID")
    client_secret = client_secret or os.environ.get("SP_CLIENT_SECRET")
    site = site or os.environ.get("SP_SITE", "root")
    if not tenant or not client_id:
        raise RuntimeError("Set SP_TENANT and SP_CLIENT_ID (and SP_CLIENT_SECRET for app mode).")
    token = get_token(mode, tenant, client_id, client_secret)
    return GraphTermStore(token, site=site).pull()
