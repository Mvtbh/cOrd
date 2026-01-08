import {
  Guild,
  GuildAuditLogsEntry,
  User,
  GuildMember,
  Role,
  Invite,
  GuildEmoji,
  AuditLogEvent,
  GuildChannel,
} from "discord.js";

export class AuditLogHelper {
  private static cache = new Map<
    string,
    { entry: GuildAuditLogsEntry; timestamp: number }
  >();
  private static readonly CACHE_TTL = 5000;

  static async fetchTarget(
    entry: GuildAuditLogsEntry,
    guild: Guild
  ): Promise<
    User | GuildMember | Role | Invite | GuildEmoji | GuildChannel | null
  > {
    if (!entry.targetId) return null;

    try {
      const action = entry.action;

      if (this.isRoleAction(action)) {
        try {
          return await guild.roles.fetch(entry.targetId);
        } catch {
          return null;
        }
      } else if (this.isChannelAction(action)) {
        try {
          return (await guild.channels.fetch(entry.targetId)) as GuildChannel;
        } catch {
          // Channel may have been deleted
          return null;
        }
      } else if (this.isEmojiAction(action)) {
        try {
          return await guild.emojis.fetch(entry.targetId);
        } catch {
          return null;
        }
      } else if (this.isInviteAction(action)) {
        try {
          const invites = await guild.invites.fetch();
          return invites.find((inv) => inv.code === entry.targetId) || null;
        } catch {
          return null;
        }
      } else {
        // User/Member targets
        try {
          return await guild.members.fetch(entry.targetId);
        } catch {
          try {
            return await guild.client.users.fetch(entry.targetId);
          } catch {
            return null;
          }
        }
      }
    } catch (error) {
      return null;
    }
  }

  static async getMessageDeleter(
    guild: Guild,
    channelId: string,
    authorId: string
  ): Promise<string | null> {
    try {
      // Wait for audit log to update
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MessageDelete,
        limit: 5,
      });

      const entry = auditLogs.entries.find(
        (entry) =>
          entry.extra &&
          typeof entry.extra === "object" &&
          "channel" in entry.extra &&
          entry.extra.channel &&
          typeof entry.extra.channel === "object" &&
          "id" in entry.extra.channel &&
          entry.extra.channel.id === channelId &&
          entry.targetId === authorId &&
          entry.createdTimestamp > Date.now() - 5000
      );

      return entry?.executorId || null;
    } catch (error) {
      console.error("Error fetching message delete audit log:", error);
      return null;
    }
  }

  static isModerationAction(action: AuditLogEvent): boolean {
    return [AuditLogEvent.MemberKick, AuditLogEvent.MemberUpdate].includes(
      action
    );
  }

  static isRoleAction(action: AuditLogEvent): boolean {
    return [
      AuditLogEvent.RoleCreate,
      AuditLogEvent.RoleDelete,
      AuditLogEvent.RoleUpdate,
    ].includes(action);
  }

  static isChannelAction(action: AuditLogEvent): boolean {
    return [
      AuditLogEvent.ChannelCreate,
      AuditLogEvent.ChannelDelete,
      AuditLogEvent.ChannelUpdate,
    ].includes(action);
  }

  static isGuildAction(action: AuditLogEvent): boolean {
    return [AuditLogEvent.GuildUpdate].includes(action);
  }

  static isInviteAction(action: AuditLogEvent): boolean {
    return [AuditLogEvent.InviteCreate, AuditLogEvent.InviteDelete].includes(
      action
    );
  }

  static isEmojiAction(action: AuditLogEvent): boolean {
    return [
      AuditLogEvent.EmojiCreate,
      AuditLogEvent.EmojiDelete,
      AuditLogEvent.EmojiUpdate,
    ].includes(action);
  }

  static clearOldCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }
}
