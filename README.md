# SIGNAL — AI Intelligence Platform

Professional AI intelligence desk for product managers, UX designers, and AI-curious professionals.

Transforms scattered AI updates into **ranked, understandable insights** — not another news aggregator.

## MVP features

1. **AI Intelligence Feed** — centralized updates from OpenAI, Anthropic, DeepMind, Hugging Face, arXiv, tech blogs, and developer communities
2. **Smart AI Ranking** — Impact / Relevance / Trend scores → High Impact, Trending, Emerging
3. **AI Impact Brief** — What happened, Why it matters, Potential impact, Key takeaway

## Product structure

| Nav | Purpose |
|-----|---------|
| Feed | Full ranked intelligence stream + filters |
| Insights | High Impact & Trending briefs only |

**Flow:** Sources → Feed → Smart Ranking → Impact Brief → Actionable knowledge

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS v4
- Live aggregation via `/api/feed` (15-min revalidate)

## Live sources (connected)

| Source | Connector |
|--------|-----------|
| arXiv | Official Atom API |
| Developer Community | Hacker News Firebase API |
| OpenAI | News RSS |
| Google DeepMind | Blog RSS |
| Hugging Face | Blog RSS |
| Tech Blog | Simon Willison Atom (+ AI filter) |
| Foreign Media | TechCrunch AI + MIT TR RSS |
| YouTube | Data API v3 (`YOUTUBE_API_KEY`) |
| X (Twitter) | API v2 recent search (`X_BEARER_TOKEN`, pay-per-use) |
| Anthropic | Community news RSS mirror |
| GitHub | Search API (optional `GITHUB_TOKEN`) |

Feed is live-only — sources without a public API are not shown.

Set `OPENAI_API_KEY` in `.env.local` to enable AI scoring + Impact Briefs (`gpt-4o-mini` by default). Enrichments are cached in `.cache/`.

## Not in MVP

- Role-based AI Perspective
- Personalized AI Radar
- AI skill gap analysis

## Chinese / English

The header switch changes interface language without navigation. The first visit follows the browser language; subsequent visits use the saved `signal-language` preference. Post identity, likes, saves and reading history are shared across languages.

The persistent Node/Railway server prepares both English and Chinese titles, summaries, and all four Impact Brief sections whenever the feed snapshot changes. A startup/background loop checks the feed every minute (the crawl retains its 30-minute TTL), resumes work after restarts, and retries independently of browser traffic. `OPENAI_TRANSLATION_MODEL` overrides the model, otherwise `OPENAI_MODEL` or `gpt-4o-mini` is used. Public feed content is sent to OpenAI using `OPENAI_API_KEY` and incurs API usage.

`/api/feed` publishes only revisions with both translations validated. An update awaiting translation retains its previously published bilingual revision; new posts wait until ready. Each item carries both languages so switching, opening a Brief, and saving a post use the same content revision without waiting for an API translation. The legacy `/api/feed/translations` endpoint only reads cache. Old saved posts without embedded translations may still fall back to original text.

Translation caches (`feed-translations-{zh,en}-v1.json`) and the last bilingual publication (`feed-bilingual.json`) live in `CACHE_DIR` (default `.cache`). Mount a persistent Railway volume to retain them across deployments. Each language has one worker with batches of 3; quota/authentication failures back off five minutes, and individual failures retry separately. No source-text fallback is published for new feed items. On an empty installation, the feed remains in preparation until the first complete bilingual items are ready; unavailable API credentials prevent new publication rather than silently showing mixed languages.
