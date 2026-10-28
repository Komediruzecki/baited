#!/usr/bin/env python3
"""Offline, single-container planning estimate; never queries or changes an account.

Prices checked 2026-10-28. Sources:
https://developers.cloudflare.com/containers/platform/pricing/
https://developers.cloudflare.com/r2/pricing/

CPU is average vCPU actually consumed, not a percentage of the selected tier.
Allowances belong to the account. The default is an explicitly hypothetical
fully unused allowance; pass measured remaining allowances for an existing one.
"""

import argparse
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
import json


D = Decimal
TIERS = {
    "basic": {"vcpu": D("0.25"), "memory_gib": D("1"), "disk_gb": D("4")},
    "standard-1": {"vcpu": D("0.5"), "memory_gib": D("4"), "disk_gb": D("8")},
}
ALLOWANCES = {
    "memory_gib_hours": D("25"),
    "cpu_vcpu_minutes": D("375"),
    "disk_gb_hours": D("200"),
    "egress_na_eu_gb": D("1000"),
    "egress_oceania_korea_taiwan_gb": D("500"),
    "egress_other_gb": D("500"),
    "r2_gb_months": D("10"),
    "r2_class_a": D("1000000"),
    "r2_class_b": D("10000000"),
}
EXCLUSIONS = [
    "Workers requests and CPU overages",
    "Durable Objects requests, duration, and storage overages",
    "logs/observability, builds/registry and other metered products",
    "other account workloads, taxes/VAT, currency conversion and custom contracts",
]


def nonnegative(value):
    try:
        number = D(value)
    except InvalidOperation:
        raise argparse.ArgumentTypeError("must be a finite nonnegative number") from None
    if not number.is_finite() or number < 0:
        raise argparse.ArgumentTypeError("must be a finite nonnegative number")
    return number


def count(value):
    number = nonnegative(value)
    if number != number.to_integral_value():
        raise argparse.ArgumentTypeError("must be a whole number of operations")
    return number


def excess(usage, remaining):
    return max(D("0"), usage - remaining)


def rounded_units(usage, remaining, unit):
    return (excess(usage, remaining) / unit).to_integral_value(rounding=ROUND_CEILING)


def money(amount):
    return format(amount.quantize(D("0.01"), rounding=ROUND_HALF_UP), ".2f")


def parser():
    result = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    result.add_argument("--tier", choices=TIERS, default="basic")
    result.add_argument("--hours", type=nonnegative, default=D("730"),
                        help="running hours within one monthly billing period (default: 730)")
    result.add_argument("--average-vcpu", type=nonnegative, default=D("0"),
                        help="actual average vCPU usage: 0..0.25 basic, 0..0.5 standard-1 (default: 0)")
    result.add_argument("--existing-paid-account", action="store_true",
                        help="exclude the already-paid $5 account base from this project estimate")
    result.add_argument("--allowances", choices=("full", "none"), default="full",
                        help="starting remaining account allowances; full is an unverified scenario (default: full)")
    for name in ALLOWANCES:
        result.add_argument("--remaining-" + name.replace("_", "-"), type=count if name in ("r2_class_a", "r2_class_b") else nonnegative,
                            help="override remaining monthly account allowance for " + name.replace("_", " "))
    for name in ("egress_na_eu_gb", "egress_oceania_korea_taiwan_gb", "egress_other_gb", "r2_gb_months"):
        result.add_argument("--" + name.replace("_", "-"), type=nonnegative, default=D("0"),
                            help="project usage in this period (default: 0)")
    for name in ("r2_class_a", "r2_class_b"):
        result.add_argument("--" + name.replace("_", "-"), type=count, default=D("0"),
                            help="project operation count in this period (default: 0)")
    result.add_argument("--budget-usd", type=nonnegative, default=D("30"),
                        help="comparison target only; does not enforce a spending cap (default: 30)")
    result.add_argument("--json", action="store_true", help="emit machine-readable decimal strings")
    return result


def estimate(args):
    tier = TIERS[args.tier]
    remaining = {}
    for name, included in ALLOWANCES.items():
        override = getattr(args, "remaining_" + name)
        remaining[name] = override if override is not None else included if args.allowances == "full" else D("0")
    usage = {
        "memory_gib_hours": args.hours * tier["memory_gib"],
        "cpu_vcpu_minutes": args.hours * 60 * args.average_vcpu,
        "disk_gb_hours": args.hours * tier["disk_gb"],
    }
    usage.update({name: getattr(args, name) for name in ALLOWANCES if name not in usage})
    costs = {
        "account_base": D("0") if args.existing_paid_account else D("5"),
        "container_memory": excess(usage["memory_gib_hours"], remaining["memory_gib_hours"]) * 3600 * D("0.0000025"),
        "container_cpu": excess(usage["cpu_vcpu_minutes"], remaining["cpu_vcpu_minutes"]) * 60 * D("0.000020"),
        "container_disk": excess(usage["disk_gb_hours"], remaining["disk_gb_hours"]) * 3600 * D("0.00000007"),
    }
    for name, rate in (("egress_na_eu_gb", "0.025"), ("egress_oceania_korea_taiwan_gb", "0.05"), ("egress_other_gb", "0.04")):
        costs[name] = excess(usage[name], remaining[name]) * D(rate)
    for name, unit, rate in (("r2_gb_months", "1", "0.015"), ("r2_class_a", "1000000", "4.50"), ("r2_class_b", "1000000", "0.36")):
        costs[name] = rounded_units(usage[name], remaining[name], D(unit)) * D(rate)
    total = sum(costs.values(), D("0"))
    return {
        "prices_checked": "2026-10-28",
        "scope": "modeled project increment" if args.existing_paid_account else "modeled project plus new paid-account base",
        "tier": args.tier,
        "running_hours": args.hours,
        "average_vcpu": args.average_vcpu,
        "existing_paid_account": args.existing_paid_account,
        "allowance_baseline": args.allowances,
        "remaining_account_allowances": remaining,
        "project_usage": usage,
        "components_usd": costs,
        "modeled_total_usd": total,
        "modeled_total_usd_rounded": money(total),
        "budget_usd": args.budget_usd,
        "modeled_total_exceeds_budget": total > args.budget_usd,
        "excluded": EXCLUSIONS,
        "notes": [
            "Estimate only, not an invoice or a spending cap; no account state was inspected.",
            "Full allowances assume no other account workloads consumed them; overrides apply individually.",
            "Existing-paid-account excludes the shared base only; it does not imply unused allowances.",
            "R2 Standard excess rounds up to GB-month and million-operation units; account aggregation may change the incremental charge.",
            "Container egress uses decimal GB (1 TB = 1000 GB); R2 free egress does not remove container egress charges.",
            "Hours are running time, not audience time; autosleep savings require a verified lifecycle policy.",
        ],
    }


def main():
    cli = parser()
    args = cli.parse_args()
    if args.average_vcpu > TIERS[args.tier]["vcpu"]:
        cli.error("--average-vcpu exceeds the selected tier's vCPU capacity")
    if args.hours > 744:
        cli.error("--hours must fit one monthly billing period (at most 744 hours)")
    for name, maximum in ALLOWANCES.items():
        override = getattr(args, "remaining_" + name)
        if override is not None and override > maximum:
            cli.error("--remaining-" + name.replace("_", "-") + " exceeds the standard monthly included allowance")
    result = estimate(args)
    if args.json:
        print(json.dumps(result, indent=2, default=str))
        return
    print("Cloudflare planning estimate — USD before tax; prices checked " + result["prices_checked"])
    print(f"One {args.tier} container, {args.hours} running hours, {args.average_vcpu} average vCPU")
    print("Scope: " + result["scope"])
    print("Remaining account allowances (scenario, not a live account reading):")
    for name, amount in result["remaining_account_allowances"].items():
        print(f"  {name}: {amount}")
    print("Modeled charges:")
    for name, amount in result["components_usd"].items():
        print(f"  {name}: ${money(amount)}")
    print("Modeled total: $" + result["modeled_total_usd_rounded"])
    print(f"Planning target: ${money(args.budget_usd)} (not a cap; excluded charges can exceed it)")
    if result["modeled_total_exceeds_budget"]:
        print("The modeled components alone exceed the planning target.")
    print("Excluded: " + "; ".join(EXCLUSIONS) + ".")
    for note in result["notes"]:
        print("Note: " + note)


if __name__ == "__main__":
    main()
