"""Elo updates for pairwise model comparison."""

INITIAL_RATING = 1200
K_FACTOR = 32


def expected_score(r_a: float, r_b: float) -> float:
    return 1 / (1 + 10 ** ((r_b - r_a) / 400))


def update_elo_pair(
    r_a: float, r_b: float, outcome_a: float
) -> tuple[float, float]:
    """outcome_a: 1.0 player A wins, 0.5 draw, 0.0 player A loses."""
    ea = expected_score(r_a, r_b)
    eb = expected_score(r_b, r_a)
    r_new_a = r_a + K_FACTOR * (outcome_a - ea)
    r_new_b = r_b + K_FACTOR * ((1 - outcome_a) - eb)
    return round(r_new_a, 2), round(r_new_b, 2)
