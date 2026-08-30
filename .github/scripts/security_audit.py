#!/usr/bin/env python3
"""Daily dependency & supply-chain audit.

Five checks, all of them things that go quietly wrong between releases:

  1. known CVEs in the pinned Python dependencies         (pip-audit)
  2. base-image digest drift  -- the pinned sha256 no longer being what the
     upstream tag resolves to, i.e. the build is stuck on an unpatched base
  3. Subresource Integrity drift -- an `integrity=` hash in an HTML file that no
     longer matches the bytes npm publishes for that exact version
  4. loosened Python pins -- a requirement that stopped being `==`
  5. unpinned GitHub Actions -- a `uses:` on a mutable tag instead of a SHA

Writes Markdown to --output and exits 0 unless --fail-on-findings is passed.
The workflow reads `findings=true|false` from GITHUB_OUTPUT to decide whether to
open, update, or close the tracking issue.

Deliberately dependency-light: only pip-audit is external, everything else is
stdlib, so the audit itself adds no supply-chain surface worth speaking of.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

TIMEOUT = 60
findings: list[tuple[str, str, str]] = []  # (severity, check, markdown detail)
notes: list[str] = []


def add(sev: str, check: str, detail: str) -> None:
    findings.append((sev, check, detail))


def get_json(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


# ---------------------------------------------------------------- 1. pip-audit
def check_pip(root: Path) -> None:
    reqs = sorted(p for p in root.rglob("requirements*.txt")
                  if ".git" not in p.parts and "node_modules" not in p.parts)
    if not reqs:
        notes.append("No requirements files found.")
        return
    for req in reqs:
        rel = req.relative_to(root)
        try:
            proc = subprocess.run(
                [sys.executable, "-m", "pip_audit", "-r", str(req),
                 "--format", "json", "--progress-spinner", "off"],
                capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            add("WARN", "pip-audit", f"`{rel}` — audit timed out.")
            continue
        raw = proc.stdout.strip()
        if not raw:
            add("WARN", "pip-audit",
                f"`{rel}` — pip-audit produced no output.\n\n```\n{proc.stderr.strip()[-1500:]}\n```")
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            add("WARN", "pip-audit", f"`{rel}` — could not parse pip-audit output.")
            continue
        hits = 0
        for dep in data.get("dependencies", []):
            for v in dep.get("vulns", []):
                hits += 1
                fix = ", ".join(v.get("fix_versions") or []) or "none published"
                add("HIGH", "pip-audit",
                    f"`{rel}` — **{dep['name']} {dep['version']}** is affected by "
                    f"[{v['id']}](https://osv.dev/vulnerability/{v['id']}). "
                    f"Fixed in: {fix}.")
        if not hits:
            notes.append(f"`{rel}` — no known vulnerabilities.")


# --------------------------------------------------- 2. base-image digest drift
def registry_token(repo: str) -> str:
    return get_json("https://auth.docker.io/token?service=registry.docker.io"
                    f"&scope=repository:{repo}:pull")["token"]


def check_docker(root: Path) -> None:
    accept = ",".join([
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json"])
    pat = re.compile(r"^FROM\s+(?P<image>[^\s@:]+):(?P<tag>[^\s@]+)@(?P<digest>sha256:[0-9a-f]{64})",
                     re.MULTILINE)
    for df in sorted(root.rglob("Dockerfile*")):
        if ".git" in df.parts:
            continue
        rel = df.relative_to(root)
        for m in pat.finditer(df.read_text(encoding="utf-8", errors="replace")):
            image, tag, pinned = m["image"], m["tag"], m["digest"]
            repo = image if "/" in image else f"library/{image}"
            try:
                tok = registry_token(repo)
                req = urllib.request.Request(
                    f"https://registry-1.docker.io/v2/{repo}/manifests/{tag}",
                    headers={"Authorization": f"Bearer {tok}", "Accept": accept},
                    method="HEAD")
                with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                    live = r.headers.get("Docker-Content-Digest")
            except Exception as e:                      # network/registry problems
                add("WARN", "base-image", f"`{rel}` — could not reach registry for `{image}:{tag}`: {e}")
                continue
            if not live:
                add("WARN", "base-image", f"`{rel}` — registry returned no digest for `{image}:{tag}`.")
            elif live != pinned:
                add("HIGH", "base-image",
                    f"`{rel}` — `{image}:{tag}` now resolves to `{live}` but the Dockerfile pins "
                    f"`{pinned}`. The build is on a stale base image and is missing whatever "
                    f"base-OS patches the rebuild carried. Update the digest.")
            else:
                notes.append(f"`{rel}` — `{image}:{tag}` digest is current.")


# ------------------------------------------------------------- 3. SRI integrity
SCRIPT_TAG = re.compile(r"<script\b[^>]*>", re.IGNORECASE)
ATTR = {k: re.compile(rf'{k}\s*=\s*"([^"]+)"', re.IGNORECASE) for k in ("src", "integrity")}
CDN = re.compile(r"https://(?:unpkg\.com|cdn\.jsdelivr\.net/npm)/"
                 r"(?P<name>(?:@[^/@]+/)?[^/@]+)@(?P<ver>[^/]+)/(?P<path>[^\"?]+)")


def npm_file_bytes(name: str, ver: str, path: str) -> bytes:
    meta = get_json(f"https://registry.npmjs.org/{name}/{ver}")
    dist = meta["dist"]
    with urllib.request.urlopen(dist["tarball"], timeout=TIMEOUT) as r:
        tgz = r.read()
    integ = dist.get("integrity")
    if integ:                                   # verify the tarball before trusting it
        alg, b64 = integ.split("-", 1)
        if base64.b64encode(hashlib.new(alg, tgz).digest()).decode() != b64:
            raise ValueError("npm tarball failed its own integrity check")
    with tarfile.open(fileobj=io.BytesIO(tgz)) as tf:
        member = tf.extractfile("package/" + path.lstrip("/"))
        if member is None:
            raise KeyError(path)
        return member.read()


def check_sri(root: Path) -> None:
    for html in sorted(root.rglob("*.html")):
        if ".git" in html.parts or "node_modules" in html.parts:
            continue
        rel = html.relative_to(root)
        text = html.read_text(encoding="utf-8", errors="replace")
        for tag in SCRIPT_TAG.findall(text):
            src_m = ATTR["src"].search(tag)
            if not src_m:
                continue
            src = src_m.group(1)
            cdn = CDN.search(src)
            if not cdn:
                continue
            integ_m = ATTR["integrity"].search(tag)
            if not integ_m:
                add("HIGH", "sri",
                    f"`{rel}` — `{src}` is loaded from a CDN with **no integrity attribute**. "
                    f"A compromised CDN would execute arbitrary JavaScript on this page.")
                continue
            if not re.fullmatch(r"[0-9]+(\.[0-9]+)*", cdn["ver"]):
                add("MEDIUM", "sri",
                    f"`{rel}` — `{cdn['name']}` is pinned to the floating tag `{cdn['ver']}`. "
                    f"The integrity hash will break the page as soon as the tag moves; pin an exact version.")
                continue
            try:
                data = npm_file_bytes(cdn["name"], cdn["ver"], cdn["path"])
            except Exception as e:
                add("WARN", "sri", f"`{rel}` — could not verify `{cdn['name']}@{cdn['ver']}`: {e}")
                continue
            alg = integ_m.group(1).split("-", 1)[0]
            if alg not in ("sha256", "sha384", "sha512"):
                add("WARN", "sri", f"`{rel}` — unrecognised integrity algorithm `{alg}`.")
                continue
            want = f"{alg}-" + base64.b64encode(hashlib.new(alg, data).digest()).decode()
            if want != integ_m.group(1):
                add("HIGH", "sri",
                    f"`{rel}` — integrity hash for **{cdn['name']}@{cdn['ver']}** does not match what "
                    f"npm publishes.\n\n  - in the file: `{integ_m.group(1)}`\n  - from npm:    `{want}`\n\n"
                    f"Either the pin was bumped without refreshing the hash (the page is now broken for "
                    f"every visitor), or the published bytes changed. Resolve before deploying.")
            else:
                notes.append(f"`{rel}` — SRI for `{cdn['name']}@{cdn['ver']}` verified.")


# ------------------------------------------------------- 4. loosened pip pins
def check_pins(root: Path) -> None:
    for req in sorted(root.rglob("requirements*.txt")):
        if ".git" in req.parts:
            continue
        rel = req.relative_to(root)
        for i, line in enumerate(req.read_text(encoding="utf-8").splitlines(), 1):
            s = line.split("#", 1)[0].strip()
            if not s or s.startswith("-"):
                continue
            if "==" not in s:
                add("MEDIUM", "pinning",
                    f"`{rel}:{i}` — `{s}` is not pinned with `==`. Renovate and Dependabot cannot "
                    f"raise updates for an open range, so this dependency silently stops being tracked.")


# --------------------------------------------------- 5. unpinned GitHub Actions
def check_actions(root: Path) -> None:
    wf = root / ".github" / "workflows"
    if not wf.is_dir():
        return
    uses = re.compile(r"uses:\s*(?P<ref>[A-Za-z0-9._-]+/[A-Za-z0-9._/-]+@(?P<v>\S+))")
    for f in sorted(list(wf.glob("*.yml")) + list(wf.glob("*.yaml"))):
        rel = f.relative_to(root)
        for i, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            m = uses.search(line)
            if m and not re.fullmatch(r"[0-9a-f]{40}", m["v"]):
                add("MEDIUM", "actions",
                    f"`{rel}:{i}` — `{m['ref']}` is pinned to a mutable tag. Whoever controls that "
                    f"action can repoint the tag at new code, which then runs with this workflow's token. "
                    f"Pin the full commit SHA.")


# ------------------------------------------------------------------- reporting
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--output", default="audit-report.md")
    ap.add_argument("--fail-on-findings", action="store_true")
    a = ap.parse_args()
    root = Path(a.root).resolve()

    for fn in (check_pip, check_docker, check_sri, check_pins, check_actions):
        try:
            fn(root)
        except Exception as e:                       # one broken check must not hide the others
            add("WARN", fn.__name__, f"check raised `{type(e).__name__}: {e}`")

    order = {"HIGH": 0, "MEDIUM": 1, "WARN": 2}
    findings.sort(key=lambda f: (order.get(f[0], 3), f[1]))

    out = [f"## Dependency & supply-chain audit — {root.name}", ""]
    if findings:
        highs = sum(1 for f in findings if f[0] == "HIGH")
        out.append(f"**{len(findings)} finding(s)** — {highs} high severity." if highs
                   else f"**{len(findings)} finding(s)** — none high severity.")
        out.append("")
        for sev, check, detail in findings:
            out.append(f"- **{sev}** · `{check}` — {detail}")
    else:
        out.append("No findings. Dependencies, base-image digests, SRI hashes, "
                   "pins and action refs all check out.")
    if notes:
        out += ["", "<details><summary>Checks that passed</summary>", ""]
        out += [f"- {n}" for n in notes]
        out += ["", "</details>"]
    out += ["", "---", "",
            "_Generated by `.github/scripts/security_audit.py` "
            "(daily `security-audit` workflow)._"]
    report = "\n".join(out)

    Path(a.output).write_text(report, encoding="utf-8")
    print(report)

    gho = os.environ.get("GITHUB_OUTPUT")
    if gho:
        with open(gho, "a", encoding="utf-8") as fh:
            fh.write(f"findings={'true' if findings else 'false'}\n")
            fh.write(f"count={len(findings)}\n")

    return 1 if (findings and a.fail_on_findings) else 0


if __name__ == "__main__":
    sys.exit(main())
