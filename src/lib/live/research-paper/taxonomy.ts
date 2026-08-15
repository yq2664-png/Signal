export type TaxonomyTopic =
  | "agents"
  | "human-ai-interaction"
  | "generative-ui"
  | "multimodal"
  | "trust-eval"
  | "embodied"
  | "training"
  | "rl"
  | "distillation"
  | "inference"
  | "architecture";

export type TaxonomyMatch = {
  userFacing: TaxonomyTopic[];
  background: TaxonomyTopic[];
  /** Venue capture may union only when this is true. Never publishes. */
  capture: boolean;
};

const USER_FACING: Array<{ topic: TaxonomyTopic; pattern: RegExp }> = [
  {
    topic: "agents",
    pattern:
      /\b(agentic(?:\s+workflow)?|tool use|computer use|multi[- ]agent|long[- ]term memory|memory-centric|planning loop|gui agent)\b/i,
  },
  {
    topic: "human-ai-interaction",
    pattern:
      /\b(human[- ]ai interaction|ai assistant|conversational interface|human[- ]ai collaboration|personalization)\b/i,
  },
  {
    topic: "generative-ui",
    pattern: /\b(generative ui|generative user interface|ui generation)\b/i,
  },
  {
    topic: "multimodal",
    pattern:
      /\b(vision[- ]language|multimodal|voice interface|speech (?:generation|synthesis)|image generation|video generation|audio[- ]visual|audiovisual)\b/i,
  },
  {
    topic: "trust-eval",
    pattern:
      /\b(hallucination|uncertainty|explainability|ai safety|red[- ]teaming|trustworthy ai)\b/i,
  },
  {
    topic: "embodied",
    pattern:
      /\b(embodied ai|human[- ]robot interaction|\bhri\b|spatial interaction|wearable ai)\b/i,
  },
];

const BACKGROUND: Array<{ topic: TaxonomyTopic; pattern: RegExp }> = [
  { topic: "training", pattern: /\b(model training|post[- ]training|fine[- ]tuning|pretraining)\b/i },
  { topic: "rl", pattern: /\b(reinforcement learning|\brlhf\b|\bppo\b)\b/i },
  { topic: "distillation", pattern: /\b(distillation|knowledge distillation)\b/i },
  { topic: "inference", pattern: /\b(inference|speculative decoding|serving)\b/i },
  { topic: "architecture", pattern: /\b(architecture|transformer|mixture[- ]of[- ]experts)\b/i },
];

const AI_CONTEXT =
  /\b(ai|artificial intelligence|llm|language model|foundation model|machine learning|neural|multimodal|agentic|human[- ]ai|robot)\b/i;

export function matchTaxonomy(
  title: string,
  abstract: string,
  options?: { hciVenue?: boolean }
): TaxonomyMatch {
  const text = `${title}\n${abstract}`;
  const userFacing = USER_FACING.filter((item) => item.pattern.test(text)).map(
    (item) => item.topic
  );
  const background = BACKGROUND.filter((item) => item.pattern.test(text)).map(
    (item) => item.topic
  );
  const hciAi =
    Boolean(options?.hciVenue) &&
    AI_CONTEXT.test(text) &&
    /\b(interaction|interface|user experience|assistant|copilot|chatbot|co[- ]design)\b/i.test(
      text
    );
  const capture =
    (userFacing.length > 0 && AI_CONTEXT.test(text)) || hciAi;
  return { userFacing, background, capture };
}
