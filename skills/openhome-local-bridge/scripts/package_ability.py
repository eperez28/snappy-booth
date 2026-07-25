#!/usr/bin/env python3
import argparse
import re
import zipfile
from pathlib import Path


REQUIRED = {
    "__init__.py",
    "background.py",
    "devkit_functions.py",
    "main.py",
    "requirements.txt",
}
SKIP_PARTS = {"__pycache__", ".git", ".DS_Store"}
SECRET_PATTERN = re.compile(
    r"(sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}"
    r"|gh[pousr]_[A-Za-z0-9]{30,}"
    r"|github_pat_[A-Za-z0-9_]{40,}"
    r"|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)"
)
PLACEHOLDER_PATTERN = re.compile(r"__[A-Z][A-Z0-9_]+__")


def safe_files(ability):
    for path in sorted(ability.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(ability)
        if any(part in SKIP_PARTS for part in relative.parts):
            continue
        if path.name == ".env" or path.name.startswith(".env."):
            raise ValueError(f"environment file is not package-safe: {relative}")
        if path.suffix in {".pyc", ".pem", ".key", ".p12"}:
            raise ValueError(f"sensitive or generated file is not package-safe: {relative}")
        if path.suffix in {".py", ".ts", ".swift", ".md", ".txt"} or path.name == "requirements.txt":
            text = path.read_text(encoding="utf-8")
            if SECRET_PATTERN.search(text):
                raise ValueError(f"key-shaped value found in {relative}")
            if PLACEHOLDER_PATTERN.search(text):
                raise ValueError(f"unresolved template placeholder found in {relative}")
        yield path, relative


def main():
    parser = argparse.ArgumentParser(
        description="Validate and package an OpenHome Local Ability."
    )
    parser.add_argument("ability", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()

    ability = args.ability.expanduser().resolve()
    if not ability.is_dir():
        parser.error(f"ability does not exist: {ability}")
    missing = sorted(REQUIRED - {path.name for path in ability.iterdir()})
    if missing:
        parser.error("missing required files: " + ", ".join(missing))

    output = (
        args.output.expanduser().resolve()
        if args.output
        else ability.parent / f"{ability.name}.zip"
    )
    if output.exists() and not args.replace:
        parser.error(f"output exists; pass --replace to replace it: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)

    files = list(safe_files(ability))
    mode = "w"
    with zipfile.ZipFile(output, mode, zipfile.ZIP_DEFLATED) as archive:
        for path, relative in files:
            archive.write(path, Path(ability.name) / relative)

    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
