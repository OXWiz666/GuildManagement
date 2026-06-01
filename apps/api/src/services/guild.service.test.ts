import { describe, it, expect, vi, beforeEach } from "vitest";
import { GuildService } from "./guild.service";
import { IGuildRepository } from "../repositories/guild.repository";
import { IAuditRepository } from "../repositories/audit.repository";
import { ForbiddenError, NotFoundError } from "../utils/errors";

describe("GuildService", () => {
  let mockGuildRepo: IGuildRepository;
  let mockAuditRepo: IAuditRepository;
  let guildService: GuildService;

  beforeEach(() => {
    mockGuildRepo = {
      getGuildById: vi.fn(),
      getMembers: vi.fn(),
      getMemberByUser: vi.fn(),
      getMemberById: vi.fn(),
      updateMemberRole: vi.fn(),
      transferLeadership: vi.fn(),
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      getInviteCode: vi.fn(),
    };

    mockAuditRepo = {
      create: vi.fn(),
    };

    guildService = new GuildService(mockGuildRepo, mockAuditRepo);
  });

  describe("getGuildMembers", () => {
    it("should throw NotFoundError if guild does not exist", async () => {
      vi.mocked(mockGuildRepo.getGuildById).mockResolvedValue(null);

      await expect(guildService.getGuildMembers("invalid-guild")).rejects.toThrow(NotFoundError);
    });

    it("should map and return members with ISO string joinedAt dates", async () => {
      const mockGuild = { id: "guild-1", name: "Alpha", slug: "alpha", description: null, avatarUrl: null, bannerUrl: null, isActive: true, inviteCode: null, createdAt: new Date(), updatedAt: new Date() };
      const mockMembers = [
        {
          id: "member-1",
          userId: "user-1",
          guildId: "guild-1",
          role: "GUILD_LEADER",
          rankName: "Leader",
          ign: "King",
          cp: 10000,
          class: "Warrior",
          weapon: "Sword",
          memberCode: "M-001",
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          isActive: true,
          bidPoints: 0,
          bidPointsLastReset: null,
          user: {
            id: "user-1",
            displayName: "KingArthur",
            email: "king@alpha.com",
            avatarUrl: null,
          },
        },
      ];

      vi.mocked(mockGuildRepo.getGuildById).mockResolvedValue(mockGuild);
      vi.mocked(mockGuildRepo.getMembers).mockResolvedValue(mockMembers);

      const result = await guildService.getGuildMembers("guild-1");

      expect(result).toHaveLength(1);
      const firstResult = result[0]!;
      expect(firstResult.joinedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(firstResult.ign).toBe("King");
      expect(firstResult.user.displayName).toBe("KingArthur");
    });
  });

  describe("updateMemberRole", () => {
    it("should throw ForbiddenError if actor is not a member of the guild", async () => {
      vi.mocked(mockGuildRepo.getMemberByUser).mockResolvedValue(null);

      await expect(
        guildService.updateMemberRole("guild-1", "member-1", "OFFICER", "actor-1"),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should throw ForbiddenError if actor is not the Guild Leader", async () => {
      const mockActor = { id: "actor-member", userId: "actor-1", guildId: "guild-1", role: "OFFICER", rankName: "Officer", joinedAt: new Date(), isActive: true, bidPoints: 0, bidPointsLastReset: null };
      vi.mocked(mockGuildRepo.getMemberByUser).mockResolvedValue(mockActor as any);

      await expect(
        guildService.updateMemberRole("guild-1", "member-1", "CORE_MEMBER", "actor-1"),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should transfer leadership and demote self if newRole is GUILD_LEADER", async () => {
      const mockActor = { id: "actor-member", userId: "actor-1", guildId: "guild-1", role: "GUILD_LEADER", rankName: "Leader", joinedAt: new Date(), isActive: true, bidPoints: 0, bidPointsLastReset: null };
      const mockTarget = {
        id: "target-member",
        userId: "target-1",
        guildId: "guild-1",
        role: "OFFICER",
        rankName: "Officer",
        ign: "Lancelot",
        cp: 9000,
        class: "Paladin",
        weapon: "Spear",
        memberCode: "M-002",
        joinedAt: new Date(),
        isActive: true,
        user: { id: "target-1", displayName: "Lancelot", email: "lance@alpha.com", avatarUrl: null },
      };

      vi.mocked(mockGuildRepo.getMemberByUser).mockResolvedValue(mockActor as any);
      vi.mocked(mockGuildRepo.getMemberById).mockResolvedValue(mockTarget as any);
      vi.mocked(mockGuildRepo.transferLeadership).mockResolvedValue([
        {
          id: "target-member",
          userId: "target-1",
          role: "GUILD_LEADER",
          rankName: "Guild Leader",
          ign: "Lancelot",
          cp: 9000,
          class: "Paladin",
          weapon: "Spear",
          memberCode: "M-002",
          joinedAt: new Date(),
          isActive: true,
          user: { id: "target-1", displayName: "Lancelot", email: "lance@alpha.com", avatarUrl: null },
        },
        null,
      ]);

      const result = await guildService.updateMemberRole("guild-1", "target-member", "GUILD_LEADER", "actor-1");

      expect(result.role).toBe("GUILD_LEADER");
      expect(mockGuildRepo.transferLeadership).toHaveBeenCalledWith(
        "guild-1",
        "target-member",
        "actor-member",
        "GUILD_LEADER",
        "Guild Leader",
        "OFFICER",
        "Officer",
      );

      // Verify two distinct audit logs were created
      expect(mockAuditRepo.create).toHaveBeenCalledTimes(2);
    });
  });
});
