// ─── Faction Leader Panel — STUB data & handlers ────────────────
// Design/UI pass only: placeholder data + simulated async handlers.
// No backend wired yet — swap these for real `factionApi` calls later.

export interface FactionSummary {
  id: string;
  name: string;
  tag: string;
  memberGuildCount: number;
  capacity: number;
}

export type DirectoryGuildStatus =
  | "ELIGIBLE"
  | "IN_YOUR_FACTION"
  | "IN_OTHER_FACTION"
  | "INVITE_PENDING";

export interface DirectoryGuild {
  id: string;
  name: string;
  slug: string;
  inviteCode: string;
  avatarUrl: string | null;
  memberCount: number;
  totalCp: number;
  region: string;
  leaderName: string;
  factionName: string | null; // null = independent / no faction
  status: DirectoryGuildStatus;
}

export interface FactionMemberGuild {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  memberCount: number;
  totalCp: number;
  region: string;
  leaderName: string;
  joinedAt: string;
}

export interface PendingGuildInvite {
  id: string;
  guildId: string;
  guildName: string;
  guildSlug: string;
  avatarUrl: string | null;
  memberCount: number;
  leaderName: string;
  sentAt: string;
  expiresAt: string;
}

// ─── Placeholder faction the current leader commands ────────────
export const MY_FACTION: FactionSummary = {
  id: "fac_crimson",
  name: "Crimson Vanguard Alliance",
  tag: "CVA",
  memberGuildCount: 3,
  capacity: 8,
};

// ─── Mock guild directory used by the "Find guild" search ───────
const DIRECTORY: DirectoryGuild[] = [
  {
    id: "gld_ironhold",
    name: "Ironhold Sentinels",
    slug: "ironhold-sentinels",
    inviteCode: "IRON-7K2",
    avatarUrl: null,
    memberCount: 48,
    totalCp: 6_420_000,
    region: "SEA",
    leaderName: "Valken",
    factionName: null,
    status: "ELIGIBLE",
  },
  {
    id: "gld_nightfall",
    name: "Nightfall Covenant",
    slug: "nightfall-covenant",
    inviteCode: "NGHT-913",
    avatarUrl: null,
    memberCount: 52,
    totalCp: 7_980_000,
    region: "SEA",
    leaderName: "Mireille",
    factionName: null,
    status: "ELIGIBLE",
  },
  {
    id: "gld_stormpeak",
    name: "Stormpeak Marauders",
    slug: "stormpeak-marauders",
    inviteCode: "STRM-44A",
    avatarUrl: null,
    memberCount: 39,
    totalCp: 5_110_000,
    region: "EU",
    leaderName: "Aldric",
    factionName: "Azure Pact",
    status: "IN_OTHER_FACTION",
  },
  {
    id: "gld_emberwatch",
    name: "Emberwatch Legion",
    slug: "emberwatch-legion",
    inviteCode: "EMBR-08F",
    avatarUrl: null,
    memberCount: 44,
    totalCp: 6_730_000,
    region: "SEA",
    leaderName: "Sora",
    factionName: "Crimson Vanguard Alliance",
    status: "IN_YOUR_FACTION",
  },
  {
    id: "gld_gilded",
    name: "Gilded Phoenix",
    slug: "gilded-phoenix",
    inviteCode: "GILD-220",
    avatarUrl: null,
    memberCount: 31,
    totalCp: 4_050_000,
    region: "NA",
    leaderName: "Calliope",
    factionName: null,
    status: "INVITE_PENDING",
  },
  {
    id: "gld_voidborne",
    name: "Voidborne Order",
    slug: "voidborne-order",
    inviteCode: "VOID-55X",
    avatarUrl: null,
    memberCount: 57,
    totalCp: 9_240_000,
    region: "SEA",
    leaderName: "Ravenna",
    factionName: null,
    status: "ELIGIBLE",
  },
];

const MEMBER_GUILDS: FactionMemberGuild[] = [
  {
    id: "gld_emberwatch",
    name: "Emberwatch Legion",
    slug: "emberwatch-legion",
    avatarUrl: null,
    memberCount: 44,
    totalCp: 6_730_000,
    region: "SEA",
    leaderName: "Sora",
    joinedAt: "2026-03-12T08:00:00.000Z",
  },
  {
    id: "gld_tidecallers",
    name: "Tidecaller Syndicate",
    slug: "tidecaller-syndicate",
    avatarUrl: null,
    memberCount: 41,
    totalCp: 6_010_000,
    region: "SEA",
    leaderName: "Doran",
    joinedAt: "2026-04-02T08:00:00.000Z",
  },
  {
    id: "gld_ashen",
    name: "Ashen Wardens",
    slug: "ashen-wardens",
    avatarUrl: null,
    memberCount: 36,
    totalCp: 5_240_000,
    region: "SEA",
    leaderName: "Kaelis",
    joinedAt: "2026-05-19T08:00:00.000Z",
  },
];

let PENDING_INVITES: PendingGuildInvite[] = [
  {
    id: "inv_gilded",
    guildId: "gld_gilded",
    guildName: "Gilded Phoenix",
    guildSlug: "gilded-phoenix",
    avatarUrl: null,
    memberCount: 31,
    leaderName: "Calliope",
    sentAt: "2026-06-18T10:30:00.000Z",
    expiresAt: "2026-06-25T10:30:00.000Z",
  },
];

// ─── Validation ─────────────────────────────────────────────────
const CODE_PATTERN = /^[A-Z0-9]{3,5}-?[A-Z0-9]{2,4}$/i;

export interface QueryValidation {
  valid: boolean;
  error: string | null;
  normalized: string;
}

/** Validate a "find guild" query (guild name, slug, or invite code). */
export function validateGuildQuery(raw: string): QueryValidation {
  const normalized = raw.trim();

  if (normalized.length === 0) {
    return { valid: false, error: "Enter a guild name or invite code to search.", normalized };
  }
  if (normalized.length < 2) {
    return { valid: false, error: "Search needs at least 2 characters.", normalized };
  }
  if (normalized.length > 40) {
    return { valid: false, error: "Search query is too long (40 characters max).", normalized };
  }
  return { valid: true, error: null, normalized };
}

/** Whether a query string looks like an invite code rather than free text. */
export function looksLikeInviteCode(query: string): boolean {
  return CODE_PATTERN.test(query.trim());
}

// ─── Simulated async handlers ───────────────────────────────────
function delay<T>(value: T, ms = 650): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Search the directory by name, slug, or exact invite code. */
export async function searchGuilds(rawQuery: string): Promise<DirectoryGuild[]> {
  const { normalized } = validateGuildQuery(rawQuery);
  const q = normalized.toLowerCase();

  const matches = DIRECTORY.filter((g) => {
    if (g.inviteCode.toLowerCase() === q) return true; // exact code match
    return (
      g.name.toLowerCase().includes(q) ||
      g.slug.toLowerCase().includes(q) ||
      g.leaderName.toLowerCase().includes(q)
    );
  });

  // Reflect any invites sent during this session.
  const withLiveStatus = matches.map((g) =>
    PENDING_INVITES.some((inv) => inv.guildId === g.id)
      ? { ...g, status: "INVITE_PENDING" as const }
      : g,
  );

  return delay(withLiveStatus);
}

export async function getFactionMemberGuilds(): Promise<FactionMemberGuild[]> {
  return delay([...MEMBER_GUILDS], 500);
}

export async function getPendingInvites(): Promise<PendingGuildInvite[]> {
  return delay([...PENDING_INVITES], 500);
}

/** Send an invitation to a guild. Returns the created pending invite. */
export async function sendGuildInvite(
  guild: DirectoryGuild,
): Promise<{ invite: PendingGuildInvite }> {
  const invite: PendingGuildInvite = {
    id: `inv_${guild.id}_${Date.now()}`,
    guildId: guild.id,
    guildName: guild.name,
    guildSlug: guild.slug,
    avatarUrl: guild.avatarUrl,
    memberCount: guild.memberCount,
    leaderName: guild.leaderName,
    sentAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  PENDING_INVITES = [invite, ...PENDING_INVITES];
  return delay({ invite }, 800);
}

export async function cancelInvite(inviteId: string): Promise<{ success: boolean }> {
  PENDING_INVITES = PENDING_INVITES.filter((inv) => inv.id !== inviteId);
  return delay({ success: true }, 500);
}

// ─── Display helpers ────────────────────────────────────────────
export function formatCp(cp: number): string {
  if (cp >= 1_000_000) return `${(cp / 1_000_000).toFixed(2)}M`;
  if (cp >= 1_000) return `${(cp / 1_000).toFixed(1)}K`;
  return `${cp}`;
}

export const STATUS_META: Record<
  DirectoryGuildStatus,
  { label: string; tone: string; canInvite: boolean }
> = {
  ELIGIBLE: {
    label: "Eligible",
    tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    canInvite: true,
  },
  IN_YOUR_FACTION: {
    label: "Already in your faction",
    tone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    canInvite: false,
  },
  IN_OTHER_FACTION: {
    label: "In another faction",
    tone: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    canInvite: false,
  },
  INVITE_PENDING: {
    label: "Invite pending",
    tone: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    canInvite: false,
  },
};
