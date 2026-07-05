"""Add CloudFront origin + /api/aisyougi* behavior for AISyougi ECS API.

Usage:
  python infra/apply-cloudfront-aisyougi-api-behavior.py
  python infra/apply-cloudfront-aisyougi-api-behavior.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

DIST_ID = "E2PVD76VHGLFRI"
REGION = "us-east-1"
PATH_PATTERN = "/api/aisyougi*"
ORIGIN_ID = "aisyougi-ecs-origin"
ORIGIN_DOMAIN = "origin-aisyougi-ecs.ksystemapp.com"
ORIGIN_PORT = 80

CACHE_POLICY_ID = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
ORIGIN_REQUEST_POLICY_ID = "216adef6-5c7f-47e4-b989-5492eafa07d3"


def aws(*args: str) -> str:
    r = subprocess.run(["aws", *args, "--region", REGION], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr)
        sys.exit(r.returncode)
    return r.stdout


def ensure_origin(config: dict) -> bool:
    origins = config.setdefault("Origins", {"Quantity": 0, "Items": []})
    items = list(origins.get("Items") or [])

    for origin in items:
        if origin.get("Id") == ORIGIN_ID:
            cfg = origin.setdefault("CustomOriginConfig", {})
            if cfg.get("HTTPPort") != ORIGIN_PORT:
                cfg["HTTPPort"] = ORIGIN_PORT
                return True
            return False

    items.append(
        {
            "Id": ORIGIN_ID,
            "DomainName": ORIGIN_DOMAIN,
            "OriginPath": "",
            "CustomHeaders": {"Quantity": 0},
            "CustomOriginConfig": {
                "HTTPPort": ORIGIN_PORT,
                "HTTPSPort": 443,
                "OriginProtocolPolicy": "http-only",
                "OriginSslProtocols": {
                    "Quantity": 1,
                    "Items": ["TLSv1.2"],
                },
                "OriginReadTimeout": 60,
                "OriginKeepaliveTimeout": 5,
            },
            "ConnectionAttempts": 3,
            "ConnectionTimeout": 10,
            "OriginShield": {"Enabled": False},
            "OriginAccessControlId": "",
        }
    )
    origins["Items"] = items
    origins["Quantity"] = len(items)
    return True


def ensure_behavior(config: dict) -> bool:
    behaviors = config.setdefault("CacheBehaviors", {"Quantity": 0, "Items": []})
    items = list(behaviors.get("Items") or [])

    if any(b.get("PathPattern") == PATH_PATTERN for b in items):
        return False

    template = next((b for b in items if b.get("PathPattern") == "/api/kakeibo*"), None)
    if not template:
        print("Template behavior /api/kakeibo* not found", file=sys.stderr)
        sys.exit(1)

    new_behavior = json.loads(json.dumps(template))
    new_behavior["PathPattern"] = PATH_PATTERN
    new_behavior["TargetOriginId"] = ORIGIN_ID
    new_behavior["FunctionAssociations"] = {"Quantity": 0}
    new_behavior["LambdaFunctionAssociations"] = {"Quantity": 0}

    items.insert(0, new_behavior)
    behaviors["Items"] = items
    behaviors["Quantity"] = len(items)
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("== CloudFront: add /api/aisyougi* behavior ==")
    raw = json.loads(aws("cloudfront", "get-distribution-config", "--id", DIST_ID))
    etag = raw["ETag"]
    config = raw["DistributionConfig"]

    changed_origin = ensure_origin(config)
    changed_behavior = ensure_behavior(config)

    if not changed_origin and not changed_behavior:
        print("Origin and behavior already configured — skip")
        return

    snap_dir = Path(__file__).resolve().parent / ".snapshots"
    snap_dir.mkdir(exist_ok=True)
    snap_dir.joinpath(f"cloudfront-before-aisyougi-api-{DIST_ID}.json").write_text(
        json.dumps(config, indent=2), encoding="utf-8"
    )

    if args.dry_run:
        print(f"[DryRun] origin={ORIGIN_ID} behavior={PATH_PATTERN}")
        return

    update_path = Path(__file__).resolve().parent / "cf-aisyougi-api-update.json"
    update_path.write_text(json.dumps(config), encoding="utf-8")

    aws(
        "cloudfront",
        "update-distribution",
        "--id",
        DIST_ID,
        "--if-match",
        etag,
        "--distribution-config",
        f"file://{update_path.as_posix()}",
    )
    print("CloudFront update submitted (5-15 min propagation).")
    print("Verify: curl https://ksystemapp.com/api/aisyougi/health")


if __name__ == "__main__":
    main()
