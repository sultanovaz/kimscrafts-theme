#!/usr/bin/env node
/**
 * fetch-news.mjs — refreshes docs/data.json for the AI Frontier dashboard.
 *
 * Runs in GitHub Actions (Node 20+, global fetch). No npm dependencies:
 * RSS/Atom is parsed with small regexes that are good enough for the feeds below.
 *
 * Strategy:
 *   1. Load the durable, deep-researched curated base from docs/seed.json.
 *   2. Pull recent items from a set of authoritative AI RSS/Atom feeds.
 *   3. Merge (curated first), dedupe, score importance heuristically, cap.
 *   4. Write docs/data.json with a fresh `updated` timestamp.
 *
 * The dashboard's "Live pulse" is fetched client-side (Hacker News + dev.to),
 * so even if every feed here fails, the page still shows fresh signal.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, "..");

const FEEDS = [
  { lab: "OpenAI",          url: "https://openai.com/news/rss.xml" },
  { lab: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml" },
  { lab: "Hugging Face",    url: "https://huggingface.co/blog/feed.xml" },
  { lab: "",                url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { lab: "",                url: "https://venturebeat.com/category/ai/feed/" },
  { lab: "",                url: "https://arstechnica.com/ai/feed/" },
  { lab: "",                url: "https://the-decoder.com/feed/" },
  { lab: "",                url: "https://simonwillison.net/atom/everything/" },
];

const LAB_KEYWORDS = [
  ["Anthropic", /\b(anthropic|claude|fable)\b/i],
  ["OpenAI", /\b(openai|chatgpt|gpt-?5|gpt-?4|o3|o4|sora|dall[- ]?e)\b/i],
  ["Google DeepMind", /\b(google|deepmind|gemini|gemma|veo|imagen|astra)\b/i],
  ["Meta", /\b(meta|llama)\b/i],
  ["xAI", /\b(xai|grok)\b/i],
  ["DeepSeek", /\bdeepseek\b/i],
  ["Mistral", /\bmistral\b/i],
  ["Alibaba", /\bqwen\b/i],
  ["Moonshot", /\bkimi\b/i],
  ["Nvidia", /\b(nvidia|blackwell|rubin)\b/i],
  ["Microsoft", /\b(microsoft|copilot|phi-?\d)\b/i],
];

const CAT_KEYWORDS = [
  ["benchmark", /\b(benchmark|swe-?bench|arc-?agi|gpqa|mmlu|aime|leaderboard|eval|state[- ]of[- ]the[- ]art|sota|humanity'?s last exam)\b/i],
  ["model", /\b(model|release|launch|gpt|claude|gemini|llama|grok|deepseek|qwen|opus|sonnet|haiku|reasoning|multimodal|weights)\b/i],
  ["hardware", /\b(chip|gpu|nvidia|blackwell|tpu|datacenter|data center|compute|wafer|silicon)\b/i],
  ["industry", /\b(funding|raise|valuation|billion|acqui|lawsuit|regulat|partner|ipo|hires?|joins?)\b/i],
  ["product", /\b(app|agent|feature|api|tool|browser|assistant|copilot|cursor|devin|product)\b/i],
  ["research", /\b(paper|research|arxiv|breakthrough|discover|alphafold|interpretab)\b/i],
];

function detectLab(text, fallback) {
  for (const [lab, re] of LAB_KEYWORDS) if (re.test(text)) return lab;
  return fallback || "AI";
}
function detectCat(text) {
  for (const [cat, re] of CAT_KEYWORDS) if (re.test(text)) return cat;
  return "industry";
}
function importance(text, points = 0) {
  let s = 2;
  if (/\b(launch|release|introduc|announc|unveil)\b/i.test(text)) s += 1;
  if (/\b(gpt-?5|claude (opus|4)|gemini 3|state[- ]of[- ]the[- ]art|sota|record|beats|surpass|frontier|breakthrough|first)\b/i.test(text)) s += 1;
  if (/\b(billion|\$\d+b|landmark|historic)\b/i.test(text)) s += 1;
  return Math.max(1, Math.min(5, s));
}

const strip = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
   .replace(/<[^>]+>/g, "")
   .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘")
   .replace(/&quot;/g, '"').replace(/&#8230;|&hellip;/g, "…").replace(/&nbsp;/g, " ")
   .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
   .replace(/\s+/g, " ").trim();

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}
function attrLink(block) {
  // Atom <link href="..."/>
  const m = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return m ? m[1] : "";
}

function parseFeed(xml, fallbackLab) {
  const out = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) || [];
  for (const b of blocks) {
    const title = strip(tag(b, "title"));
    if (!title) continue;
    let link = strip(tag(b, "link")) || attrLink(b);
    let date = strip(tag(b, "pubDate")) || strip(tag(b, "published")) || strip(tag(b, "updated")) || strip(tag(b, "dc:date"));
    let desc = strip(tag(b, "description")) || strip(tag(b, "summary")) || strip(tag(b, "content"));
    const ts = date ? Date.parse(date) : NaN;
    const iso = isNaN(ts) ? null : new Date(ts).toISOString().slice(0, 10);
    const text = title + " " + desc;
    out.push({
      category: detectCat(text),
      lab: detectLab(text, fallbackLab),
      title: title.slice(0, 140),
      summary: (desc || title).slice(0, 280),
      date: iso || new Date().toISOString().slice(0, 10),
      _ts: isNaN(ts) ? Date.now() : ts,
      importance: importance(text),
      tags: [],
      url: link,
    });
  }
  return out;
}

async function fetchFeed(f) {
  try {
    const r = await fetch(f.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) { console.warn(`! ${f.url} -> ${r.status}`); return []; }
    const xml = await r.text();
    const items = parseFeed(xml, f.lab);
    console.log(`✓ ${f.url} -> ${items.length} items`);
    return items;
  } catch (e) {
    console.warn(`! ${f.url} -> ${e.message}`);
    return [];
  }
}

const CUTOFF = Date.now() - 1000 * 60 * 60 * 24 * 30; // last 30 days of fresh news

async function main() {
  // 1. durable curated base
  let seed = { items: [], benchmarks: [] };
  try { seed = JSON.parse(await readFile(join(DOCS, "seed.json"), "utf8")); }
  catch { console.warn("no seed.json — proceeding with feeds only"); }

  // 2. fresh feeds
  const fetched = (await Promise.all(FEEDS.map(fetchFeed))).flat()
    .filter(i => i.url && i._ts >= CUTOFF);

  // 3. merge: curated first, then fresh; dedupe by normalized title
  const norm = t => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
  const seen = new Set();
  const merged = [];
  for (const it of (seed.items || [])) { const k = norm(it.title); if (!seen.has(k)) { seen.add(k); merged.push(it); } }
  fetched.sort((a, b) => b._ts - a._ts);
  for (const it of fetched) { const k = norm(it.title); if (!seen.has(k)) { seen.add(k); merged.push(it); } }

  // 4. sort by date desc then importance, cap, strip private fields
  merged.sort((a, b) => {
    const da = Date.parse((a.date || "") + "T00:00:00") || 0;
    const db = Date.parse((b.date || "") + "T00:00:00") || 0;
    if (db !== da) return db - da;
    return (b.importance || 0) - (a.importance || 0);
  });
  const items = merged.slice(0, 120).map(({ _ts, ...rest }) => rest);

  const data = {
    updated: new Date().toISOString(),
    generator: "fetch-news.mjs",
    counts: { total: items.length, curated: (seed.items || []).length, fresh: fetched.length },
    benchmarks: seed.benchmarks || [],
    items,
  };
  await writeFile(join(DOCS, "data.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(`\nWrote data.json — ${items.length} items (${data.counts.curated} curated + ${data.counts.fresh} fresh, deduped).`);
}

main().catch(e => { console.error(e); process.exit(1); });
