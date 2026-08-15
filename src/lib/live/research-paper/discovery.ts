import {
  RESEARCH_PAPER_USER_AGENT,
} from "@/lib/live/research-paper/config";
import { TRUSTED_VENUES } from "@/lib/live/research-paper/venues";

export type DiscoveredVenue = {
  sourceId: string;
  displayName: string;
  works: number;
  inSeed: boolean;
  seedTier?: string;
  discoverySource: "openalex" | "semantic-scholar" | "dblp";
};

/**
 * Quarterly offline venue discovery. Not called from the live feed path.
 * Does not promote venues automatically. Scholar ingest remains on HOLD.
 */
export async function runOfflineVenueDiscovery(options?: {
  fromDate?: string;
}): Promise<DiscoveredVenue[]> {
  const fromDate = options?.fromDate ?? twentyFourMonthsAgo();
  const merged = new Map<string, DiscoveredVenue>();
  const sources = await Promise.allSettled([
    discoverOpenAlex(fromDate),
    discoverSemanticScholar(),
    discoverDblp(),
  ]);
  for (const result of sources) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const key = row.displayName.toLowerCase();
      const existing = merged.get(key);
      if (!existing || row.works > existing.works) merged.set(key, row);
    }
  }
  return [...merged.values()].sort((left, right) => right.works - left.works);
}

async function discoverOpenAlex(fromDate: string): Promise<DiscoveredVenue[]> {
  const params = new URLSearchParams({
    filter: `from_publication_date:${fromDate}`,
    search: "human-AI interaction",
    group_by: "primary_location.source.id",
    per_page: "50",
  });
  const response = await fetch(`https://api.openalex.org/works?${params}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": RESEARCH_PAPER_USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`OpenAlex discovery failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    group_by?: Array<{
      key?: string;
      key_display_name?: string;
      count?: number;
    }>;
  };
  return (payload.group_by ?? []).map((row) => {
    const sourceId = (row.key || "").replace("https://openalex.org/", "");
    const seed = matchSeed(row.key_display_name || "", sourceId);
    return {
      sourceId,
      displayName: row.key_display_name || sourceId,
      works: row.count ?? 0,
      inSeed: Boolean(seed),
      seedTier: seed?.tier,
      discoverySource: "openalex" as const,
    };
  });
}

async function discoverSemanticScholar(): Promise<DiscoveredVenue[]> {
  const params = new URLSearchParams({
    query: "human-AI interaction",
    fields: "venue,year",
    limit: "100",
  });
  const response = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": RESEARCH_PAPER_USER_AGENT,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Semantic Scholar discovery failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ venue?: string }>;
  };
  const counts = new Map<string, number>();
  for (const paper of payload.data ?? []) {
    const venue = paper.venue?.trim();
    if (!venue) continue;
    counts.set(venue, (counts.get(venue) ?? 0) + 1);
  }
  return [...counts.entries()].map(([displayName, works]) => {
    const seed = matchSeed(displayName);
    return {
      sourceId: displayName,
      displayName,
      works,
      inSeed: Boolean(seed),
      seedTier: seed?.tier,
      discoverySource: "semantic-scholar" as const,
    };
  });
}

async function discoverDblp(): Promise<DiscoveredVenue[]> {
  const query = "human-AI interaction";
  const url =
    "https://dblp.org/search/publ/api?" +
    new URLSearchParams({ q: query, h: "40", format: "json" });
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": RESEARCH_PAPER_USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`DBLP discovery failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    result?: {
      hits?: {
        hit?: Array<{ info?: { venue?: string } }>;
      };
    };
  };
  const hits = payload.result?.hits?.hit;
  const list = Array.isArray(hits) ? hits : hits ? [hits] : [];
  const counts = new Map<string, number>();
  for (const hit of list) {
    const venue = hit.info?.venue?.trim();
    if (!venue) continue;
    counts.set(venue, (counts.get(venue) ?? 0) + 1);
  }
  return [...counts.entries()].map(([displayName, works]) => {
    const seed = matchSeed(displayName);
    return {
      sourceId: displayName,
      displayName,
      works,
      inSeed: Boolean(seed),
      seedTier: seed?.tier,
      discoverySource: "dblp" as const,
    };
  });
}

function matchSeed(name: string, sourceId?: string) {
  const lower = name.toLowerCase();
  return TRUSTED_VENUES.find(
    (venue) =>
      (sourceId && venue.openAlexSourceId === sourceId) ||
      lower.includes(venue.name.toLowerCase()) ||
      venue.name.toLowerCase().includes(lower)
  );
}

function twentyFourMonthsAgo(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 2);
  return date.toISOString().slice(0, 10);
}
