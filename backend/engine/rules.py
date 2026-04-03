# rules.py — CodeHab filtering logic
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from .constants import (
    ENERGY_TO_MAX_DIFFICULTY,
    REVISION_GAP_DAYS,
    MODE_FRESH,
    MODE_REVISION,
    MODE_NEXT_TOPIC,
    TOPIC_ORDER,
)


def get_allowed_difficulties(energy: str) -> List[str]:
    """Return allowed difficulty levels for the given energy level."""
    return ENERGY_TO_MAX_DIFFICULTY.get(energy, ["Easy"])


def filter_by_time(problems: List[Dict], time_available: int) -> List[Dict]:
    """Keep only problems that fit within the user's available time."""
    return [p for p in problems if p["estimated_time"] <= time_available]


def filter_by_energy(problems: List[Dict], energy: str) -> List[Dict]:
    """Keep only problems the user has energy for."""
    allowed = get_allowed_difficulties(energy)
    return [p for p in problems if p["difficulty"] in allowed]


def split_fresh_and_completed(
    problems: List[Dict],
    completed: Dict[str, str],  # {problem_id: "YYYY-MM-DD"}
) -> tuple[List[Dict], List[Dict]]:
    """
    Split problem list into never-done (fresh) and already-completed.
    Returns (fresh_problems, completed_problems).
    """
    fresh, done = [], []
    for p in problems:
        if p["id"] in completed:
            done.append({**p, "_completed_date": completed[p["id"]]})
        else:
            fresh.append(p)
    return fresh, done


def filter_revision_candidates(
    completed_problems: List[Dict],
    today: Optional[datetime] = None,
    gap_days: int = REVISION_GAP_DAYS,
) -> List[Dict]:
    """
    From completed problems, return those solved more than `gap_days` ago.
    These are eligible for revision.
    """
    if today is None:
        today = datetime.today()
    threshold = today - timedelta(days=gap_days)

    candidates = []
    for p in completed_problems:
        raw = p.get("_completed_date")
        if not raw:
            continue
        try:
            solved_on = datetime.strptime(raw, "%Y-%m-%d")
        except ValueError:
            continue
        if solved_on <= threshold:
            candidates.append(p)
    return candidates


def get_next_topic(completed: Dict[str, str], all_problems: List[Dict]) -> Optional[str]:
    """
    Walk TOPIC_ORDER and return the first topic where the user has NOT
    completed every problem in that topic.
    """
    completed_ids = set(completed.keys())
    topic_problem_map: Dict[str, List[str]] = {}
    for p in all_problems:
        topic_problem_map.setdefault(p["topic"], []).append(p["id"])

    for topic in TOPIC_ORDER:
        ids_in_topic = topic_problem_map.get(topic, [])
        if not ids_in_topic:
            continue
        if not all(pid in completed_ids for pid in ids_in_topic):
            return topic
    return None  # All topics fully completed — legendary status


def apply_rules(
    all_problems: List[Dict],
    energy: str,
    time_available: int,
    completed: Dict[str, str],
    today: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Master rule pipeline. Returns:
    {
        "mode": MODE_FRESH | MODE_REVISION | MODE_NEXT_TOPIC,
        "candidates": [list of problem dicts],
        "next_topic": str | None,  (used in MODE_NEXT_TOPIC)
    }
    """
    if today is None:
        today = datetime.today()

    # Step 1: Apply energy and time filters to ALL problems
    energy_filtered = filter_by_energy(all_problems, energy)
    time_filtered = filter_by_time(energy_filtered, time_available)

    # Step 2: Split into fresh and completed subsets
    fresh, done = split_fresh_and_completed(time_filtered, completed)

    # Step 3: Fresh problems exist → MODE_FRESH
    if fresh:
        return {"mode": MODE_FRESH, "candidates": fresh, "next_topic": None}

    # Step 4: No fresh matches. Check for revision candidates
    revision = filter_revision_candidates(done, today=today)
    if revision:
        return {"mode": MODE_REVISION, "candidates": revision, "next_topic": None}

    # Step 5: No revision candidates either. Suggest next topic
    next_topic = get_next_topic(completed, all_problems)
    # Get easiest unsolved problem in next topic regardless of filters
    next_topic_problems = [
        p for p in all_problems
        if p["topic"] == next_topic and p["id"] not in completed
    ] if next_topic else []

    return {
        "mode": MODE_NEXT_TOPIC,
        "candidates": next_topic_problems,
        "next_topic": next_topic,
    }