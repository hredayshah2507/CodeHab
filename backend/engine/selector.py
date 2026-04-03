# selector.py — CodeHab final selection logic
from typing import List, Dict, Any, Optional
from .constants import MODE_NEXT_TOPIC, TOPIC_ORDER


def select_best(
    ranked: List[Dict],
    mode: str,
    next_topic: Optional[str] = None,
) -> Optional[Dict]:
    """
    Pick the single best recommendation from a ranked list.

    Strategy:
    - MODE_FRESH / MODE_REVISION: top-scored problem wins.
    - MODE_NEXT_TOPIC: pick the easiest (lowest difficulty) problem
      in the next topic to give the user a gentle entry point.
    """
    if not ranked:
        return None

    if mode == MODE_NEXT_TOPIC:
        # Sort by difficulty rank ascending so user starts with Easy
        difficulty_rank = {"Easy": 1, "Medium": 2, "Hard": 3}
        return sorted(ranked, key=lambda p: difficulty_rank.get(p["difficulty"], 2))[0]

    # Default: highest score wins
    return ranked[0]


def get_fallback_message(next_topic: Optional[str]) -> str:
    """Generate a fallback message when no candidates exist at all."""
    if next_topic:
        return (
            f"No problems match your current constraints. "
            f"Consider starting '{next_topic}' — it's next in the learning sequence."
        )
    return (
        "You've completed all problems! Consider revisiting hard problems "
        "or increasing your time/energy level."
    )