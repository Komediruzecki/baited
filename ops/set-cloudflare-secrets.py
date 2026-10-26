"""Copy resolved Proton environment values to this repository's GitHub secrets.

Run through pass-cli using cloudflare.env.tmpl. Values never enter arguments,
files or output; gh receives each value on stdin. This does not enable deploys.
"""

import os
import re
import subprocess

REPOSITORY = "Komediruzecki/baited"
FIELDS = ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")


def main():
    values = {field: os.environ.get(field, "").strip() for field in FIELDS}
    if any(not value or value.startswith("pass://") for value in values.values()):
        raise SystemExit("Both Cloudflare fields must be resolved by Proton Pass.")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", values["CLOUDFLARE_ACCOUNT_ID"]):
        raise SystemExit("Cloudflare account field has an unexpected format.")
    for field in FIELDS:
        result = subprocess.run(
            ["gh", "secret", "set", field, "--repo", REPOSITORY],
            input=values[field],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode:
            raise SystemExit(f"Could not set {field}; gh exited {result.returncode}.")
        print(f"Set {field} in {REPOSITORY}.")


if __name__ == "__main__":
    main()
