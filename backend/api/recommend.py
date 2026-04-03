# recommend.py — CodeHab API endpoint
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Optional
import json, os
from datetime import datetime

from ..engine.rules import apply_rules
from ..engine.scoring import rank_candidates
from ..engine.selector import select_best, get_fallback_message
from ..engine.explain import generate_explanation
from ..engine.constants import ENERGY_LEVELS, TIME_SLOTS

router = APIRouter()

# ── Load problem bank once at startup ─────────────────────────────────────────
_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "neetcode150.json")

def _load_problems():
    with open(_DATA_PATH, "r") as f:
        return json.load(f)["problems"]

PROBLEMS = _load_problems()


# ── Request / Response models ──────────────────────────────────────────────────

class RecommendRequest(BaseModel):
    energy: str = Field(..., description="User energy level: low | medium | high")
    time_available: int = Field(..., ge=5, le=240, description="Minutes available for practice")
    streak: int = Field(0, ge=0, description="Current day streak")
    productivity: str = Field("medium", description="Productivity level: low | medium | high")
    completed: Dict[str, str] = Field(
        default_factory=dict,
        description='Map of problem_id -> "YYYY-MM-DD" when completed'
    )

class ScoreFactor(BaseModel):
    label: str
    description: str
    score: float
    pct: str

class RecommendResponse(BaseModel):
    problem_id: Optional[str]
    title: Optional[str]
    topic: Optional[str]
    difficulty: Optional[str]
    estimated_time: Optional[int]
    url: Optional[str]
    tags: Optional[list]
    mode: str
    overall_score: float
    headline: str
    reason: str
    score_factors: list
    tips: str
    fallback_message: Optional[str] = None


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/recommend", response_model=RecommendResponse)
def recommend(req: RecommendRequest):
    # Validate inputs
    if req.energy not in ENERGY_LEVELS:
        raise HTTPException(status_code=422, detail=f"energy must be one of {ENERGY_LEVELS}")
    if req.productivity not in ENERGY_LEVELS:
        raise HTTPException(status_code=422, detail=f"productivity must be one of {ENERGY_LEVELS}")

    user_state = {
        "energy": req.energy,
        "time_available": req.time_available,
        "streak": req.streak,
        "productivity": req.productivity,
    }

    # 1. Apply rule-based filtering
    rule_result = apply_rules(
        all_problems=PROBLEMS,
        energy=req.energy,
        time_available=req.time_available,
        completed=req.completed,
        today=datetime.today(),
    )

    mode = rule_result["mode"]
    candidates = rule_result["candidates"]
    next_topic = rule_result["next_topic"]

    # 2. Score and rank candidates
    if candidates:
        ranked = rank_candidates(
            candidates=candidates,
            energy=req.energy,
            time_available=req.time_available,
            streak=req.streak,
            productivity=req.productivity,
        )
    else:
        ranked = []

    # 3. Select best
    selected = select_best(ranked, mode, next_topic)

    # 4. Generate explanation
    explanation = generate_explanation(
        problem=selected,
        mode=mode,
        user_state=user_state,
        next_topic=next_topic,
    )

    # 5. Build response
    if selected is None:
        return RecommendResponse(
            problem_id=None,
            title=None,
            topic=None,
            difficulty=None,
            estimated_time=None,
            url=None,
            tags=None,
            mode=mode,
            overall_score=0.0,
            headline="No suitable problem found",
            reason=explanation["reason"],
            score_factors=[],
            tips=explanation["tips"],
            fallback_message=get_fallback_message(next_topic),
        )

    return RecommendResponse(
        problem_id=selected["id"],
        title=selected["title"],
        topic=selected["topic"],
        difficulty=selected["difficulty"],
        estimated_time=selected["estimated_time"],
        url=selected["url"],
        tags=selected.get("tags", []),
        mode=mode,
        overall_score=explanation["overall_score"],
        headline=explanation["headline"],
        reason=explanation["reason"],
        score_factors=explanation["score_factors"],
        tips=explanation["tips"],
    )