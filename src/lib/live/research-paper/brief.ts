import type { ImpactBrief, ResearchPaper, ResearchPaperRelevanceCue } from "@/lib/types";

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 40);
}

export function extractFinding(title: string, abstract: string): string {
  const claim = sentences(abstract).find((sentence) =>
    /\b(we (?:introduce|present|propose|therefore introduce)|this report presents|our method)\b/i.test(
      sentence
    )
  );
  if (claim) return claim.slice(0, 240);
  const first = sentences(abstract)[0];
  if (first && !/\b(have demonstrated|in recent years|large language models \(llms\) have)\b/i.test(first)) {
    return first.slice(0, 240);
  }
  return title;
}

function maturityOf(paper: ResearchPaper): string {
  if (paper.demoUrl) return "demo available";
  if (paper.githubUrl) return "code available";
  return "preprint; maturity unproven";
}

const WHY: Record<ResearchPaperRelevanceCue, string> = {
  "Agent memory":
    "Multi-session products break when the model cannot remember what happened last time.",
  Agents:
    "Agent products need a way to carry a person's judgment, not only complete isolated tasks.",
  Voice: "Long-form, multi-speaker speech changes what a voice interface can be.",
  Video: "Real-time open-ended editing is a new interaction, not a batch render job.",
  Multimodal:
    "Silent video generation is incomplete once picture and sound must stay together.",
  HCI: "Safety and identity features have to be designed with the people they affect.",
  Eval: "Product teams can test experiences against diverse simulated users before a live study.",
};

const IMPACT: Record<ResearchPaperRelevanceCue, string> = {
  "Agent memory":
    "Assistants and agents can stay consistent across days instead of restarting every session.",
  Agents:
    "A skill can package how an expert works, then be reused in other agent workflows.",
  Voice: "Products can hold a long conversation or narrative in one generated voice track.",
  Video: "Editors can steer a video while it is being generated, without a fixed duration.",
  Multimodal:
    "Video products can ship picture and sound as one synchronized generation.",
  HCI: "Social and spatial products can add protection that disabled users would actually use.",
  Eval: "PMs can run persona-scale product tests that offline benchmarks flatten away.",
};

export function makeResearchPaperBrief(
  paper: ResearchPaper,
  cue?: ResearchPaperRelevanceCue
): ImpactBrief {
  const finding = extractFinding(paper.title, paper.abstract);
  const maturity = maturityOf(paper);

  return {
    whatHappened: finding,
    whyItMatters: cue
      ? WHY[cue]
      : "The abstract names a capability a product team may need to respond to.",
    potentialImpact: cue
      ? IMPACT[cue]
      : "Review whether this capability changes an experience you already ship.",
    keyTakeaway: cue
      ? `${cue}: ${finding.slice(0, 140)} (${maturity}).`
      : `${finding.slice(0, 160)} (${maturity}).`,
  };
}
