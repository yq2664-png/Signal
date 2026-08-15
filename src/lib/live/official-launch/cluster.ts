import { createHash } from "crypto";
import type { OfficialLaunchOrganizationConfig } from "@/lib/live/official-launch/config";
import type { OfficialLaunchDiagnosticsCollector } from "@/lib/live/official-launch/diagnostics";
import type {
  OfficialLaunchEvent,
  OfficialLaunchSourceRecord,
  QualifiedLaunchRecord,
} from "@/lib/types";

const SOURCE_RANK: Record<OfficialLaunchSourceRecord["sourceType"], number> = {
  "launch-page": 7,
  newsroom: 6,
  blog: 5,
  "developer-docs": 4,
  changelog: 3,
  "official-x": 2,
  external: 1,
};

export function selectPrimarySource(
  records: QualifiedLaunchRecord[]
): QualifiedLaunchRecord {
  return [...records].sort(
    (a, b) =>
      b.authority - a.authority ||
      SOURCE_RANK[b.sourceType] - SOURCE_RANK[a.sourceType] ||
      Number(a.role === "signal") - Number(b.role === "signal") ||
      a.publishedAt.localeCompare(b.publishedAt)
  )[0];
}

function asSource(record: QualifiedLaunchRecord): OfficialLaunchSourceRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    channelId: record.channelId,
    sourceType: record.sourceType,
    authority: record.authority,
    role: record.role,
    title: record.title,
    summary: record.summary,
    originalContent: record.originalContent,
    url: record.url,
    canonicalUrl: record.canonicalUrl,
    publishedAt: record.publishedAt,
    author: record.author,
    imageUrl: record.imageUrl,
  };
}

class UnionFind {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }
  find(index: number): number {
    if (this.parent[index] !== index) {
      this.parent[index] = this.find(this.parent[index]);
    }
    return this.parent[index];
  }
  union(left: number, right: number): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

function makeEventId(
  records: QualifiedLaunchRecord[],
  primary: QualifiedLaunchRecord
): string {
  const namedEntity =
    primary.entities.model ||
    primary.entities.product ||
    primary.canonicalUrl;
  const releaseDay = records
    .map((record) => record.publishedAt.slice(0, 10))
    .sort()[0];
  const identity = [
    primary.organizationId,
    namedEntity.toLowerCase().replace(/[^a-z0-9.-]+/g, ""),
    primary.entities.version?.toLowerCase() || "",
    primary.eventType,
    releaseDay,
    primary.canonicalUrl,
  ].join("|");
  return `official-${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
}

export function clusterLaunchRecords(
  records: QualifiedLaunchRecord[],
  matches: Array<[number, number]>,
  organizations: OfficialLaunchOrganizationConfig[],
  diagnostics?: OfficialLaunchDiagnosticsCollector
): OfficialLaunchEvent[] {
  const unions = new UnionFind(records.length);
  matches.forEach(([left, right]) => unions.union(left, right));
  const components = new Map<number, QualifiedLaunchRecord[]>();
  records.forEach((record, index) => {
    const root = unions.find(index);
    components.set(root, [...(components.get(root) ?? []), record]);
  });

  return [...components.values()].flatMap((component) => {
    const primary = selectPrimarySource(component);
    const organization = organizations.find(
      (candidate) => candidate.organizationId === primary.organizationId
    );
    if (!organization) return [];
    const ranked = [...component].sort((a, b) => b.authority - a.authority);
    const entity = (key: "product" | "model" | "version") =>
      ranked.map((record) => record.entities[key]).find(Boolean);

    const event: OfficialLaunchEvent = {
      eventId: makeEventId(component, primary),
      organizationId: organization.organizationId,
      organizationName: organization.displayName,
      tier: organization.tier,
      eventType: primary.eventType,
      title: primary.title,
      summary: primary.summary,
      publishedAt: component.map((record) => record.publishedAt).sort()[0],
      entities: {
        company: organization.displayName,
        product: entity("product"),
        model: entity("model"),
        version: entity("version"),
      },
      capabilities: [...new Set(component.flatMap((record) => record.capabilities))],
      qualificationScore: Math.max(...component.map((record) => record.qualificationScore)),
      noveltyScore: Math.max(...component.map((record) => record.noveltyScore)),
      impactScore: Math.max(...component.map((record) => record.impactScore)),
      confidence: Math.max(...component.map((record) => record.confidence)),
      primarySource: asSource(primary),
      sources: ranked.map(asSource),
    };
    component
      .filter((record) => record.id !== primary.id)
      .forEach((record) =>
        diagnostics?.record({
          candidateId: record.id,
          organizationId: record.organizationId,
          channelId: record.channelId,
          title: record.title,
          url: record.url,
          stage: "cluster",
          status: "merged",
          reason: "semantic-merge",
          method: "deterministic",
          targetId: event.eventId,
        })
      );
    return [event];
  });
}
