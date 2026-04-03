// script.js — CodeHab frontend logic
// Includes a full embedded engine so the app works without a backend.
// To use the FastAPI backend instead, flip USE_BACKEND to true and set API_URL.

const USE_BACKEND = false; // Set to true when running with FastAPI
const API_URL = "http://localhost:8000/api/recommend";

// ── Embedded problem bank (loaded from JSON in a real setup) ────────────────
// We fetch it from the JSON file if running with a server; otherwise we embed
// a local copy. For the standalone demo we dynamically load it.

let PROBLEMS = [];
let completed = {}; // { problem_id: "YYYY-MM-DD" }

// ── State ─────────────────────────────────────────────────────────────────
let state = {
  energy: "medium",
  timeAvailable: 30,
  productivity: "medium",
  streak: 0,
};

let currentProblem = null;

// ── Load problem bank ──────────────────────────────────────────────────────
async function loadProblems() {
  try {
    const res = await fetch("../backend/data/neetcode150.json");
    const data = await res.json();
    PROBLEMS = data.problems;
  } catch {
    // Inline fallback with a small subset for pure file:// demo
    PROBLEMS = EMBEDDED_PROBLEMS;
  }
  loadCompleted();
  renderProgressGrid();
  updateHeader();
}

// ── LocalStorage persistence ───────────────────────────────────────────────
function saveCompleted() {
  localStorage.setItem("codehab_completed", JSON.stringify(completed));
}
function loadCompleted() {
  const raw = localStorage.getItem("codehab_completed");
  if (raw) completed = JSON.parse(raw);
}
function saveStreak() {
  localStorage.setItem("codehab_streak", String(state.streak));
}
function loadStreak() {
  const s = localStorage.getItem("codehab_streak");
  if (s) state.streak = parseInt(s, 10);
}

// ── DOM references ─────────────────────────────────────────────────────────
const energyControl     = document.getElementById("energy-control");
const productivityCtrl  = document.getElementById("productivity-control");
const timeSlider        = document.getElementById("time-slider");
const timeValue         = document.getElementById("time-value");
const streakVal         = document.getElementById("streak-val");
const streakMinus       = document.getElementById("streak-minus");
const streakPlus        = document.getElementById("streak-plus");
const recommendBtn      = document.getElementById("recommend-btn");
const emptyState        = document.getElementById("empty-state");
const loadingState      = document.getElementById("loading-state");
const resultCard        = document.getElementById("result-card");
const toggleProgress    = document.getElementById("toggle-progress");
const progressSection   = document.getElementById("progress-section");
const closeProgress     = document.getElementById("close-progress");
const searchInput       = document.getElementById("search-problems");
const problemGrid       = document.getElementById("problem-grid");
const markDoneBtn       = document.getElementById("mark-done-btn");
const skipBtn           = document.getElementById("skip-btn");
const solveBtn          = document.getElementById("solve-btn");
const toast             = document.getElementById("toast");

// ── UI bindings ────────────────────────────────────────────────────────────
function bindSegControl(container, key) {
  container.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state[key] = btn.dataset.value;
    });
  });
}
bindSegControl(energyControl, "energy");
bindSegControl(productivityCtrl, "productivity");

timeSlider.addEventListener("input", () => {
  state.timeAvailable = parseInt(timeSlider.value, 10);
  timeValue.textContent = `${state.timeAvailable} min`;
});

streakMinus.addEventListener("click", () => {
  if (state.streak > 0) { state.streak--; streakVal.textContent = state.streak; saveStreak(); }
});
streakPlus.addEventListener("click", () => {
  state.streak++; streakVal.textContent = state.streak; saveStreak();
});

toggleProgress.addEventListener("click", () => {
  progressSection.classList.toggle("hidden");
});
closeProgress.addEventListener("click", () => {
  progressSection.classList.add("hidden");
});

searchInput.addEventListener("input", () => renderProgressGrid(searchInput.value));

// ── Recommend button ────────────────────────────────────────────────────────
recommendBtn.addEventListener("click", async () => {
  showLoading();
  try {
    let result;
    if (USE_BACKEND) {
      result = await fetchFromBackend();
    } else {
      result = runEngine();
    }
    renderResult(result);
  } catch (e) {
    console.error(e);
    showToast("Something went wrong. Check console.", true);
    showEmpty();
  }
});

async function fetchFromBackend() {
  const body = {
    energy: state.energy,
    time_available: state.timeAvailable,
    streak: state.streak,
    productivity: state.productivity,
    completed,
  };
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return await res.json();
}

// ── EMBEDDED ENGINE (mirrors Python logic) ─────────────────────────────────

const TOPIC_ORDER = [
  "Arrays & Hashing","Two Pointers","Sliding Window","Stack","Binary Search",
  "Linked List","Trees","Tries","Heap / Priority Queue","Backtracking",
  "Graphs","Advanced Graphs","1-D Dynamic Programming","2-D Dynamic Programming",
  "Greedy","Intervals","Math & Geometry","Bit Manipulation",
];

const ENERGY_TO_DIFF = {
  low:    ["Easy"],
  medium: ["Easy","Medium"],
  high:   ["Easy","Medium","Hard"],
};

const PROD_TO_DIFF = {
  low:    ["Easy"],
  medium: ["Easy","Medium"],
  high:   ["Medium","Hard"],
};

const DIFF_RANK = { Easy:1, Medium:2, Hard:3 };
const ENERGY_LEVELS = ["low","medium","high"];

function runEngine() {
  const { energy, timeAvailable, streak, productivity } = state;
  const today = new Date();

  // 1. Filter by energy & time
  const allowed = ENERGY_TO_DIFF[energy] || ["Easy"];
  const filtered = PROBLEMS.filter(p =>
    allowed.includes(p.difficulty) && p.estimated_time <= timeAvailable
  );

  // 2. Split fresh / completed
  const fresh    = filtered.filter(p => !completed[p.id]);
  const done     = filtered.filter(p => !!completed[p.id]);

  // 3. Revision candidates (solved > 30 days ago)
  const revCandidates = done.filter(p => {
    const d = new Date(completed[p.id]);
    return (today - d) / 86400000 > 30;
  });

  let mode, candidates, nextTopic = null;

  if (fresh.length > 0) {
    mode = "fresh"; candidates = fresh;
  } else if (revCandidates.length > 0) {
    mode = "revision"; candidates = revCandidates;
  } else {
    mode = "next_topic";
    nextTopic = getNextTopic();
    candidates = PROBLEMS.filter(p => p.topic === nextTopic && !completed[p.id]);
  }

  // 4. Score & rank
  const scored = candidates.map(p => ({
    ...p,
    _score: computeScore(p, energy, timeAvailable, streak, productivity),
    _score_breakdown: scoreBreakdown(p, energy, timeAvailable, streak, productivity),
  })).sort((a,b) => b._score - a._score);

  // 5. Select
  let selected;
  if (mode === "next_topic") {
    selected = [...scored].sort((a,b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty])[0];
  } else {
    selected = scored[0] || null;
  }

  // 6. Explain
  return buildResult(selected, mode, nextTopic);
}

function computeScore(p, energy, time, streak, prod) {
  const bd = scoreBreakdown(p, energy, time, streak, prod);
  const w = { energy_match:0.30, time_fit:0.25, streak_bonus:0.15, topic_priority:0.20, productivity_fit:0.10 };
  return Object.entries(w).reduce((s,[k,v]) => s + v*(bd[k]||0), 0);
}

function scoreBreakdown(p, energy, time, streak, prod) {
  // Energy match
  const energyIdx = ENERGY_LEVELS.indexOf(energy);
  const probEIdx  = ENERGY_LEVELS.indexOf(p.energy_required || "medium");
  let energy_match = energyIdx === probEIdx ? 1 : probEIdx < energyIdx ? 0.6 : 0;

  // Time fit
  const ratio = p.estimated_time / time;
  let time_fit = ratio >= 0.8 && ratio <= 1 ? 1 : ratio >= 0.6 ? 0.75 : ratio >= 0.5 ? 0.5 : 0.3;

  // Streak bonus
  const rank = DIFF_RANK[p.difficulty] || 2;
  let streak_bonus = streak >= 7 ? (rank>=2?1:0.7) : streak>=3 ? (rank<=2?1:0.6) : (rank===1?1:rank===2?0.7:0.4);

  // Topic priority
  const idx = TOPIC_ORDER.indexOf(p.topic);
  const topic_priority = idx >= 0 ? +(1 - (idx/Math.max(TOPIC_ORDER.length-1,1))*0.9).toFixed(3) : 0.5;

  // Productivity fit
  const preferred = PROD_TO_DIFF[prod] || ["Easy","Medium"];
  const minDiff = Math.min(...preferred.map(d => Math.abs(DIFF_RANK[d]-rank)));
  const productivity_fit = preferred.includes(p.difficulty) ? 1 : 1 - 0.3*minDiff;

  return { energy_match, time_fit, streak_bonus, topic_priority, productivity_fit };
}

function getNextTopic() {
  const completedIds = new Set(Object.keys(completed));
  const topicMap = {};
  PROBLEMS.forEach(p => {
    if (!topicMap[p.topic]) topicMap[p.topic] = [];
    topicMap[p.topic].push(p.id);
  });
  for (const topic of TOPIC_ORDER) {
    const ids = topicMap[topic] || [];
    if (ids.length && !ids.every(id => completedIds.has(id))) return topic;
  }
  return null;
}

function buildResult(problem, mode, nextTopic) {
  if (!problem) {
    return {
      problem_id: null, title: null, topic: null, difficulty: null,
      estimated_time: null, url: null, tags: null, mode,
      overall_score: 0, headline: "No suitable problem found",
      reason: `No problems match energy=${state.energy}, time=${state.timeAvailable}min. Try adjusting filters.`,
      score_factors: [], tips: "Try lowering filters or increasing time.",
    };
  }

  const modeLabels = { fresh:"FRESH", revision:"REVISION", next_topic:"NEXT TOPIC" };
  const headlines = {
    fresh: `Fresh challenge — ${problem.difficulty} · ${problem.topic}`,
    revision: "Revision time — you solved this 30+ days ago",
    next_topic: `New territory — stepping into ${nextTopic || problem.topic}`,
  };

  const tipMap = {
    "low-fresh":    "Low energy? Skim the problem, write pseudocode, then code. No pressure.",
    "medium-fresh": "Medium energy — aim to solve within the time limit. Try without hints first.",
    "high-fresh":   "High energy! Challenge yourself: solve optimally, then explain it aloud.",
    "low-revision": "Light revision: re-read your old solution, trace through it manually.",
    "medium-revision": "Revision: try to re-solve from scratch before checking your old solution.",
    "high-revision":   "Strong energy on revision? Try to beat your previous time complexity!",
  };
  const tipKey = `${state.energy}-${mode === "revision" ? "revision" : "fresh"}`;

  const reasons = {
    fresh: `**${problem.title}** is a fresh ${problem.difficulty.toLowerCase()} problem from ${problem.topic} that you haven't solved yet. At ${problem.estimated_time} minutes it fits your ${state.timeAvailable}-minute window, and the difficulty matches your ${state.energy} energy level.${state.streak >= 3 ? ` Your ${state.streak}-day streak shows you're on a roll — keep it going!` : ""}`,
    revision: `**${problem.title}** was solved over 30 days ago, making it a strong revision candidate. Spaced repetition at this interval reinforces long-term memory. It's ${problem.difficulty.toLowerCase()}, takes about ${problem.estimated_time} minutes, and fits your current ${state.energy} energy level.`,
    next_topic: `You've completed all available problems matching your current filters. **${problem.title}** is the gentlest entry point into **${nextTopic || problem.topic}**, the next topic in the NeetCode roadmap. Starting with an ${problem.difficulty.toLowerCase()} problem here builds the mental model for harder problems to follow.`,
  };

  const bd = problem._score_breakdown || {};
  const factorMeta = [
    { key:"energy_match",     label:"⚡ Energy match",     desc:"Problem difficulty suits your energy level" },
    { key:"time_fit",         label:"⏱ Time fit",          desc:"Problem fits your available time" },
    { key:"streak_bonus",     label:"🔥 Streak bonus",      desc:"Difficulty preference based on your streak" },
    { key:"topic_priority",   label:"📚 Topic priority",    desc:"Earlier roadmap topics score higher" },
    { key:"productivity_fit", label:"🧠 Productivity fit",  desc:"Complexity matches your productivity level" },
  ];
  const score_factors = factorMeta.map(f => ({
    label: f.label, description: f.desc,
    score: Math.round((bd[f.key]||0)*100)/100,
    pct: `${Math.round((bd[f.key]||0)*100)}%`,
  }));

  return {
    problem_id: problem.id,
    title: problem.title,
    topic: problem.topic,
    difficulty: problem.difficulty,
    estimated_time: problem.estimated_time,
    url: problem.url,
    tags: problem.tags,
    mode,
    overall_score: Math.round(problem._score * 100) / 100,
    headline: headlines[mode] || headlines.fresh,
    reason: reasons[mode] || reasons.fresh,
    score_factors,
    tips: tipMap[tipKey] || "Focus, trust the process, and write clean code.",
  };
}

// ── Render result ────────────────────────────────────────────────────────────
function renderResult(r) {
  currentProblem = r;

  // Show card, hide others
  emptyState.classList.add("hidden");
  loadingState.classList.add("hidden");
  resultCard.classList.remove("hidden");

  // Mode badge
  const modeBadge = document.getElementById("mode-badge");
  const modeLabels = { fresh:"FRESH", revision:"REVISION", next_topic:"NEXT TOPIC" };
  modeBadge.textContent = modeLabels[r.mode] || r.mode.toUpperCase();
  modeBadge.className = `mode-badge ${r.mode}`;

  // Problem details
  document.getElementById("problem-title").textContent = r.title || "—";
  const diffBadge = document.getElementById("diff-badge");
  diffBadge.textContent = r.difficulty || "—";
  diffBadge.className = `diff-badge ${r.difficulty || ""}`;
  document.getElementById("topic-label").textContent = r.topic || "—";
  document.getElementById("time-label").textContent  = r.estimated_time ? `${r.estimated_time} min` : "—";
  document.getElementById("score-label").textContent = r.overall_score ? `Score: ${r.overall_score}` : "—";

  // Tags
  const tagsRow = document.getElementById("tags-row");
  tagsRow.innerHTML = (r.tags || []).map(t => `<span class="tag">${t}</span>`).join("");

  // Explanation
  document.getElementById("headline-text").textContent = r.headline || "—";
  // Render **bold** markdown in reason
  document.getElementById("reason-text").innerHTML =
    (r.reason || "—").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Score bars
  const barsContainer = document.getElementById("score-bars");
  barsContainer.innerHTML = (r.score_factors || []).map(f => `
    <div class="score-bar-item" title="${f.description}">
      <span class="score-bar-label">${f.label}</span>
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:0%" data-pct="${parseFloat(f.pct)}"></div>
      </div>
      <span class="score-bar-pct">${f.pct}</span>
    </div>
  `).join("");

  // Animate bars after render
  requestAnimationFrame(() => {
    barsContainer.querySelectorAll(".score-bar-fill").forEach(bar => {
      bar.style.width = bar.dataset.pct + "%";
    });
  });

  // Tip
  document.getElementById("tip-text").textContent = r.tips || "—";

  // Solve link
  solveBtn.href = r.url || "#";
  solveBtn.style.display = r.url ? "" : "none";

  // Mark done button
  const alreadyDone = r.problem_id && completed[r.problem_id];
  markDoneBtn.textContent = alreadyDone ? "Already Solved ✓" : "Mark as Solved ✓";
  markDoneBtn.disabled = !!alreadyDone;
}

// ── Mark as done ───────────────────────────────────────────────────────────
markDoneBtn.addEventListener("click", () => {
  if (!currentProblem?.problem_id) return;
  const today = new Date().toISOString().split("T")[0];
  completed[currentProblem.problem_id] = today;
  saveCompleted();
  markDoneBtn.textContent = "Already Solved ✓";
  markDoneBtn.disabled = true;
  renderProgressGrid(searchInput.value);
  updateHeader();
  showToast(`✓ "${currentProblem.title}" marked as solved!`);
});

// ── Skip ───────────────────────────────────────────────────────────────────
skipBtn.addEventListener("click", () => {
  if (!currentProblem?.problem_id) return;
  // Temporarily exclude from fresh candidates by adding a "skip" marker
  // (a date in the future keeps it excluded for today)
  const skipDate = new Date();
  skipDate.setDate(skipDate.getDate() - 29); // not old enough for revision
  completed[currentProblem.problem_id] = completed[currentProblem.problem_id] || skipDate.toISOString().split("T")[0];
  showToast("Problem skipped. Getting next recommendation…");
  setTimeout(() => recommendBtn.click(), 500);
});

// ── Progress grid ───────────────────────────────────────────────────────────
function renderProgressGrid(search = "") {
  const q = search.toLowerCase();
  const filtered = PROBLEMS.filter(p =>
    !q || p.title.toLowerCase().includes(q) || p.topic.toLowerCase().includes(q)
  );

  problemGrid.innerHTML = filtered.map(p => {
    const isDone = !!completed[p.id];
    return `
      <div class="pgrid-item ${isDone ? "done" : ""}" data-id="${p.id}">
        <div class="pgrid-check">${isDone ? "✓" : ""}</div>
        <span class="pgrid-title">${p.title}</span>
        <span class="pgrid-diff ${p.difficulty}">${p.difficulty[0]}</span>
      </div>
    `;
  }).join("");

  // Click to toggle
  problemGrid.querySelectorAll(".pgrid-item").forEach(item => {
    item.addEventListener("click", () => {
      const id = item.dataset.id;
      if (completed[id]) {
        delete completed[id];
        item.classList.remove("done");
        item.querySelector(".pgrid-check").textContent = "";
      } else {
        completed[id] = new Date().toISOString().split("T")[0];
        item.classList.add("done");
        item.querySelector(".pgrid-check").textContent = "✓";
      }
      saveCompleted();
      updateHeader();
    });
  });
}

function updateHeader() {
  const count = Object.keys(completed).length;
  document.getElementById("solved-display").textContent = `✓ ${count} solved`;
  document.getElementById("streak-display").textContent = `🔥 ${state.streak}-day streak`;
}

// ── Show/hide helpers ───────────────────────────────────────────────────────
function showLoading() {
  emptyState.classList.add("hidden");
  resultCard.classList.add("hidden");
  loadingState.classList.remove("hidden");
}
function showEmpty() {
  loadingState.classList.add("hidden");
  resultCard.classList.add("hidden");
  emptyState.classList.remove("hidden");
}

function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  toast.style.borderColor = isError ? "var(--red)" : "var(--green)";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add("hidden"), 3000);
}

// ── Embedded minimal problem set (fallback for file:// protocol) ────────────
const EMBEDDED_PROBLEMS = [
  { id:"nc001", title:"Contains Duplicate", topic:"Arrays & Hashing", topic_order:1, difficulty:"Easy", energy_required:"low", estimated_time:15, url:"https://leetcode.com/problems/contains-duplicate/", tags:["array","hash-set"] },
  { id:"nc002", title:"Valid Anagram", topic:"Arrays & Hashing", topic_order:1, difficulty:"Easy", energy_required:"low", estimated_time:15, url:"https://leetcode.com/problems/valid-anagram/", tags:["string","hash-map"] },
  { id:"nc003", title:"Two Sum", topic:"Arrays & Hashing", topic_order:1, difficulty:"Easy", energy_required:"low", estimated_time:20, url:"https://leetcode.com/problems/two-sum/", tags:["array","hash-map"] },
  { id:"nc004", title:"Group Anagrams", topic:"Arrays & Hashing", topic_order:1, difficulty:"Medium", energy_required:"medium", estimated_time:30, url:"https://leetcode.com/problems/group-anagrams/", tags:["string","hash-map"] },
  { id:"nc005", title:"Top K Frequent Elements", topic:"Arrays & Hashing", topic_order:1, difficulty:"Medium", energy_required:"medium", estimated_time:30, url:"https://leetcode.com/problems/top-k-frequent-elements/", tags:["array","heap"] },
  { id:"nc009", title:"Valid Palindrome", topic:"Two Pointers", topic_order:2, difficulty:"Easy", energy_required:"low", estimated_time:15, url:"https://leetcode.com/problems/valid-palindrome/", tags:["string","two-pointers"] },
  { id:"nc014", title:"Best Time to Buy and Sell Stock", topic:"Sliding Window", topic_order:3, difficulty:"Easy", energy_required:"low", estimated_time:20, url:"https://leetcode.com/problems/best-time-to-buy-and-sell-stock/", tags:["array","sliding-window"] },
  { id:"nc019", title:"Valid Parentheses", topic:"Stack", topic_order:4, difficulty:"Easy", energy_required:"low", estimated_time:15, url:"https://leetcode.com/problems/valid-parentheses/", tags:["string","stack"] },
  { id:"nc026", title:"Binary Search", topic:"Binary Search", topic_order:5, difficulty:"Easy", energy_required:"low", estimated_time:15, url:"https://leetcode.com/problems/binary-search/", tags:["array","binary-search"] },
  { id:"nc033", title:"Reverse Linked List", topic:"Linked List", topic_order:6, difficulty:"Easy", energy_required:"low", estimated_time:15, url:"https://leetcode.com/problems/reverse-linked-list/", tags:["linked-list","recursion"] },
  { id:"nc041", title:"Invert Binary Tree", topic:"Trees", topic_order:7, difficulty:"Easy", energy_required:"low", estimated_time:15, url:"https://leetcode.com/problems/invert-binary-tree/", tags:["tree","dfs"] },
  { id:"nc076", title:"Climbing Stairs", topic:"1-D Dynamic Programming", topic_order:13, difficulty:"Easy", energy_required:"low", estimated_time:15, url:"https://leetcode.com/problems/climbing-stairs/", tags:["dp","memoization"] },
];

// ── Init ───────────────────────────────────────────────────────────────────
(async function init() {
  loadStreak();
  streakVal.textContent = state.streak;
  await loadProblems();
})();