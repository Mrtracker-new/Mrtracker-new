#!/usr/bin/env node
/**
 * Generates assets/terminal-intro.svg
 * One animated terminal containing everything:
 *   - ASCII "RNR" logo rendered line-by-line
 *   - ./identify        -> personnel data
 *   - which --all skills -> skill list
 *   - git stats          -> stars / repos / commits / followers + language bars
 *   - git log --graph    -> contribution heatmap (terminal-styled calendar)
 *   - ls ./projects, cat mission.txt, blinking cursor
 *
 * Live data: set GITHUB_TOKEN (and optionally GH_LOGIN, default "Mrtracker-new").
 * Without a token it falls back to sample data so local preview still works.
 *
 * Usage: node scripts/generate-terminal.js
 */
const fs = require("fs");
const path = require("path");

const LOGIN = process.env.GH_LOGIN || "Mrtracker-new";
const TOKEN = process.env.GITHUB_TOKEN || process.env.METRICS_TOKEN || "";
const ART_FILE = path.join(__dirname, "..", "assets", "ascii-art.txt");
const OUT_FILE = path.join(__dirname, "..", "assets", "terminal-intro.svg");

// ---------------- data ----------------
async function fetchGitHub() {
  const query = `query($login:String!){
    user(login:$login){
      followers{ totalCount }
      repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:STARGAZERS,direction:DESC}){
        totalCount
        nodes{ stargazerCount languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } } }
      }
      contributionsCollection{
        totalCommitContributions
        restrictedContributionsCount
        contributionCalendar{
          totalContributions
          weeks{ contributionDays{ date contributionCount contributionLevel } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const u = json.data.user;

  const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
  const langBytes = {};
  for (const r of u.repositories.nodes)
    for (const e of r.languages.edges) {
      langBytes[e.node.name] = langBytes[e.node.name] || { size: 0, color: e.node.color };
      langBytes[e.node.name].size += e.size;
    }
  const totalBytes = Object.values(langBytes).reduce((s, l) => s + l.size, 0) || 1;
  const langs = Object.entries(langBytes)
    .map(([name, v]) => ({ name, pct: (v.size / totalBytes) * 100, color: v.color || "#8b949e" }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  const cc = u.contributionsCollection;
  return {
    stars,
    repos: u.repositories.totalCount,
    commits: cc.totalCommitContributions + cc.restrictedContributionsCount,
    followers: u.followers.totalCount,
    langs,
    weeks: cc.contributionCalendar.weeks,
    totalContrib: cc.contributionCalendar.totalContributions,
  };
}

function sampleData() {
  // deterministic pseudo-random calendar so local preview looks real
  const weeks = [];
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const levels = ["NONE", "FIRST_QUARTER", "SECOND_QUARTER", "THIRD_QUARTER", "FOURTH_QUARTER"];
  const start = new Date();
  start.setDate(start.getDate() - 364 - start.getDay());
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      if (date > new Date()) continue;
      const r = rnd();
      const li = r < 0.44 ? 0 : r < 0.68 ? 1 : r < 0.85 ? 2 : r < 0.95 ? 3 : 4;
      const count = li === 0 ? 0 : Math.ceil(r * 10 * li);
      total += count;
      days.push({ date: date.toISOString().slice(0, 10), contributionCount: count, contributionLevel: levels[li] });
    }
    weeks.push({ contributionDays: days });
  }
  return {
    stars: 36, repos: 24, commits: 812, followers: 14,
    langs: [
      { name: "Python", pct: 46.9, color: "#3572A5" },
      { name: "JavaScript", pct: 21.4, color: "#f1e05a" },
      { name: "TypeScript", pct: 12.8, color: "#3178c6" },
      { name: "HTML", pct: 9.6, color: "#e34c26" },
      { name: "CSS", pct: 5.8, color: "#663399" },
      { name: "Rust", pct: 3.5, color: "#dea584" },
    ],
    weeks, totalContrib: total,
  };
}

// ---------------- helpers ----------------
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = n => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));

const LEVEL_FILL = {
  NONE: "#161b22",
  FIRST_QUARTER: "#0e4429",
  SECOND_QUARTER: "#006d32",
  THIRD_QUARTER: "#26a641",
  FOURTH_QUARTER: "#39d353",
};

(async () => {
  let data;
  try {
    if (!TOKEN) throw new Error("no token");
    data = await fetchGitHub();
    console.log(`fetched live data for ${LOGIN}`);
  } catch (e) {
    // In CI a fallback would silently publish fake stats — fail loudly instead.
    if (process.env.CI) {
      console.error(`refusing to use sample data in CI: ${e.message}`);
      process.exit(1);
    }
    data = sampleData();
    console.log(`using sample data (${e.message})`);
  }

  // ---------- load + crop art ----------
  const raw = fs.readFileSync(ART_FILE, "utf8").split(/\r?\n/);
  let firstL = -1, lastL = -1, minStart = Infinity;
  raw.forEach((l, i) => {
    if (l.trim().length) {
      if (firstL < 0) firstL = i;
      lastL = i;
      const s = l.search(/\S/);
      if (s < minStart) minStart = s;
    }
  });
  const art = raw.slice(firstL, lastL + 1).map(l => l.slice(minStart).replace(/\s+$/, ""));
  const artCols = Math.max(...art.map(l => l.length));

  // ---------- layout constants ----------
  const PAD_X = 26;
  const HEADER_H = 36;
  const ART_FS = 7.4, ART_LH = 8.6, ART_CW = ART_FS * 0.602;
  const BODY_FS = 12.5, BODY_LH = 21;
  const CW = BODY_FS * 0.602;
  const W = Math.max(Math.ceil(artCols * ART_CW) + PAD_X * 2, 800);

  const colors = {
    bg: "#0d1117", border: "#30363d", header: "#161b22",
    txt: "#e6edf3", dim: "#8b949e", grn: "#3fb950", ylw: "#d29922",
    cyn: "#58a6ff", mag: "#bc8cff", red: "#f85149", prompt: "#3fb950",
  };

  // timing
  const ART_START = 0.3, ART_STEP = 0.04;
  const artDone = ART_START + art.length * ART_STEP;
  let t = artDone + 0.15;

  const elems = [];
  let y = 0; // set later

  // ---- body line builders (they push into `elems` and advance `y`/`t`) ----
  function cmdLine(text, dur) {
    const start = t + 0.15;
    const chars = [...text];
    const per = dur / chars.length;
    const spans = chars.map((c, i) =>
      `<tspan class="tw" style="animation-delay:${(start + i * per).toFixed(2)}s">${esc(c)}</tspan>`).join("");
    elems.push(`<text xml:space="preserve" class="b txt" x="${PAD_X}" y="${y}"><tspan class="tw pr" style="animation-delay:${start.toFixed(2)}s">❯ </tspan>${spans}</text>`);
    t = start + dur + 0.08;
    y += BODY_LH;
  }
  function outLine(parts) {
    const spans = parts.map(([cls, txt]) => `<tspan class="${cls}">${esc(txt)}</tspan>`).join("");
    elems.push(`<text xml:space="preserve" class="b out" x="${PAD_X}" y="${y}" style="animation-delay:${t.toFixed(2)}s">${spans}</text>`);
    t += 0.07;
    y += BODY_LH;
  }
  function gap(h = 0.5) { y += BODY_LH * h; t += 0.05; }

  // ================= build body =================
  // y starts after art
  const artH = art.length * ART_LH;
  y = HEADER_H + 20 + artH + 26 + BODY_FS;

  // --- identify ---
  cmdLine("./identify --user rolan", 0.55);
  outLine([["dim", "  name        "], ["txt", "Rolan Lobo"]]);
  outLine([["dim", "  alias       "], ["grn", "RNR"]]);
  outLine([["dim", "  role        "], ["txt", "Privacy Engineer · Python Developer"]]);
  outLine([["dim", "  status      "], ["grn", "● ACTIVE"]]);
  outLine([["dim", "  clearance   "], ["ylw", "LEVEL 5"]]);
  gap();

  // --- skills ---
  cmdLine("which --all skills", 0.45);
  outLine([["cyn", "  python "], ["dim", "· "], ["ylw", "javascript "], ["dim", "· "], ["red", "rust "], ["dim", "· "], ["grn", "bash "], ["dim", "· "], ["cyn", "docker "], ["dim", "· "], ["txt", "linux"]]);
  outLine([["mag", "  git "], ["dim", "· "], ["cyn", "postgres "], ["dim", "· "], ["txt", "html "], ["dim", "· "], ["mag", "css "], ["dim", "· "], ["ylw", "vscode "], ["dim", "· "], ["grn", "github-actions"]]);
  gap();

  // --- git stats ---
  cmdLine("git stats", 0.3);
  outLine([
    ["ylw", "  ★ "], ["txt", `${fmt(data.stars)} stars`], ["dim", "    "],
    ["cyn", "⎇ "], ["txt", `${fmt(data.repos)} repos`], ["dim", "    "],
    ["grn", "✎ "], ["txt", `${fmt(data.commits)} commits`], ["dim", "    "],
    ["mag", "⚑ "], ["txt", `${fmt(data.followers)} followers`],
  ]);
  gap(0.4);

  // language bars: name padded to 12, bar of 24 cells, pct
  const BAR_N = 24;
  for (const l of data.langs) {
    const filled = Math.max(1, Math.round((l.pct / 100) * BAR_N));
    const name = l.name.toLowerCase().padEnd(12, " ");
    const pct = l.pct.toFixed(1).padStart(5, " ") + "%";
    elems.push(`<text xml:space="preserve" class="b out" x="${PAD_X}" y="${y}" style="animation-delay:${t.toFixed(2)}s"><tspan class="dim">  ${esc(name)}</tspan><tspan style="fill:${l.color}">${"█".repeat(filled)}</tspan><tspan style="fill:#21262d">${"█".repeat(BAR_N - filled)}</tspan><tspan class="dim"> ${pct}</tspan></text>`);
    t += 0.07;
    y += BODY_LH;
  }
  gap();

  // --- contribution calendar ---
  cmdLine("git log --graph --contributions", 0.6);
  outLine([["dim", `  last 12 months · `], ["grn", `${fmt(data.totalContrib)} contributions`]]);
  y += 4;

  const CELL = 10, GAP = 3, STEP = CELL + GAP;
  const calW = data.weeks.length * STEP - GAP;
  const calX = PAD_X + Math.floor(2 * CW);
  const calTop = y;

  // month labels
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let lastMonth = -1;
  data.weeks.forEach((w, wi) => {
    const d0 = w.contributionDays[0];
    if (!d0) return;
    const m = new Date(d0.date + "T00:00:00").getMonth();
    if (m !== lastMonth) {
      // skip label if too close to right edge
      if (wi * STEP < calW - 30) {
        elems.push(`<text class="cal-lbl out" x="${calX + wi * STEP}" y="${calTop}" style="animation-delay:${(t + wi * 0.008).toFixed(2)}s">${monthNames[m]}</text>`);
      }
      lastMonth = m;
    }
  });
  y = calTop + 8;

  // day labels
  ["Mon", "Wed", "Fri"].forEach((lbl, i) => {
    elems.push(`<text class="cal-lbl out" x="${PAD_X - 2}" y="${y + (1 + i * 2) * STEP + CELL - 2}" style="animation-delay:${t.toFixed(2)}s">${lbl}</text>`);
  });

  // cells — reveal per week column
  data.weeks.forEach((w, wi) => {
    const d = (t + 0.15 + wi * 0.012).toFixed(2);
    const cells = w.contributionDays.map(day => {
      const dow = new Date(day.date + "T00:00:00").getDay();
      return `<rect x="${calX + wi * STEP}" y="${y + dow * STEP}" width="${CELL}" height="${CELL}" rx="2" fill="${LEVEL_FILL[day.contributionLevel] || LEVEL_FILL.NONE}"/>`;
    }).join("");
    elems.push(`<g class="out" style="animation-delay:${d}s">${cells}</g>`);
  });
  t += 0.15 + data.weeks.length * 0.012 + 0.1;
  y += 7 * STEP + 6;

  // legend
  elems.push(`<g class="out" style="animation-delay:${t.toFixed(2)}s">` +
    `<text class="cal-lbl" x="${calX + calW - 118}" y="${y + 8}">less</text>` +
    Object.values(LEVEL_FILL).map((c, i) =>
      `<rect x="${calX + calW - 88 + i * 13}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${c}"/>`).join("") +
    `<text class="cal-lbl" x="${calX + calW - 88 + 5 * 13 + 2}" y="${y + 8}">more</text></g>`);
  t += 0.1;
  y += STEP + BODY_LH * 0.9 + BODY_FS;

  // --- projects ---
  cmdLine("ls ./projects", 0.35);
  outLine([["cyn", "  ► InvisioVault"], ["dim", "      steganography vault"]]);
  outLine([["cyn", "  ► BAR"], ["dim", "               burn-after-reading file sharing"]]);
  outLine([["cyn", "  ► LinkNest"], ["dim", "          self-hosted bookmark manager"]]);
  gap();

  // --- mission ---
  cmdLine("cat mission.txt", 0.4);
  outLine([["txt", "  Building secure, privacy-first software."]]);
  gap();

  // --- cursor ---
  const curT = t + 0.2;
  elems.push(`<text xml:space="preserve" class="b" x="${PAD_X}" y="${y}"><tspan class="tw pr" style="animation-delay:${curT.toFixed(2)}s">❯ </tspan></text>`);
  elems.push(`<rect x="${PAD_X + CW * 2.2}" y="${y - BODY_FS + 1}" width="${CW + 1}" height="${BODY_FS + 2}" fill="${colors.grn}" opacity="0" style="animation: blink 1.1s step-end ${curT.toFixed(2)}s infinite"/>`);
  y += BODY_LH;

  const H = Math.ceil(y + 16);

  // ---------- chrome (prepended) ----------
  const chrome = [
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="${colors.bg}" stroke="${colors.border}"/>`,
    `<rect x=".5" y=".5" width="${W - 1}" height="${HEADER_H - 0.5}" rx="10" fill="${colors.header}"/>`,
    `<rect x=".5" y="${HEADER_H / 2}" width="${W - 1}" height="${HEADER_H / 2}" fill="${colors.header}"/>`,
    `<path d="M .5 ${HEADER_H} h ${W - 1}" stroke="${colors.border}" stroke-width="1"/>`,
    `<circle cx="22" cy="${HEADER_H / 2}" r="6" fill="#ff5f57"/>`,
    `<circle cx="42" cy="${HEADER_H / 2}" r="6" fill="#febc2e"/>`,
    `<circle cx="62" cy="${HEADER_H / 2}" r="6" fill="#28c840"/>`,
    `<text x="${W / 2}" y="${HEADER_H / 2 + 4}" text-anchor="middle" font-size="12" fill="${colors.dim}" class="mono">rolan@rnr: ~/profile</text>`,
  ];

  // art lines
  const artX = Math.round((W - artCols * ART_CW) / 2);
  let ay = HEADER_H + 20 + ART_FS;
  const artEls = art.map((line, i) => {
    const d = (ART_START + i * ART_STEP).toFixed(2);
    const el = `<text xml:space="preserve" class="art" x="${artX}" y="${ay.toFixed(1)}" style="animation-delay:${d}s">${esc(line)}</text>`;
    ay += ART_LH;
    return el;
  });

  const style = `
  <style>
    text { font-family: 'Cascadia Code','JetBrains Mono','Fira Code',Consolas,'Courier New',monospace; }
    .art  { font-size: ${ART_FS}px; fill: ${colors.txt}; white-space: pre; opacity: 0; animation: reveal .18s ease-out forwards; }
    .b    { font-size: ${BODY_FS}px; white-space: pre; }
    .cal-lbl { font-size: 9px; fill: ${colors.dim}; }
    .txt { fill: ${colors.txt}; } .dim { fill: ${colors.dim}; }
    .grn { fill: ${colors.grn}; } .ylw { fill: ${colors.ylw}; }
    .cyn { fill: ${colors.cyn}; } .mag { fill: ${colors.mag}; }
    .red { fill: ${colors.red}; }
    .pr  { fill: ${colors.prompt}; font-weight: bold; }
    .out { opacity: 0; animation: reveal .25s ease-out forwards; }
    .tw  { opacity: 0; animation: show 0s forwards; }
    @keyframes reveal { to { opacity: 1; } }
    @keyframes show   { to { opacity: 1; } }
    @keyframes blink  { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
    /* Static viewers / reduced motion: show final frame instead of a blank terminal */
    @media (prefers-reduced-motion: reduce) {
      .art, .out, .tw { animation: none; opacity: 1; }
    }
  </style>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Rolan Lobo — RNR terminal profile">
${style}
${chrome.join("\n")}
${artEls.join("\n")}
${elems.join("\n")}
</svg>`;

  fs.writeFileSync(OUT_FILE, svg, "utf8");
  console.log(`written ${OUT_FILE} (${(svg.length / 1024).toFixed(1)} KB, ${W}x${H})`);
})();
