import { prisma } from "@guild/db";
import { writeAuditLog } from "./audit.service";
import { getGuildMemberByUser } from "./guild.service";
import { broadcastToGuild } from "../lib/socket";
import { ForbiddenError, BadRequestError } from "../utils/errors";
import {
  CUSTOMIZABLE_ROLES,
  DEFAULT_ACTIVITY_POINT_RULES,
  AUDIT_ACTIONS,
  type ActivityPointRules,
  type ActivityPointRule,
} from "@guild/shared";

const OFFICER_ROLES = ["OFFICER", "GUILD_LEADER", "FACTION_LEADER", "ADMIN"];
const MAX_ACTIVITIES = 60;

async function requireActiveMember(guildId: string, actorId: string) {
  const member = await getGuildMemberByUser(actorId, guildId);
  if (!member || !member.isActive) {
    throw new ForbiddenError("You must be an active guild member");
  }
  return member;
}

async function requireOfficer(guildId: string, actorId: string) {
  const member = await requireActiveMember(guildId, actorId);
  if (!OFFICER_ROLES.includes(member.role)) {
    throw new ForbiddenError("Only officers and above can manage activity point rules");
  }
  return member;
}

function defaultMultipliers(): ActivityPointRule["multipliers"] {
  return CUSTOMIZABLE_ROLES.reduce(
    (acc, role) => {
      acc[role] = 1;
      return acc;
    },
    {} as ActivityPointRule["multipliers"],
  );
}

/** Merge stored rules over the seed defaults so a guild with none configured
 *  still sees the preset activity catalog, and any partially-saved row still
 *  has every rank multiplier present. */
export function mergeActivityPointRules(raw: unknown): ActivityPointRules {
  const stored = raw && typeof raw === "object" ? (raw as Partial<ActivityPointRules>) : {};
  if (!Array.isArray(stored.activities) || stored.activities.length === 0) {
    return { activities: DEFAULT_ACTIVITY_POINT_RULES.activities.map((a) => ({ ...a, multipliers: { ...a.multipliers } })) };
  }
  const activities = stored.activities.slice(0, MAX_ACTIVITIES).map((a) => ({
    key: typeof a?.key === "string" && a.key.trim() ? a.key.trim() : `ACTIVITY_${Math.random().toString(36).slice(2, 8)}`,
    label: typeof a?.label === "string" && a.label.trim() ? a.label.trim() : "Activity",
    basePoints: typeof a?.basePoints === "number" && Number.isFinite(a.basePoints) ? a.basePoints : 0,
    multipliers: { ...defaultMultipliers(), ...(a?.multipliers && typeof a.multipliers === "object" ? a.multipliers : {}) },
  }));
  return { activities };
}

export async function getEffectiveActivityPointRules(guildId: string): Promise<ActivityPointRules> {
  const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
  return mergeActivityPointRules(settings?.activityPointRules);
}

export async function getActivityPointRules(guildId: string, actorId: string) {
  await requireActiveMember(guildId, actorId);
  return getEffectiveActivityPointRules(guildId);
}

export async function updateActivityPointRules(
  guildId: string,
  actorId: string,
  rules: ActivityPointRules,
) {
  await requireOfficer(guildId, actorId);

  if (!Array.isArray(rules?.activities)) {
    throw new BadRequestError("Activity list is required");
  }
  if (rules.activities.length > MAX_ACTIVITIES) {
    throw new BadRequestError(`A guild can register at most ${MAX_ACTIVITIES} activities`);
  }

  const merged = mergeActivityPointRules(rules);

  await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId, activityPointRules: merged as object },
    update: { activityPointRules: merged as object },
  });

  await writeAuditLog({
    actorId,
    guildId,
    action: AUDIT_ACTIONS.ACTIVITY_POINT_RULES_UPDATED,
    target: "GuildSettings",
    targetId: guildId,
    detail: { activityCount: merged.activities.length },
  });

  void broadcastToGuild(guildId, "activity_point_rules_updated", { guildId });
  return merged;
}
