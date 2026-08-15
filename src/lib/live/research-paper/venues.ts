export type VenueTier = "A" | "B" | "candidate";

export type VenueConfig = {
  id: string;
  name: string;
  tier: VenueTier;
  openAlexSourceId?: string;
  dblpStream?: string;
  anthologyPattern?: RegExp;
  mixedDomain?: boolean;
};

/** Frozen V1.1 Trusted Venue Pool. Candidate venues are never auto-captured. */
export const TRUSTED_VENUES: VenueConfig[] = [
  { id: "neurips", name: "NeurIPS", tier: "A", dblpStream: "streams/conf/nips" },
  { id: "icml", name: "ICML", tier: "A", dblpStream: "streams/conf/icml" },
  { id: "iclr", name: "ICLR", tier: "A", dblpStream: "streams/conf/iclr" },
  {
    id: "acl",
    name: "ACL",
    tier: "A",
    dblpStream: "streams/conf/acl",
    anthologyPattern: /annual meeting of the association for computational linguistics|\bacl\b/i,
  },
  {
    id: "emnlp",
    name: "EMNLP",
    tier: "A",
    dblpStream: "streams/conf/emnlp",
    anthologyPattern: /empirical methods in natural language processing|\bemnlp\b/i,
  },
  { id: "cvpr", name: "CVPR", tier: "A", dblpStream: "streams/conf/cvpr" },
  { id: "iccv", name: "ICCV", tier: "A", dblpStream: "streams/conf/iccv" },
  { id: "eccv", name: "ECCV", tier: "A", dblpStream: "streams/conf/eccv" },
  { id: "chi", name: "CHI", tier: "A", dblpStream: "streams/conf/chi" },
  { id: "uist", name: "UIST", tier: "A", dblpStream: "streams/conf/uist" },
  { id: "cscw", name: "CSCW", tier: "A", dblpStream: "streams/conf/cscw" },
  { id: "rss", name: "RSS", tier: "A", dblpStream: "streams/conf/rss" },
  {
    id: "nmi",
    name: "Nature Machine Intelligence",
    tier: "A",
    openAlexSourceId: "S2912241403",
  },
  {
    id: "tochi",
    name: "TOCHI",
    tier: "A",
    openAlexSourceId: "S89276529",
  },
  { id: "aaai", name: "AAAI", tier: "B", dblpStream: "streams/conf/aaai" },
  { id: "ijcai", name: "IJCAI", tier: "B", dblpStream: "streams/conf/ijcai" },
  { id: "icra", name: "ICRA", tier: "B", dblpStream: "streams/conf/icra" },
  {
    id: "nature",
    name: "Nature",
    tier: "B",
    openAlexSourceId: "S137773608",
    mixedDomain: true,
  },
  {
    id: "science",
    name: "Science",
    tier: "B",
    openAlexSourceId: "S3880285",
    mixedDomain: true,
  },
  {
    id: "nhb",
    name: "Nature Human Behaviour",
    tier: "B",
    openAlexSourceId: "S2764866340",
    mixedDomain: true,
  },
  {
    id: "tpami",
    name: "TPAMI",
    tier: "B",
    openAlexSourceId: "S199944782",
  },
  {
    id: "hci-journal",
    name: "Human–Computer Interaction",
    tier: "B",
    openAlexSourceId: "S2481449237",
  },
  {
    id: "ijhcs",
    name: "IJHCS",
    tier: "B",
    openAlexSourceId: "S4210190811",
  },
  { id: "iros", name: "IROS", tier: "candidate" },
  { id: "jmlr", name: "JMLR", tier: "candidate" },
  { id: "ai-journal", name: "Artificial Intelligence", tier: "candidate" },
  { id: "tnnls", name: "TNNLS", tier: "candidate" },
  { id: "iui", name: "IUI", tier: "candidate" },
  { id: "hri", name: "HRI", tier: "candidate" },
  { id: "corl", name: "CoRL", tier: "candidate" },
  { id: "colm", name: "COLM", tier: "candidate" },
  { id: "facct", name: "FAccT", tier: "candidate" },
  { id: "dis", name: "DIS", tier: "candidate" },
  { id: "naacl", name: "NAACL", tier: "candidate" },
  { id: "tacl", name: "TACL", tier: "candidate" },
];

export function monitoredVenues(): VenueConfig[] {
  return TRUSTED_VENUES.filter((venue) => venue.tier === "A" || venue.tier === "B");
}

export function candidateVenues(): VenueConfig[] {
  return TRUSTED_VENUES.filter((venue) => venue.tier === "candidate");
}

export function venueById(id: string): VenueConfig | undefined {
  return TRUSTED_VENUES.find((venue) => venue.id === id);
}
