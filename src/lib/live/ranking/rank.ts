import type { FeedItem } from "@/lib/types";
import { assignAttentionClass, isBreakingSupply } from "@/lib/live/ranking/attention";
import {
  assignBusinessTier,
  impactOf,
  noveltyOf,
  type BusinessTier,
} from "@/lib/live/ranking/business-tier";
import {
  ATTENTION_WINDOW,
  MAX_CONSECUTIVE_ROLE,
  ROLE_SEED_ORDER,
  type AttentionClass,
  type FeedRole,
  type RankingLabel,
} from "@/lib/live/ranking/config";
import { organizationOf, topicOf } from "@/lib/live/ranking/identity";
import { assignRole, isDisqualified } from "@/lib/live/ranking/role";

export type RankingAnnotation = {
  id: string;
  role: FeedRole;
  attentionClass: AttentionClass;
  organization: string;
  topic: string;
  breaking: boolean;
  businessTier?: BusinessTier;
  label: RankingLabel;
  reason: string;
  diversityRules: string[];
  preferenceShift?: number;
};

export type RankedFeed = {
  items: FeedItem[];
  annotations: RankingAnnotation[];
};

type Candidate = {
  item: FeedItem;
  role: FeedRole;
  attentionClass: AttentionClass;
  organization: string;
  topic: string;
  breaking: boolean;
  businessTier?: BusinessTier;
  publishedAt: number;
};

function labelFor(role: FeedRole, attentionClass: AttentionClass): RankingLabel {
  if (role === "SUPPLY" && attentionClass === "HIGH") return "High Impact";
  if (role === "CAPABILITY" && attentionClass === "HIGH") return "New Capability";
  if (role === "ADOPTION") return "Developer Signal";
  return "Trending";
}

function reasonFor(candidate: Candidate): string {
  if (candidate.businessTier === "T1") {
    return "T1 Supply: a foundation model became available.";
  }
  if (candidate.businessTier === "T2") {
    return "T2 Supply: a first-party AI product became available.";
  }
  if (candidate.role === "SUPPLY") {
    return "Supply: a qualified official launch, not a frontier event.";
  }
  if (candidate.role === "CAPABILITY") {
    return "Capability: a product-relevant research finding.";
  }
  if (candidate.role === "ADOPTION") {
    return "Adoption: a qualified developer community signal.";
  }
  return "Background connector.";
}

export function annotateItem(item: FeedItem): Candidate {
  const role = assignRole(item);
  const attentionClass = assignAttentionClass(item);
  const businessTier = assignBusinessTier(item);
  return {
    item,
    role,
    attentionClass,
    organization: organizationOf(item),
    topic: topicOf(item),
    breaking: isBreakingSupply(item),
    businessTier,
    publishedAt: new Date(item.publishedAt).getTime() || 0,
  };
}

function compareEligible(left: Candidate, right: Candidate): number {
  if (right.publishedAt !== left.publishedAt) {
    return right.publishedAt - left.publishedAt;
  }
  if (left.businessTier && right.businessTier) {
    const impactDiff = impactOf(right.item) - impactOf(left.item);
    if (impactDiff !== 0) return impactDiff;
    const noveltyDiff = noveltyOf(right.item) - noveltyOf(left.item);
    if (noveltyDiff !== 0) return noveltyDiff;
  }
  return left.item.id.localeCompare(right.item.id);
}

function consecutiveRoleCount(picked: Candidate[]): number {
  if (picked.length === 0) return 0;
  const role = picked[picked.length - 1].role;
  let count = 0;
  for (let index = picked.length - 1; index >= 0; index -= 1) {
    if (picked[index].role !== role) break;
    count += 1;
  }
  return count;
}

function classRank(attentionClass: AttentionClass): number {
  if (attentionClass === "HIGH") return 3;
  if (attentionClass === "MEDIUM") return 2;
  return 1;
}

function preferSupplyTier(eligible: Candidate[]): Candidate[] {
  const t1 = eligible.filter((item) => item.businessTier === "T1");
  if (t1.length > 0) return t1;
  const t2 = eligible.filter((item) => item.businessTier === "T2");
  if (t2.length > 0) return t2;
  return eligible;
}

function selectNext(
  remaining: Candidate[],
  picked: Candidate[],
  inWindow: boolean
): Candidate | undefined {
  if (remaining.length === 0) return undefined;
  const bestClass = remaining.reduce(
    (max, item) => Math.max(max, classRank(item.attentionClass)),
    0
  );
  let eligible = remaining.filter(
    (item) => classRank(item.attentionClass) === bestClass
  );

  const last = picked[picked.length - 1];
  if (last) {
    const differentOrg = eligible.filter(
      (item) => item.organization !== last.organization
    );
    if (differentOrg.length > 0) eligible = differentOrg;
  }

  if (inWindow && consecutiveRoleCount(picked) >= MAX_CONSECUTIVE_ROLE && last) {
    const otherRole = eligible.filter((item) => item.role !== last.role);
    if (otherRole.length > 0) {
      eligible = otherRole;
    } else {
      const breakingSame = eligible.filter(
        (item) => item.role === last.role && item.breaking
      );
      if (breakingSame.length > 0) eligible = breakingSame;
    }
  }

  if (last) {
    const otherTopic = eligible.filter((item) => item.topic !== last.topic);
    if (otherTopic.length > 0) eligible = otherTopic;
  }

  if (inWindow) {
    const counts = new Map<FeedRole, number>();
    for (const item of picked) {
      if (item.role === "BACKGROUND") continue;
      counts.set(item.role, (counts.get(item.role) ?? 0) + 1);
    }
    const missing = ROLE_SEED_ORDER.filter(
      (role) => (counts.get(role) ?? 0) === 0
    );
    const fillMissing = eligible.filter((item) => missing.includes(item.role));
    if (fillMissing.length > 0) {
      const seedRole = ROLE_SEED_ORDER.find((role) =>
        fillMissing.some((item) => item.role === role)
      );
      eligible = seedRole
        ? fillMissing.filter((item) => item.role === seedRole)
        : fillMissing;
      if (seedRole === "SUPPLY") {
        eligible = preferSupplyTier(eligible);
      }
    } else {
      eligible = preferSupplyTier(eligible);
    }
  }

  if (picked.length === 0) {
    eligible = preferSupplyTier(eligible);
  }

  return [...eligible].sort(compareEligible)[0];
}

function diversityRulesFor(
  candidate: Candidate,
  picked: Candidate[],
  inWindow: boolean
): string[] {
  const rules: string[] = [];
  const last = picked[picked.length - 1];
  if (picked.length === 0 && candidate.businessTier === "T1") {
    rules.push("t1-seat");
  }
  if (last && candidate.organization !== last.organization) {
    rules.push("org-spacing");
  }
  if (last && candidate.topic !== last.topic) {
    rules.push("topic-spacing");
  }
  if (
    inWindow &&
    consecutiveRoleCount(picked) >= MAX_CONSECUTIVE_ROLE &&
    last &&
    candidate.role !== last.role
  ) {
    rules.push("max-2-consecutive-role");
  }
  if (
    inWindow &&
    consecutiveRoleCount(picked) >= MAX_CONSECUTIVE_ROLE &&
    last &&
    candidate.role === last.role &&
    candidate.breaking
  ) {
    rules.push("breaking-override");
  }
  if (inWindow && picked.every((item) => item.role !== candidate.role)) {
    rules.push("skip-empty-seed");
  }
  if (
    inWindow &&
    picked.length > 0 &&
    candidate.businessTier === "T1"
  ) {
    rules.push("t1-prefer");
  }
  if (
    inWindow &&
    picked.length > 0 &&
    candidate.businessTier === "T2"
  ) {
    rules.push("t2-prefer");
  }
  return rules;
}

function toAnnotation(
  candidate: Candidate,
  diversityRules: string[]
): RankingAnnotation {
  return {
    id: candidate.item.id,
    role: candidate.role,
    attentionClass: candidate.attentionClass,
    organization: candidate.organization,
    topic: candidate.topic,
    breaking: candidate.breaking,
    businessTier: candidate.businessTier,
    label: labelFor(candidate.role, candidate.attentionClass),
    reason: reasonFor(candidate),
    diversityRules,
  };
}

export function rankUnifiedFeed(
  items: FeedItem[],
  options?: { window?: number }
): RankedFeed {
  const window = options?.window ?? ATTENTION_WINDOW;
  const qualified: Candidate[] = [];
  const excluded: Candidate[] = [];
  for (const item of items) {
    const candidate = annotateItem(item);
    if (isDisqualified(item)) excluded.push(candidate);
    else qualified.push(candidate);
  }

  const remaining = [...qualified];
  const picked: Candidate[] = [];
  const annotations: RankingAnnotation[] = [];

  while (remaining.length > 0) {
    const inWindow = picked.length < window;
    const next = selectNext(remaining, picked, inWindow);
    if (!next) break;
    annotations.push(toAnnotation(next, diversityRulesFor(next, picked, inWindow)));
    picked.push(next);
    const index = remaining.findIndex((item) => item.item.id === next.item.id);
    if (index >= 0) remaining.splice(index, 1);
  }

  for (const candidate of excluded) {
    annotations.push({
      ...toAnnotation(candidate, ["disqualified-excluded"]),
      attentionClass: "BACKGROUND",
      reason: "Watch / BORDERLINE / FAIL is never promoted into the Feed window.",
    });
    picked.push(candidate);
  }

  return {
    items: picked.map((item) => item.item),
    annotations,
  };
}
