#!/usr/bin/env python3
import argparse
import re
import shutil
import sys
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent
ASSETS = SKILL_ROOT / "assets"


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise ValueError("name must contain a letter or number")
    return slug


def class_name(value):
    parts = re.findall(r"[A-Za-z0-9]+", value)
    result = "".join(part[:1].upper() + part[1:] for part in parts)
    if not result or result[0].isdigit():
        result = "Local" + result
    return result


def render_tree(source, destination, replacements):
    if destination.exists():
        raise FileExistsError(f"refusing to overwrite {destination}")
    destination.mkdir(parents=True)
    for source_path in source.rglob("*"):
        relative = source_path.relative_to(source)
        if "__pycache__" in relative.parts or source_path.suffix == ".pyc":
            continue
        target = destination / relative
        if source_path.is_dir():
            target.mkdir(exist_ok=True)
            continue
        text = source_path.read_text(encoding="utf-8")
        for key, value in replacements.items():
            text = text.replace(key, value)
        target.write_text(text, encoding="utf-8")


def copy_client(source_name, destination, replacements):
    if destination.exists():
        raise FileExistsError(f"refusing to overwrite {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    text = (ASSETS / "clients" / source_name).read_text(encoding="utf-8")
    for key, value in replacements.items():
        text = text.replace(key, value)
    destination.write_text(text, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description="Scaffold an OpenHome Local Ability and local app clients."
    )
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument(
        "--client",
        choices=("web", "mac", "both"),
        default="both",
    )
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    project = args.project.expanduser().resolve()
    if not project.is_dir():
        parser.error(f"project does not exist: {project}")
    if not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")

    slug = slugify(args.name)
    replacements = {
        "__BRIDGE_NAME__": args.name.strip(),
        "__BRIDGE_SLUG__": slug.replace("-", "_"),
        "__BRIDGE_CLASS__": class_name(args.name),
        "__BRIDGE_PORT__": str(args.port),
    }

    ability = project / "openhome" / f"{slug}-bridge"
    client_root = project / "integrations" / "openhome"
    planned = [ability]
    if args.client in {"web", "both"}:
        planned.append(client_root / "openhomeBridge.ts")
    if args.client in {"mac", "both"}:
        planned.append(client_root / "OpenHomeBridgeClient.swift")
    existing = [path for path in planned if path.exists()]
    if existing:
        for path in existing:
            print(f"refusing to overwrite {path}", file=sys.stderr)
        return 2

    try:
        render_tree(ASSETS / "ability", ability, replacements)
        if args.client in {"web", "both"}:
            copy_client(
                "openhomeBridge.ts",
                client_root / "openhomeBridge.ts",
                replacements,
            )
        if args.client in {"mac", "both"}:
            copy_client(
                "OpenHomeBridgeClient.swift",
                client_root / "OpenHomeBridgeClient.swift",
                replacements,
            )
    except Exception:
        if ability.exists():
            shutil.rmtree(ability)
        raise

    print(f"ability={ability}")
    if args.client in {"web", "both"}:
        print(f"web_client={client_root / 'openhomeBridge.ts'}")
    if args.client in {"mac", "both"}:
        print(f"mac_client={client_root / 'OpenHomeBridgeClient.swift'}")
    print("next=adapt handle_event, configure runtime secrets, then package")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
