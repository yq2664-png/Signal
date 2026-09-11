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

Chinese titles and summaries are generated on demand by `/api/feed/translations` using `OPENAI_API_KEY`. `OPENAI_TRANSLATION_MODEL` overrides the translation model, otherwise `OPENAI_MODEL` or `gpt-4o-mini` is used. This sends public feed titles/summaries to OpenAI and incurs API usage. Full Impact Brief bodies remain in their original language in this release.

Translations are cached by source content in `CACHE_DIR/feed-translations-zh-v1.json` (default `.cache`). Mount a persistent volume for reuse across deployments. One worker translates batches of 10; failures back off for five minutes and leave original text visible. English mode never requests translations. Saved posts outside the current feed fall back to their original text.
