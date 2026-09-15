import type {
  ResearchPaperGateReason,
  ResearchPaperRelevanceCue,
} from "@/lib/types";
import {
  matchTaxonomy,
  type TaxonomyTopic,
} from "@/lib/live/research-paper/taxonomy";

export const THEORY_CUE =
  /\b(calibration dimension|convex calibration|jaccard measure|m[oö]bius inversion|vc class(?:es)?|sample complexity|hypothesis class|brier score|online boosting|weak-to-strong|rademacher|pac[- ]learn|generalization bound|learning theory|affine dimension|minhash gram)\b/i;

export const USER_OR_INTERFACE_CUE =
  /\b(users?|people with|disabilit(?:y|ies)|digital products?|interface|multi[- ]session|conversation(?:s|al)?|video editing|speech|voice|avatar|protection mechanisms?)\b/i;

export const INFRA_CUE =
  /\b(speculative decoding|draft tokens?|draft trees?|kv cache|serving stack|inference accelerat|losslessly accelerat|kernel fusion)\b/i;

export const SMALL_MODEL_REPORT_CUE =
  /\b(1[- ]?billion[- ]parameter|1b parameters?|trained from scratch|permissible post-training|pretraining corpus|pedagogically controlled)\b/i;

/** Narrow product-experience phrases (original R4). These can exempt a paper from R3. */
export const EXPERIENCE_CUES: Array<{
  cue: ResearchPaperRelevanceCue;
  pattern: RegExp;
}> = [
  {
    cue: "Agent memory",
    pattern:
      /\b(long[- ]term memory|memory-centric|multi[- ]session dialogues?)\b/i,
  },
  {
    cue: "Video",
    pattern: /\b(video editing|open[- ]ended video)\b/i,
  },
  {
    cue: "Voice",
    pattern:
      /\b(long[- ]form speech|multiple speakers|speech synthes(?:is|ize)|multi[- ]speaker)\b/i,
  },
  {
    cue: "Multimodal",
    pattern: /\b(audio[- ]visual|audiovisual|temporally synchronized)\b/i,
  },
  {
    cue: "Agents",
    pattern:
      /\b(person[- ]grounded|human expertise|expert (?:knowledge|traces)|ai skill generation)\b/i,
  },
  {
    cue: "HCI",
    pattern:
      /\b(people with disabilit|social virtual reality|ableist|protection mechanisms?|co[- ]design(?:ed|ing)?)\b/i,
  },
  {
    cue: "Eval",
    pattern:
      /\b(simulated[- ]user|persona agents?|digital products)\b/i,
  },
];

const TAXONOMY_TO_CUE: Partial<Record<TaxonomyTopic, ResearchPaperRelevanceCue>> =
  {
    agents: "Agents",
    "human-ai-interaction": "HCI",
    "generative-ui": "Generative UI",
    multimodal: "Multimodal",
    "trust-eval": "Trust",
    embodied: "Embodied",
  };

export const IMPLICATION_CUE =
  /\b(production[- ]ready|digital products?|multi[- ]session|people with disabilit|protection mechanisms?|real[- ]time.{0,48}editing|long[- ]form speech|synchronized audiovisual|human expertise|simulated[- ]user|testing AI systems and digital products)\b/i;

export const RESEARCHER_ONLY_CUE =
  /\b(ai scientists?|research workflows?|hypothesis generation|manuscript preparation|pretraining corpus|formally verified|machine[- ]checked|meta[- ]harness|harness system|world models?|aaa games)\b/i;

export type GateDecision = {
  publish: boolean;
  passCandidate: boolean;
  reason?: ResearchPaperGateReason;
  cue?: ResearchPaperRelevanceCue;
  /** R5: product-implication tag. Not a publish kill switch. */
  productImplication?: boolean;
};

function haystack(title: string, abstract: string): string {
  return `${title}\n${abstract}`;
}

export function isBenchmarkContribution(title: string, abstract: string): boolean {
  if (/bench/i.test(title)) return true;
  return /\bwe (?:introduce|present|propose)\b[\s\S]{0,80}\bbenchmark\b/i.test(
    abstract
  );
}

export function matchExperienceCue(
  title: string,
  abstract: string
): ResearchPaperRelevanceCue | undefined {
  const text = haystack(title, abstract);
  return EXPERIENCE_CUES.find((item) => item.pattern.test(text))?.cue;
}

export function matchTaxonomyCue(
  title: string,
  abstract: string
): ResearchPaperRelevanceCue | undefined {
  const match = matchTaxonomy(title, abstract);
  for (const topic of match.userFacing) {
    const cue = TAXONOMY_TO_CUE[topic];
    if (cue) return cue;
  }
  return undefined;
}

export function qualifyResearchPaper(
  title: string,
  abstract: string
): GateDecision {
  const text = haystack(title, abstract);
  const narrowExperience = matchExperienceCue(title, abstract);
  const taxonomyExperience = matchTaxonomyCue(title, abstract);
  const experience = narrowExperience ?? taxonomyExperience;

  if (THEORY_CUE.test(text) && !USER_OR_INTERFACE_CUE.test(text)) {
    return { publish: false, passCandidate: false, reason: "r1-theory" };
  }

  if (INFRA_CUE.test(text) && !experience) {
    return { publish: false, passCandidate: false, reason: "r2-infra" };
  }

  // Benchmarks / small-model reports still need a narrow product cue, not just
  // a taxonomy word like "multimodal" in the title.
  if (
    (isBenchmarkContribution(title, abstract) ||
      SMALL_MODEL_REPORT_CUE.test(text)) &&
    !narrowExperience
  ) {
    return { publish: false, passCandidate: false, reason: "r3-incremental" };
  }

  if (!experience) {
    return { publish: false, passCandidate: false, reason: "r6-else" };
  }

  const productImplication =
    IMPLICATION_CUE.test(text) && !RESEARCHER_ONLY_CUE.test(text);

  return {
    publish: true,
    passCandidate: true,
    cue: experience,
    productImplication,
  };
}
