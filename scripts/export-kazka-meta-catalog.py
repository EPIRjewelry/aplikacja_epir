#!/usr/bin/env python3
"""
SSOT Shopify export → Meta Commerce catalog CSV (Kazka, ALL variants).

Source of truth (default): D:/marketing/csv/kazka_27_wrzesien.csv

Contract:
  id            = Variant SKU (unique; must match Meta Pixel content_ids)
  item_group_id = product Handle (must never equal any id)
  link          = https://kazka.epirbizuteria.pl/products/{handle}
  1 CSV row     = 1 Shopify variant

  python scripts/export-kazka-meta-catalog.py
  python scripts/export-kazka-meta-catalog.py --from D:/marketing/csv/kazka_27_wrzesien.csv
  python scripts/export-kazka-meta-catalog.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass, field
from html import unescape
from pathlib import Path

STOREFRONT_BASE = "https://kazka.epirbizuteria.pl"
BRAND = "Kazka Jewelry"
DEFAULT_SSOT = Path(r"D:/marketing/csv/kazka_27_wrzesien.csv")
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "marketing" / "csv" / "kazka-meta-catalog.csv"

META_COLUMNS = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "brand",
    "item_group_id",
    "mpn",
    "material",
    "size",
    "pattern",
    "google_product_category",
]


@dataclass
class Product:
    handle: str
    title: str = ""
    body: str = ""
    vendor: str = ""
    tags: str = ""
    status: str = ""
    category: str = ""
    images: list[str] = field(default_factory=list)


_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_RE = re.compile(r"<script[\s\S]*?</script>", re.I)
_STYLE_RE = re.compile(r"<style[\s\S]*?</style>", re.I)
_WS_RE = re.compile(r"\s+")


def strip_html(html: str) -> str:
    text = _SCRIPT_RE.sub(" ", html or "")
    text = _STYLE_RE.sub(" ", text)
    text = _TAG_RE.sub(" ", text)
    text = unescape(text)
    return _WS_RE.sub(" ", text).strip()


def format_price(raw: str) -> str | None:
    try:
        n = float(str(raw).replace(",", ".").strip())
    except ValueError:
        return None
    if n < 0:
        return None
    return f"{n:.2f} PLN"


def availability(qty_raw: str) -> str:
    try:
        n = int(str(qty_raw).strip())
    except ValueError:
        return "out of stock"
    return "in stock" if n > 0 else "out of stock"


_KARAT_RE = re.compile(r"^\d+\s*karat", re.I)
_RING_SIZE_RE = re.compile(r"^\d{1,2}$")
_CLARITY_RE = re.compile(
    r"^(LAB|BLACK|D/VVS2|F/VS2|G/VS2|G/SI|E/VVS1|F/VVS2|G/VVS2|H/SI|I/SI)(\b|$)",
    re.I,
)


def classify_option(name: str, value: str) -> str:
    """Return material | size | pattern. SSOT often has empty Option Names — use value heuristics."""
    n = (name or "").strip().lower()
    v = (value or "").strip()
    if "próba" in n or "proba" in n or "złota" in n or "zlota" in n:
        return "material"
    if "rozmiar" in n or n == "size":
        return "size"
    if "jako" in n or "quality" in n:
        return "pattern"
    # Value heuristics (Shopify export often blanks Option* Name on continuation rows)
    if _KARAT_RE.match(v):
        return "material"
    if _CLARITY_RE.match(v) or v.upper() == "LAB":
        return "pattern"
    if _RING_SIZE_RE.match(v):
        return "size"
    return "pattern"


def map_options(row: dict[str, str]) -> tuple[str, str, str]:
    material: list[str] = []
    size_parts: list[str] = []
    pattern_parts: list[str] = []
    for i in (1, 2, 3):
        name = row.get(f"Option{i} Name") or ""
        value = (row.get(f"Option{i} Value") or "").strip()
        if not value:
            continue
        kind = classify_option(name, value)
        if kind == "material":
            material.append(value)
        elif kind == "size":
            size_parts.append(value)
        else:
            pattern_parts.append(value)
    return " / ".join(material), " / ".join(size_parts), " / ".join(pattern_parts)


def title_with_options(base: str, row: dict[str, str]) -> str:
    parts = [
        (row.get(f"Option{i} Value") or "").strip()
        for i in (1, 2, 3)
        if (row.get(f"Option{i} Value") or "").strip()
    ]
    if not parts:
        return base
    full = f"{base} — {' / '.join(parts)}"
    return full if len(full) <= 200 else full[:197] + "…"


def is_kazka(product: Product) -> bool:
    if product.vendor.strip().lower() == "kazka":
        return True
    tags = [t.strip().lower() for t in product.tags.split(",") if t.strip()]
    return "kazka" in tags


def load_ssot(path: Path) -> tuple[dict[str, Product], list[dict[str, str]]]:
    products: dict[str, Product] = {}
    variants: list[dict[str, str]] = []

    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            raise SystemExit(f"No header in {path}")
        required = {"Handle", "Variant SKU", "Variant Price"}
        missing = required - set(reader.fieldnames)
        if missing:
            raise SystemExit(f"SSOT missing columns: {sorted(missing)}")

        for row in reader:
            handle = (row.get("Handle") or "").strip()
            if not handle:
                continue

            p = products.get(handle)
            if p is None:
                p = Product(handle=handle)
                products[handle] = p

            if (row.get("Title") or "").strip():
                p.title = row["Title"].strip()
            if (row.get("Body (HTML)") or "").strip():
                p.body = row["Body (HTML)"]
            if (row.get("Vendor") or "").strip():
                p.vendor = row["Vendor"].strip()
            if (row.get("Tags") or "").strip():
                p.tags = row["Tags"].strip()
            if (row.get("Status") or "").strip():
                p.status = row["Status"].strip()
            if (row.get("Product Category") or "").strip():
                p.category = row["Product Category"].strip()

            img = (row.get("Image Src") or "").strip()
            if img and img not in p.images:
                p.images.append(img)

            sku = (row.get("Variant SKU") or "").strip()
            price = (row.get("Variant Price") or "").strip()
            if not sku or not price:
                continue

            variants.append(row)

    return products, variants


def build_rows(
    products: dict[str, Product], variants: list[dict[str, str]]
) -> tuple[list[dict[str, str]], dict[str, int], list[str]]:
    out: list[dict[str, str]] = []
    skipped = {
        "noTitle": 0,
        "noImage": 0,
        "badPrice": 0,
        "notActive": 0,
        "notKazka": 0,
        "orphan": 0,
    }
    errors: list[str] = []

    for row in variants:
        handle = (row.get("Handle") or "").strip()
        sku = (row.get("Variant SKU") or "").strip()
        p = products.get(handle)
        if p is None:
            skipped["orphan"] += 1
            errors.append(f"orphan sku={sku} handle={handle}")
            continue
        if not is_kazka(p):
            skipped["notKazka"] += 1
            continue
        if p.status and p.status.lower() != "active":
            skipped["notActive"] += 1
            continue
        if not p.title:
            skipped["noTitle"] += 1
            continue
        image = (row.get("Variant Image") or "").strip() or (p.images[0] if p.images else "")
        if not image:
            skipped["noImage"] += 1
            continue
        price = format_price(row.get("Variant Price") or "")
        if not price:
            skipped["badPrice"] += 1
            continue

        material, size, pattern = map_options(row)
        desc = strip_html(p.body)[:5000] or p.title
        out.append(
            {
                "id": sku,
                "title": title_with_options(p.title, row),
                "description": desc,
                "availability": availability(row.get("Variant Inventory Qty") or ""),
                "condition": "new",
                "price": price,
                "link": f"{STOREFRONT_BASE}/products/{handle}",
                "image_link": image,
                "brand": BRAND,
                "item_group_id": handle,
                "mpn": sku,
                "material": material,
                "size": size,
                "pattern": pattern,
                "google_product_category": p.category or "",
            }
        )

    return out, skipped, errors


def validate(rows: list[dict[str, str]]) -> dict:
    issues: list[str] = []
    ids: set[str] = set()
    groups = {r["item_group_id"] for r in rows}

    for r in rows:
        rid = r["id"]
        if not rid:
            issues.append("empty id")
            continue
        if rid in ids:
            issues.append(f"duplicate id: {rid}")
        ids.add(rid)
        if rid == r["item_group_id"]:
            issues.append(f"id equals item_group_id: {rid}")
        if rid in groups:
            issues.append(f"id collides with item_group_id: {rid}")
        if len(rid) > 100:
            issues.append(f"id >100 chars: {rid}")
        for key in ("title", "description", "availability", "condition", "price", "link", "image_link", "brand"):
            if not r.get(key):
                issues.append(f"missing {key} for {rid}")
        if not r["link"].startswith("https://"):
            issues.append(f"bad link {rid}")
        if not r["image_link"].startswith("https://"):
            issues.append(f"bad image {rid}")
        if not re.match(r"^\d+\.\d{2} PLN$", r["price"]):
            issues.append(f"bad price format {rid}: {r['price']}")

    return {
        "issueCount": len(issues),
        "issues": issues[:50],
        "uniqueIds": len(ids),
        "uniqueGroups": len(groups),
    }


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=META_COLUMNS,
            quoting=csv.QUOTE_MINIMAL,
            lineterminator="\n",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow({c: row.get(c, "") for c in META_COLUMNS})


def main() -> int:
    ap = argparse.ArgumentParser(description="Kazka SSOT → Meta catalog CSV")
    ap.add_argument("--from", dest="ssot", type=Path, default=DEFAULT_SSOT)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.ssot.is_file():
        print(f"SSOT missing: {args.ssot}", file=sys.stderr)
        return 1

    print(f"[kazka-meta-catalog] SSOT={args.ssot}")
    products, variants = load_ssot(args.ssot)
    print(f"[kazka-meta-catalog] products={len(products)} variantRows={len(variants)}")

    rows, skipped, errors = build_rows(products, variants)
    validation = validate(rows)

    report = {
        "ssot": str(args.ssot),
        "products": len(products),
        "variantRowsInSsot": len(variants),
        "metaRows": len(rows),
        "skipped": skipped,
        "orphanErrors": len(errors),
        "orphanSamples": errors[:5],
        "validation": validation,
        "sample": rows[:2],
    }
    report_path = args.out.with_suffix(".report.json")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[kazka-meta-catalog] report -> {report_path}")
    print(f"[kazka-meta-catalog] metaRows={len(rows)} skipped={skipped}")
    print(
        f"[kazka-meta-catalog] validation issues={validation['issueCount']} "
        f"uniqueIds={validation['uniqueIds']} groups={validation['uniqueGroups']}"
    )

    if validation["issueCount"] > 0:
        print("VALIDATION FAILED:", validation["issues"], file=sys.stderr)
        return 1

    if args.dry_run:
        print("[kazka-meta-catalog] dry-run sample:", json.dumps(rows[0], ensure_ascii=False))
        return 0

    write_csv(args.out, rows)
    print(f"[kazka-meta-catalog] wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
