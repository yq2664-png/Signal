import { cleanProductDescription, hasProductDescription } from "./product-content";
import type { FeedItem } from "@/lib/types";

function prose(text: string): string {
  return text.replace(/https?:\/\/\S+/g, " ").replace(/[#@][\p{L}\p{N}_-]+/gu, " ");
}
const AI_TOPIC = /\b(?:AI|OpenAI|Anthropic|Mistral|LLMs?|GPT(?:-?\d)?|ChatGPT|Claude|Gemini|DeepSeek|Qwen|Llama|Sora|machine learning|artificial intelligence|neural network|diffusion model|coding agent)\b|人工智能|大模型|机器学习|神经网络/i;
const TECH_CONTEXT = /\b(?:model|release|launch|benchmark|evaluation|training|inference|API|SDK|tutorial|how to|coding|developer|research|paper|architecture|open.source|fine.tun\w*|prompt\w*|agent|context window|review|comparison)\b|模型|发布|评测|基准|推理|训练|教程|开发|论文|开源|提示词|智能体/i;

/** A tag or AI-generated entertainment is not evidence of an AI technology update. */
export function isRelevantYouTube(title: string, description: string): boolean {
  const cleanTitle = prose(title);
  return AI_TOPIC.test(cleanTitle) && TECH_CONTEXT.test(`${cleanTitle} ${prose(description)}`);
}

/** Apply on cache reads as well as new crawls so old bad cards cannot survive deployments. */
export function enforceFeedQuality(items: FeedItem[]): FeedItem[] {
  return items.flatMap(item => {
    if (/^(?:discussion\s*[|｜]\s*link|讨论\s*[|｜]\s*链接)\s*$/i.test((item.originalSummary ?? item.summary).trim())) return [];
    if (item.source === "Product Hunt") {
      const description = item.originalSummary ?? item.summary;
      if (!hasProductDescription(item.originalTitle ?? item.title, description)) return [];
      const translations = item.translations ? Object.fromEntries(Object.entries(item.translations).map(([locale, content]) => [locale, {
        ...content, brief: { whatHappened: content.summary, whyItMatters: "", potentialImpact: "", keyTakeaway: "" },
      }])) : undefined;
      return [{ ...item, ...(translations ? { translations } : {}), briefReadiness: "factual-only" as const,
        brief: { whatHappened: cleanProductDescription(description), whyItMatters: "", potentialImpact: "", keyTakeaway: "" } }];
    }
    if (item.source === "YouTube") {
      if (!isRelevantYouTube(item.originalTitle ?? item.title, item.originalSummary ?? item.summary)) return [];
      // Search metadata supplies no transcript or evidence for an Impact Brief.
      return [{ ...item, briefEligible: false, briefReadiness: "none" as const,
        brief: { whatHappened: "", whyItMatters: "", potentialImpact: "", keyTakeaway: "" } }];
    }
    const legacyTemplate = /structured triage template|changes your roadmap, evaluation set|skim the source, then decide/i.test(Object.values(item.brief).join(" "));
    if (!legacyTemplate) return [item];
    return [{ ...item, briefReadiness: "factual-only" as const,
      brief: { whatHappened: item.originalSummary || item.summary || item.originalTitle || item.title,
        whyItMatters: "", potentialImpact: "", keyTakeaway: "" } }];
  });
}
