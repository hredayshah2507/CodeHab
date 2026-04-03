# constants.py — CodeHab configuration

# Canonical topic learning sequence (matches NeetCode 150 roadmap)
TOPIC_ORDER = [
    "Arrays & Hashing",
    "Two Pointers",
    "Sliding Window",
    "Stack",
    "Binary Search",
    "Linked List",
    "Trees",
    "Tries",
    "Heap / Priority Queue",
    "Backtracking",
    "Graphs",
    "Advanced Graphs",
    "1-D Dynamic Programming",
    "2-D Dynamic Programming",
    "Greedy",
    "Intervals",
    "Math & Geometry",
    "Bit Manipulation",
]

# Energy level mapping
ENERGY_LEVELS = ["low", "medium", "high"]

# Energy level → max difficulty allowed
ENERGY_TO_MAX_DIFFICULTY = {
    "low": ["Easy"],
    "medium": ["Easy", "Medium"],
    "high": ["Easy", "Medium", "Hard"],
}

# Time slots (minutes) → max problem time allowed
TIME_SLOTS = [15, 30, 45, 60, 90]

# How many days before a completed problem is eligible for revision
REVISION_GAP_DAYS = 30

# Scoring weights (all sum to 1.0)
SCORE_WEIGHTS = {
    "energy_match": 0.30,     # Problem energy matches user energy exactly
    "time_fit": 0.25,         # Problem fits in available time
    "streak_bonus": 0.15,     # Harder problems rewarded during streak
    "topic_priority": 0.20,   # Earlier topics in sequence scored higher
    "productivity_fit": 0.10, # Problem complexity fits productivity level
}

# Productivity level → preferred problem types
PRODUCTIVITY_TO_COMPLEXITY = {
    "low":    ["Easy"],
    "medium": ["Easy", "Medium"],
    "high":   ["Medium", "Hard"],
}

# Recommendation modes
MODE_FRESH = "fresh"
MODE_REVISION = "revision"
MODE_NEXT_TOPIC = "next_topic"