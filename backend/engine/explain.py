# explain.py — CodeHab explanation generator
from typing import Dict, Any, Optional
from .constants import MODE_FRESH, MODE_REVISION, MODE_NEXT_TOPIC


def generate_explanation(
    problem: Optional[Dict],
    mode: str,
    user_state: Dict[str, Any],
    next_topic: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Return a structured explanation dict:
    {
        "headline": str,        # One-line summary
        "reason": str,          # Paragraph explaining why this problem was chosen
        "score_factors": [...], # List of score factor explanations
        "tips": str,            # Practical tip for the session
    }
    """
    if problem is None:
        return {
            "headline": "No suitable problem found",
            "reason": (
                f"We couldn't find a problem matching your current energy "
                f"({user_state.get('energy')}) and time ({user_state.get('time_available')} min). "
                f"Try increasing your available time or energy level."
            ),
            "score_factors": [],
            "tips": "Even 15 minutes of review is better than nothing. Try lowering the filters.",
        }

    energy = user_state.get("energy", "medium")
    time_av = user_state.get("time_available", 30)
    streak = user_state.get("streak", 0)
    productivity = user_state.get("productivity", "medium")
    score = problem.get("_score", 0)
    breakdown = problem.get("_score_breakdown", {})

    # ── Headline ──────────────────────────────────────────────────────────────
    if mode == MODE_FRESH:
        headline = f"Fresh challenge — {problem['difficulty']} · {problem['topic']}"
    elif mode == MODE_REVISION:
        headline = f"Revision time — you solved this 30+ days ago"
    else:
        headline = f"New territory — stepping into {next_topic or problem['topic']}"

    # ── Main reason ───────────────────────────────────────────────────────────
    if mode == MODE_FRESH:
        reason = (
            f"**{problem['title']}** is a fresh {problem['difficulty'].lower()} problem "
            f"from {problem['topic']} that you haven't solved yet. "
            f"At {problem['estimated_time']} minutes it fits your {time_av}-minute window, "
            f"and the difficulty matches your {energy} energy level right now."
        )
        if streak >= 3:
            reason += f" Your {streak}-day streak shows you're in a rhythm — keep it going!"
    elif mode == MODE_REVISION:
        reason = (
            f"**{problem['title']}** was solved over 30 days ago, making it a strong "
            f"revision candidate. Spaced repetition at this interval reinforces long-term memory. "
            f"It's {problem['difficulty'].lower()}, takes about {problem['estimated_time']} minutes, "
            f"and fits your current {energy} energy level perfectly."
        )
    else:
        reason = (
            f"You've completed all available problems matching your current filters. "
            f"**{problem['title']}** is the gentlest entry point into "
            f"**{next_topic or problem['topic']}**, the next topic in the NeetCode roadmap. "
            f"Starting with an {problem['difficulty'].lower()} problem here builds "
            f"the mental model for harder problems to follow."
        )

    # ── Score factor bullets ───────────────────────────────────────────────────
    def pct(val: float) -> str:
        return f"{round(val * 100)}%"

    score_factors = []
    if breakdown:
        factor_labels = {
            "energy_match":     ("⚡ Energy match",     "How well the problem's difficulty suits your energy level"),
            "time_fit":         ("⏱ Time fit",          "How well the problem fits your available time"),
            "streak_bonus":     ("🔥 Streak bonus",      "Difficulty preference based on your current streak"),
            "topic_priority":   ("📚 Topic priority",    "Earlier topics in the roadmap score higher"),
            "productivity_fit": ("🧠 Productivity fit",  "Complexity matches your stated productivity level"),
        }
        for key, (label, desc) in factor_labels.items():
            val = breakdown.get(key, 0)
            score_factors.append({
                "label": label,
                "description": desc,
                "score": round(val, 2),
                "pct": pct(val),
            })

    # ── Tips ──────────────────────────────────────────────────────────────────
    tip_map = {
        ("low", "fresh"):     "Low energy today? Skim the problem, write pseudocode, then code. No pressure.",
        ("medium", "fresh"):  "Medium energy — aim to solve it within the time limit. Try without hints first.",
        ("high", "fresh"):    "High energy! Challenge yourself: solve it optimally, then explain it aloud.",
        ("low", "revision"):  "Light revision session: re-read your old solution, then trace through it manually.",
        ("medium", "revision"): "Revision: try to re-solve from scratch before checking your old solution.",
        ("high", "revision"): "Strong energy on a revision? Try to beat your previous time complexity!",
    }
    tip_key = (energy, "revision" if mode == MODE_REVISION else "fresh")
    tips = tip_map.get(tip_key, "Focus, trust the process, and write clean code.")

    return {
        "headline": headline,
        "reason": reason,
        "score_factors": score_factors,
        "tips": tips,
        "overall_score": round(score, 2),
        "mode": mode,
    }