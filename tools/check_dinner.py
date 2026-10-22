"""Check a dinner folder before publishing: python3 -I tools/check_dinner.py <slug>"""
import json, os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
slug = sys.argv[1]; folder = os.path.join(root, slug); problems = []
d = json.load(open(os.path.join(folder, "data.json")))
if d.get("slug") != slug: problems.append(f"slug in data.json is {d.get('slug')!r}, folder is {slug!r}")
for k in ("title", "kicker", "lede", "party", "deadline", "deadlineLabel", "dayLabel", "venues"):
    if not d.get(k): problems.append(f"missing {k}")
areas = {a["id"] for a in d.get("areas", [])}
ids = set()
for v in d.get("venues", []):
    n = v.get("name", v.get("id"))
    if v["id"] in ids: problems.append(f"duplicate venue id {v['id']}")
    ids.add(v["id"])
    if not re.fullmatch(r"[a-z0-9-]+", v["id"]): problems.append(f"{n}: id must be lowercase-dashes")
    if areas and v.get("area") not in areas: problems.append(f"{n}: area {v.get('area')!r} not in areas")
    if not v.get("times"): problems.append(f"{n}: no times")
    for t in v.get("times", []):
        if not re.fullmatch(r"\d{2}:\d{2}", t): problems.append(f"{n}: bad time {t}")
    ph = v.get("photos", [])
    if len(ph) > 4: problems.append(f"{n}: {len(ph)} photos, max 4")
    if not ph: problems.append(f"{n}: no photos")
    for p in ph:
        if not os.path.isfile(os.path.join(folder, p["src"])): problems.append(f"{n}: missing file {p['src']}")
        if not p.get("alt"): problems.append(f"{n}: photo without alt text")
if not os.path.isfile(os.path.join(folder, "index.html")): problems.append("index.html missing (copy _template/index.html)")
size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(folder) for f in fs)
print(f"{slug}: {len(ids)} venues, {size/1e6:.1f} MB")
print("\n".join("PROBLEM: " + p for p in problems) or "OK")
sys.exit(1 if problems else 0)
