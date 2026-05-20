"""Physical chip inventory for poker — fixed denominations, not amount-derived."""

from __future__ import annotations

from typing import Dict, List

# Denominations high → low (each player starts with this exact rack = 1000)
CHIP_DENOMS = [500, 100, 25, 5, 1]

# 32 chips per player: 1×500 + 2×100 + 8×25 + 10×5 + 50×1 = 1000
STARTING_RACK: Dict[str, int] = {
    "500": 1,
    "100": 2,
    "25": 8,
    "5": 10,
    "1": 50,
}

CHIPS_PER_PLAYER = sum(int(d) * c for d, c in STARTING_RACK.items())  # 1000
TOTAL_CHIPS_IN_PLAY = CHIPS_PER_PLAYER * 2  # heads-up


def empty_rack() -> Dict[str, int]:
    return {str(d): 0 for d in CHIP_DENOMS}


def copy_rack(rack: Dict[str, int]) -> Dict[str, int]:
    return {str(d): int(rack.get(str(d), 0)) for d in CHIP_DENOMS}


def rack_total(rack: Dict[str, int]) -> int:
    return sum(int(d) * int(rack.get(str(d), 0)) for d in CHIP_DENOMS)


def rack_chip_count(rack: Dict[str, int]) -> int:
    return sum(int(rack.get(str(d), 0)) for d in CHIP_DENOMS)


def make_starting_rack() -> Dict[str, int]:
    return copy_rack(STARTING_RACK)


def rack_to_list(rack: Dict[str, int]) -> List[int]:
    chips: List[int] = []
    for d in CHIP_DENOMS:
        chips.extend([d] * int(rack.get(str(d), 0)))
    return chips


def list_to_rack(chips: List[int]) -> Dict[str, int]:
    rack = empty_rack()
    for d in chips:
        if d in CHIP_DENOMS:
            rack[str(d)] += 1
    return rack


def merge_racks(dest: Dict[str, int], src: Dict[str, int]) -> None:
    for d in CHIP_DENOMS:
        key = str(d)
        dest[key] = int(dest.get(key, 0)) + int(src.get(key, 0))
        src[key] = 0


def chips_moved_breakdown(before: Dict[str, int], after: Dict[str, int]) -> Dict[str, int]:
    """Count chips removed from `before` rack (denom key → count)."""
    out: Dict[str, int] = {}
    for d in CHIP_DENOMS:
        key = str(d)
        n = int(before.get(key, 0)) - int(after.get(key, 0))
        if n > 0:
            out[key] = n
    return out


def transfer_chips(from_rack: Dict[str, int], to_rack: Dict[str, int], amount: int) -> int:
    """Move physical chips (largest first) up to `amount`. Returns value moved."""
    if amount <= 0:
        return 0
    moved = 0
    remaining = amount
    for d in CHIP_DENOMS:
        key = str(d)
        while remaining >= d and int(from_rack.get(key, 0)) > 0:
            from_rack[key] = int(from_rack[key]) - 1
            to_rack[key] = int(to_rack.get(key, 0)) + 1
            remaining -= d
            moved += d
    # Pay remainder with smallest available chips if needed
    if remaining > 0:
        for d in sorted(CHIP_DENOMS):
            key = str(d)
            while remaining > 0 and int(from_rack.get(key, 0)) > 0:
                from_rack[key] = int(from_rack[key]) - 1
                to_rack[key] = int(to_rack.get(key, 0)) + 1
                pay = min(d, remaining)
                remaining -= pay
                moved += pay
    return moved


def split_rack_between(rack_a: Dict[str, int], rack_b: Dict[str, int], source: Dict[str, int]) -> None:
    """Split all chips in source evenly between two racks (by chip count)."""
    chips = rack_to_list(source)
    for key in source:
        source[key] = 0
    half = len(chips) // 2
    for c in chips[:half]:
        rack_a[str(c)] = int(rack_a.get(str(c), 0)) + 1
    for c in chips[half:]:
        rack_b[str(c)] = int(rack_b.get(str(c), 0)) + 1
