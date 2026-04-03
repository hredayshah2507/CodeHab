# scoring.py — CodeHab weighted scoring system
from typing import List, Dict, Any
from .constants import (
    SCORE_WEIGHTS,
    ENERGY_LEVELS,
    PRODUCTIVITY_TO_COMPLEXITY,
    TOPIC_ORDER,
    MODE_FRESH,
    MODE_REVISION,
)

# Difficulty → numeric for sorting
DIFFICULTY_RANK = {"Easy": 1, "Medium": 2, "Hard": 3}


def _score_energy_match(problem: Dict, energy: str) -> float:
    """
    Full score if energy_required exactly matches user energy.
    Partial if it's one step lower (easy problems for medium energy = fine).
    """
    req = problem.get("energy_required", "medium")
    user_idx = ENERGY_LEVELS.index(energy) if energy in ENERGY_LEVELS else 1
    prob_idx = ENERGY_LEVELS.index(req) if req in ENERGY_LEVELS else 1

    if user_idx == prob_idx:
        return 1.0
    elif prob_idx < user_idx:  # problem is easier than user can handle
        return 0.6
    else:  # problem is harder than user has energy for (shouldn't reach here after filter)
        return 0.0


def _score_time_fit(problem: Dict, time_available: int) -> float:
    """
    Score how well the problem fits the available time.
    Perfect fit (uses 80–100% of time) = 1.0.
    Uses less than 50% = lower score (too short for the session).
    """
    est = problem.get("estimated_time", 30)
    if est == 0:
        return 0.0
    ratio = est / time_available
    if 0.8 <= ratio <= 1.0:
        return 1.0
    elif 0.6 <= ratio < 0.8:
        return 0.75
    elif 0.5 <= ratio < 0.6:
        return 0.5
    elif ratio < 0.5:
        return 0.3
    else:
        return 0.0  # Over time limit (filtered out, but safety)


def _score_streak_bonus(problem: Dict, streak: int) -> float:
    """
    Higher streaks boost harder problems slightly (you're on a roll).
    Streak 0-2: prefer Easy/Medium.
    Streak 3-6: Medium/Hard OK.
    Streak 7+: full bonus for Hard.
    """
    difficulty = problem.get("difficulty", "Medium")
    rank = DIFFICULTY_RANK.get(difficulty, 2)

    if streak >= 7:
        return 1.0 if rank >= 2 else 0.7
    elif streak >= 3:
        return 1.0 if rank <= 2 else 0.6
    else:
        return 1.0 if rank == 1 else (0.7 if rank == 2 else 0.4)


def _score_topic_priority(problem: Dict) -> float:
    """
    Problems from earlier topics in the learning sequence score higher.
    This nudges users to finish foundational topics first.
    """
    topic = problem.get("topic", "")
    if topic in TOPIC_ORDER:
        idx = TOPIC_ORDER.index(topic)
        # Normalize: first topic = 1.0, last = 0.1
        normalized = 1.0 - (idx / max(len(TOPIC_ORDER) - 1, 1)) * 0.9
        return round(normalized, 3)
    return 0.5


def _score_productivity_fit(problem: Dict, productivity: str) -> float:
    """
    Match problem complexity to productivity level.
    """
    preferred = PRODUCTIVITY_TO_COMPLEXITY.get(productivity, ["Easy", "Medium"])
    difficulty = problem.get("difficulty", "Medium")
    if difficulty in preferred:
        return 1.0
    # One step off = partial
    pref_ranks = [DIFFICULTY_RANK[d] for d in preferred]
    prob_rank = DIFFICULTY_RANK.get(difficulty, 2)
    min_diff = min(abs(prob_rank - r) for r in pref_ranks)
    return 1.0 - 0.3 * min_diff


def score_problem(
    problem: Dict,
    energy: str,
    time_available: int,
    streak: int,
    productivity: str,
) -> float:
    """
    Compute a composite score [0, 1] for a single problem given user state.
    """
    w = SCORE_WEIGHTS
    components = {
        "energy_match":     _score_energy_match(problem, energy),
        "time_fit":         _score_time_fit(problem, time_available),
        "streak_bonus":     _score_streak_bonus(problem, streak),
        "topic_priority":   _score_topic_priority(problem),
        "productivity_fit": _score_productivity_fit(problem, productivity),
    }
    total = sum(w[k] * v for k, v in components.items())
    return round(total, 4), components


def rank_candidates(
    candidates: List[Dict],
    energy: str,
    time_available: int,
    streak: int,
    productivity: str,
) -> List[Dict]:
    """
    Score all candidates and return them sorted by score descending.
    Each problem gets a '_score' and '_score_breakdown' field.
    """
    scored = []
    for p in candidates:
        total, breakdown = score_problem(p, energy, time_available, streak, productivity)
        scored.append({
            **p,
            "_score": total,
            "_score_breakdown": breakdown,
        })
    return sorted(scored, key=lambda x: x["_score"], reverse=True)