import type { Source } from "@/lib/types";

/**
 * Rewrite raw feed titles into scannable headlines.
 * Never leave bare repo paths or version tags as the card title.
 */
export function rewriteFeedTitle(input: {
  title: string;
  summary?: string;
  source: Source;
  repoName?: string;
}): string {
  const rawTitle = collapseWs(input.title);
  const summary = collapseWs(input.summary ?? "");
  const repo = input.repoName?.trim();

  if (repo) {
    return rewriteRepoHeadline(repo, rawTitle, summary);
  }

  // GitHub release tags like "v1.0.0" / "Release 0.2"
  if (isVersionTag(rawTitle)) {
    const fromSummary = firstSentence(summary, 110);
    if (fromSummary && !isVersionTag(fromSummary)) {
      return ensureHeadline(`${input.source}: ${fromSummary}`);
    }
    return ensureHeadline(`${input.source} ships a new model release`);
  }

  let title = stripBoilerplate(rawTitle);

  // Prefer a sharper first sentence from summary when title is vague/short
  if (title.length < 28 || isVagueTitle(title)) {
    const fromSummary = firstSentence(summary, 110);
    if (fromSummary && fromSummary.length > title.length) {
      title = fromSummary;
    }
  }

  title = firstSentence(title, 118) || title;
  return ensureHeadline(title);
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function isVersionTag(s: string): boolean {
  return /^v?\d+(\.\d+){1,3}([-._a-z0-9]*)?$/i.test(s.trim());
}

function isVagueTitle(s: string): boolean {
  return /^(release notes?|changelog|update|news|blog|readme)$/i.test(s.trim());
}

function stripBoilerplate(s: string): string {
  return s
    .replace(/\s*[\|–—-]\s*(Official Blog|Blog|Newsroom|News)\s*$/i, "")
    .replace(/^(Release notes from|Release:)\s+/i, "")
    .trim();
}

function firstSentence(s: string, max: number): string {
  if (!s) return "";
  let core = s;
  const cut = core.search(/[.!?]/);
  if (cut >= 24 && cut <= max) core = core.slice(0, cut);
  else if (core.length > max) {
    core = core.slice(0, max - 1).replace(/\s+\S*$/, "").trimEnd() + "…";
  }
  return core.replace(/\.+$/, "").trim();
}

function ensureHeadline(s: string): string {
  const t = collapseWs(s);
  if (!t) return "AI update";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function humanizeRepoSlug(slug: string): string {
  return slug
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (["ai", "llm", "gpt", "ml", "nlp", "rag", "ui", "api", "sdk", "vl"].includes(lower)) {
        return lower.toUpperCase();
      }
      if (word.length <= 2) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function rewriteRepoHeadline(
  fullName: string,
  title: string,
  description: string
): string {
  const slug = fullName.split("/").pop() || fullName;
  const project = humanizeRepoSlug(slug);
  const desc = description || (!isVersionTag(title) ? title : "");

  if (!desc || isVersionTag(desc)) {
    return `${project}: notable open-source AI project trending on GitHub`;
  }

  let core = firstSentence(desc, 100);
  if (!core) {
    return `${project}: notable open-source AI project trending on GitHub`;
  }

  const lower = core.toLowerCase();
  if (
    lower === slug.toLowerCase() ||
    lower === fullName.toLowerCase() ||
    lower === project.toLowerCase()
  ) {
    return `${project} sees fresh high-signal activity on GitHub`;
  }

  // Lead with what it is, not the repo path
  if (
    core.length < 48 &&
    !/^(the|a|an|building|open|new|an?\s)/i.test(core)
  ) {
    return ensureHeadline(`${project} — ${core}`);
  }

  // Avoid starting with "A library for" noise without project name
  if (/^(a|an|the)\s+(library|toolkit|framework|tool)\b/i.test(core)) {
    return ensureHeadline(`${project}: ${core}`);
  }

  return ensureHeadline(core);
}
