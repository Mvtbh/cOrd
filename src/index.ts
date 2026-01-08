import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  Colors,
  ChannelType,
  AuditLogEvent,
  TextChannel,
  CategoryChannel,
  Guild,
  GuildAuditLogsEntry,
  GuildMember,
  User,
  PartialUser,
  Message,
  VoiceState,
  Role,
  PermissionFlagsBits,
  Invite,
  PartialGuildMember,
  GuildEmoji,
  Collection,
  GuildChannel,
  MessageReaction,
  PartialMessageReaction,
  ThreadChannel,
  Events,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
} from "discord.js";
import { CONFIG, validateConfig, CHANNEL_CONFIG } from "./config";
import { StorageManager } from "./utils/storage";
import { AuditLogHelper } from "./utils/auditLogHelper";
import { EmbedFactory } from "./utils/embedFactory";

validateConfig();

// Format user for embed author/title (no mention)
function formatUserForTitle(
  user: User | GuildMember | PartialUser | PartialGuildMember
): string {
  if (user instanceof GuildMember || "displayName" in user) {
    const member = user as GuildMember;
    const displayName =
      member.displayName ||
      member.user?.globalName ||
      member.user?.username ||
      member.nickname ||
      "User";
    const username = member.user?.username;
    if (username) {
      return `${displayName} (@${username}) / ${member.id}`;
    }
    return `${displayName} / ${member.id}`;
  }
  const u = user as User | PartialUser;
  const displayName = u.globalName || u.username || "User";
  const username = u.username;
  if (username) {
    return `${displayName} (@${username}) / ${u.id}`;
  }
  return `${displayName} / ${u.id}`;
}

// Format user for embed fields (with mention)
function formatUser(
  user: User | GuildMember | PartialUser | PartialGuildMember
): string {
  if (user instanceof GuildMember || "displayName" in user) {
    const member = user as GuildMember;
    const username = member.user?.username;
    if (username) {
      return `<@${member.id}> (@${username}) / ${member.id}`;
    }
    return `<@${member.id}> / ${member.id}`;
  }
  const u = user as User | PartialUser;
  const username = u.username;
  if (username) {
    return `<@${u.id}> (@${username}) / ${u.id}`;
  }
  return `<@${u.id}> / ${u.id}`;
}

// Convert channel type to readable string
function formatChannelType(type: ChannelType): string {
  const typeMap: Record<number, string> = {
    [ChannelType.GuildText]: "Text",
    [ChannelType.GuildVoice]: "Voice",
    [ChannelType.GuildCategory]: "Category",
    [ChannelType.GuildAnnouncement]: "Announcement",
    [ChannelType.AnnouncementThread]: "Announcement Thread",
    [ChannelType.PublicThread]: "Public Thread",
    [ChannelType.PrivateThread]: "Private Thread",
    [ChannelType.GuildStageVoice]: "Stage",
    [ChannelType.GuildForum]: "Forum",
    [ChannelType.GuildMedia]: "Media",
    [ChannelType.GuildDirectory]: "Directory",
  };
  return typeMap[type] || `Unknown (${type})`;
}

// Logging channels interface
interface LoggingChannels {
  moderation: TextChannel;
  messages: TextChannel;
  members: TextChannel;
  voice: TextChannel;
  roles: TextChannel;
  channels: TextChannel;
  server: TextChannel;
  invites: TextChannel;
  emojis: TextChannel;
  stickers: TextChannel;
  integrations: TextChannel;
  threads: TextChannel;
  stages: TextChannel;
  automod: TextChannel;
  joins: TextChannel;
  leaves: TextChannel;
  reactions: TextChannel;
  screenshare: TextChannel;
  events: TextChannel;
}

class c0rd {
  private client: Client;
  private loggingChannels!: LoggingChannels;
  private loggingGuild!: Guild;
  private targetGuild!: Guild;
  private storage: StorageManager;
  private isReady = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private inviteCache: Map<string, { uses: number; inviter: User | null }> =
    new Map();
  private reactionCache: Map<string, { timestamp: number; count: number }> =
    new Map();
  private voiceMoveCache: Map<
    string,
    { executor: User; timestamp: number; usedCount: number; totalCount: number }
  > = new Map();

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
        Partials.Reaction,
        Partials.ThreadMember,
        Partials.GuildScheduledEvent,
      ],
      sweepers: {
        messages: {
          interval: 3600,
          lifetime: 1800,
        },
        users: {
          interval: 3600,
          filter: () => (user) => user.bot && user.id !== this.client.user?.id,
        },
      },
      makeCache: (manager) => {
        if (manager.name === "GuildMemberManager") {
          return new Collection();
        }
        return new Collection();
      },
    });

    this.storage = new StorageManager();
    this.setupEventHandlers();
    this.setupProcessHandlers();
  }

  private setupProcessHandlers(): void {
    process.on("unhandledRejection", (error: Error) => {
      console.error("Error | Unhandled promise rejection:", error);
      console.error(error.stack);
    });

    process.on("uncaughtException", (error: Error) => {
      console.error("Error | Uncaught exception:", error);
      console.error(error.stack);
    });

    process.on("SIGINT", () => {
      this.shutdown();
    });
  }

  private async shutdown(): Promise<void> {
    try {
      this.isReady = false;
      await this.client.destroy();
      console.log("Info | Bot shut down successfully");
      process.exit(0);
    } catch (error) {
      console.error("Error | Error during shutdown:", error);
      process.exit(1);
    }
  }

  private async verifyPermissions(guild: Guild): Promise<boolean> {
    const me = guild.members.me;
    if (!me) {
      console.error(`Error | Bot member not found in guild ${guild.name}`);
      return false;
    }

    const requiredPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageChannels,
    ];

    const missingPermissions = requiredPermissions.filter(
      (perm) => !me.permissions.has(perm)
    );

    if (missingPermissions.length > 0) {
      const permNames = missingPermissions.map((p) => {
        const entry = Object.entries(PermissionFlagsBits).find(
          ([_, value]) => value === p
        );
        return entry ? entry[0] : p.toString();
      });
      console.error(
        `Error | Missing permissions in ${guild.name}:`,
        permNames.join(", ")
      );
      return false;
    }

    return true;
  }

  private async cleanupDuplicateCategories(
    guild: Guild
  ): Promise<CategoryChannel> {
    const storage = await this.storage.load();

    // Check if there is a new category
    if (storage?.categoryId) {
      try {
        const existingCategory = await guild.channels.fetch(storage.categoryId);
        if (
          existingCategory &&
          existingCategory.type === ChannelType.GuildCategory
        ) {
          console.log(
            `Info | Found existing category from storage: ${existingCategory.name}`
          );
          return existingCategory as CategoryChannel;
        }
      } catch {
        console.log("Info | Stored category not found, will create new one");
      }
    }

    // Find existing category with exact name match only
    const existingCategories = guild.channels.cache.filter(
      (channel): channel is CategoryChannel =>
        channel.type === ChannelType.GuildCategory &&
        channel.name === CHANNEL_CONFIG.category.name
    );

    if (existingCategories.size === 0) {
      const newCategory = await guild.channels.create({
        name: CHANNEL_CONFIG.category.name,
        type: ChannelType.GuildCategory,
      });

      await this.storage.updateCategoryId(newCategory.id);
      console.log(`Info | Created new category: ${newCategory.name}`);
      return newCategory;
    }

    // Use the first matching category
    const mainCategory = existingCategories.first()!;
    await this.storage.updateCategoryId(mainCategory.id);

    // Delete any duplicates with the exact same name
    const duplicates = Array.from(existingCategories.values()).slice(1);
    for (const category of duplicates) {
      for (const channel of category.children.cache.values()) {
        try {
          await channel.delete("Cleaning up duplicate logging category");
        } catch (err) {
          console.error(
            `Error | Failed to delete channel ${channel.name}:`,
            err
          );
        }
      }

      try {
        await category.delete("Cleaning up duplicate logging categories");
        console.log(`Info | Deleted duplicate category: ${category.name}`);
      } catch (error) {
        console.error(
          `Error | Failed to delete category ${category.name}:`,
          error
        );
      }
    }

    return mainCategory;
  }

  private async cleanupDuplicateChannels(
    category: CategoryChannel
  ): Promise<void> {
    const channels = category.children.cache;

    for (const channelConfig of CHANNEL_CONFIG.channels) {
      const matchingChannels = channels.filter(
        (ch): ch is TextChannel =>
          ch.type === ChannelType.GuildText && ch.name === channelConfig.name
      );

      if (matchingChannels.size > 1) {
        const [_keepChannel, ...deleteChannels] = Array.from(
          matchingChannels.values()
        );

        for (const deleteChannel of deleteChannels) {
          try {
            await deleteChannel.delete(
              "Cleaning up duplicate logging channels"
            );
            console.log(
              `Info | Deleted duplicate channel: ${deleteChannel.name}`
            );
          } catch (error) {
            console.error(
              `Error | Failed to delete channel ${deleteChannel.name}:`,
              error
            );
          }
        }
      }
    }
  }

  private async initializeLoggingChannels(
    guild: Guild
  ): Promise<LoggingChannels> {
    const storage = (await this.storage.load()) || {
      categoryId: "",
      channelIds: {},
    };
    const category = await this.cleanupDuplicateCategories(guild);
    await this.cleanupDuplicateChannels(category);

    const createChannel = async (
      key: string,
      name: string,
      topic: string
    ): Promise<TextChannel> => {
      // Check storage for channel
      if (storage.channelIds[key]) {
        try {
          const existingChannel = await guild.channels.fetch(
            storage.channelIds[key]
          );
          if (
            existingChannel &&
            existingChannel.type === ChannelType.GuildText &&
            existingChannel.parentId === category.id
          ) {
            if (existingChannel.topic !== topic) {
              await existingChannel.setTopic(topic);
            }
            return existingChannel as TextChannel;
          }
        } catch {
          console.log(
            `Info | Stored channel ${name} not found, will create new one`
          );
        }
      }

      // Check for existing channel
      const existingChannel = category.children.cache.find(
        (channel): channel is TextChannel =>
          channel.type === ChannelType.GuildText && channel.name === name
      );

      if (existingChannel) {
        await this.storage.updateChannelId(key, existingChannel.id);
        if (existingChannel.topic !== topic) {
          await existingChannel.setTopic(topic);
        }
        return existingChannel;
      }

      // Create new channel if needed
      const newChannel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        topic,
        parent: category.id,
      });

      await this.storage.updateChannelId(key, newChannel.id);
      console.log(`Info | Created new channel: ${name}`);
      return newChannel as TextChannel;
    };

    const channels = await Promise.all(
      CHANNEL_CONFIG.channels.map((config) =>
        createChannel(config.key, config.name, config.topic)
      )
    );

    const result: Partial<LoggingChannels> = {};
    CHANNEL_CONFIG.channels.forEach((config, index) => {
      result[config.key as keyof LoggingChannels] = channels[index];
    });

    return result as LoggingChannels;
  }

  private setupEventHandlers(): void {
    this.client.on(Events.ClientReady, () => this.onReady());
    this.client.on("error", (error) => this.onError(error));
    this.client.on("warn", (warning) => console.warn("[WARN]", warning));
    this.client.on("guildAuditLogEntryCreate", (entry, guild) =>
      this.onAuditLogEntry(entry, guild)
    );
    this.client.on("messageDelete", (message) => this.onMessageDelete(message));
    this.client.on("messageUpdate", (oldMessage, newMessage) =>
      this.onMessageUpdate(oldMessage, newMessage)
    );
    this.client.on("guildMemberUpdate", (oldMember, newMember) =>
      this.onGuildMemberUpdate(oldMember, newMember)
    );
    this.client.on("voiceStateUpdate", (oldState, newState) =>
      this.onVoiceStateUpdate(oldState, newState)
    );
    this.client.on("guildMemberAdd", (member) => this.onGuildMemberAdd(member));
    this.client.on("guildMemberRemove", (member) =>
      this.onGuildMemberRemove(member)
    );
    this.client.on("messageReactionAdd", (reaction, user) =>
      this.onMessageReactionAdd(reaction, user)
    );
    this.client.on("messageReactionRemove", (reaction, user) =>
      this.onMessageReactionRemove(reaction, user)
    );
    this.client.on("threadCreate", (thread) => this.onThreadCreate(thread));
    this.client.on("threadDelete", (thread) => this.onThreadDelete(thread));
    this.client.on("threadUpdate", (oldThread, newThread) =>
      this.onThreadUpdate(oldThread, newThread)
    );
    this.client.on("autoModerationActionExecution", (execution) =>
      this.onAutoModExecution(execution)
    );
    this.client.on("userUpdate", (oldUser, newUser) =>
      this.onUserUpdate(oldUser, newUser)
    );
    this.client.on("inviteCreate", (invite) => this.onInviteCreate(invite));
    this.client.on("inviteDelete", (invite) => this.onInviteDelete(invite));
    this.client.on("guildScheduledEventCreate", (event) =>
      this.onScheduledEventCreate(event)
    );
    this.client.on("guildScheduledEventDelete", (event) => {
      if (event.partial) return;
      this.onScheduledEventDelete(event);
    });
    this.client.on("guildScheduledEventUpdate", (oldEvent, newEvent) => {
      if (newEvent.partial) return;
      this.onScheduledEventUpdate(
        oldEvent?.partial ? null : oldEvent,
        newEvent
      );
    });
    this.client.on("guildScheduledEventUserAdd", (event, user) => {
      if (event.partial) return;
      this.onScheduledEventUserAdd(event, user);
    });
    this.client.on("guildScheduledEventUserRemove", (event, user) => {
      if (event.partial) return;
      this.onScheduledEventUserRemove(event, user);
    });
  }

  private async onReady(): Promise<void> {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║            ██████╗ ██████╗ ██████╗ ██████╗            ║
║           ██╔════╝██╔═████╗██╔══██╗██╔══██╗           ║
║           ██║     ██║██╔██║██████╔╝██║  ██║           ║
║           ██║     ████╔╝██║██╔══██╗██║  ██║           ║
║           ╚██████╗╚██████╔╝██║  ██║██████╔╝           ║
║            ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝            ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `);
    console.log(`Info | Logged in as ${this.client.user?.tag}!`);

    this.loggingGuild = this.client.guilds.cache.get(CONFIG.loggingGuildId)!;
    this.targetGuild = this.client.guilds.cache.get(CONFIG.targetGuildId)!;

    if (!this.loggingGuild || !this.targetGuild) {
      console.error("Error | Required guilds not found!");
      return;
    }

    const loggingPermissions = await this.verifyPermissions(this.loggingGuild);
    const targetPermissions = await this.verifyPermissions(this.targetGuild);

    if (!loggingPermissions || !targetPermissions) {
      console.error("Error | Missing required permissions");
      return;
    }

    try {
      this.loggingChannels = await this.initializeLoggingChannels(
        this.loggingGuild
      );

      // Cache invites for join tracking
      await this.cacheInvites();

      this.isReady = true;
      this.reconnectAttempts = 0;

      const owner = await this.targetGuild.fetchOwner();
      console.log(
        `Info | Monitoring guild: ${this.targetGuild.name} | Owned By ${owner.user.tag}`
      );
      console.log("Info | Bot is up!");

      // Set bot presence
      this.client.user?.setPresence({
        activities: [],
        status: "dnd",
      });
    } catch (error) {
      console.error("Error | Failed to initialize:", error);
    }
  }

  private async cacheInvites(): Promise<void> {
    try {
      const invites = await this.targetGuild.invites.fetch();
      invites.forEach((invite) => {
        this.inviteCache.set(invite.code, {
          uses: invite.uses || 0,
          inviter: invite.inviter,
        });
      });
      console.log(`Info | Cached ${invites.size} invites`);
    } catch (error) {
      console.error("Error | Failed to cache invites:", error);
    }
  }

  private onError(error: Error): void {
    console.error("Error | Client error:", error);

    if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(
        `Info | Attempting reconnect ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`
      );

      setTimeout(() => {
        this.client.destroy();
        this.start();
      }, delay);
    } else {
      console.error("Error | Max reconnection attempts reached. Exiting...");
      process.exit(1);
    }
  }

  private async onAuditLogEntry(
    entry: GuildAuditLogsEntry,
    guild: Guild
  ): Promise<void> {
    if (!this.isReady || guild.id !== CONFIG.targetGuildId) return;

    try {
      const target = await AuditLogHelper.fetchTarget(entry, guild);

      if (AuditLogHelper.isModerationAction(entry.action)) {
        await this.logModerationAction(entry, target as User | GuildMember);
      } else if (AuditLogHelper.isRoleAction(entry.action)) {
        await this.logRoleChange(entry, target as Role);
      } else if (AuditLogHelper.isChannelAction(entry.action)) {
        await this.logChannelUpdate(entry, target as GuildChannel | null);
      } else if (AuditLogHelper.isGuildAction(entry.action)) {
        await this.logGuildUpdate(entry, guild);
      } else if (AuditLogHelper.isInviteAction(entry.action)) {
        await this.logInviteUpdate(entry, target as Invite);
      } else if (AuditLogHelper.isEmojiAction(entry.action)) {
        await this.logEmojiUpdate(entry, target as GuildEmoji);
      } else if (
        entry.action === AuditLogEvent.StickerCreate ||
        entry.action === AuditLogEvent.StickerDelete ||
        entry.action === AuditLogEvent.StickerUpdate
      ) {
        await this.logStickerUpdate(entry, target);
      } else if (
        entry.action === AuditLogEvent.IntegrationDelete ||
        entry.action === AuditLogEvent.IntegrationUpdate
      ) {
        await this.logIntegrationUpdate(entry, target);
      } else if (
        entry.action === AuditLogEvent.WebhookCreate ||
        entry.action === AuditLogEvent.WebhookDelete ||
        entry.action === AuditLogEvent.WebhookUpdate
      ) {
        await this.logWebhookUpdate(entry, target);
      } else if (
        entry.action === AuditLogEvent.ApplicationCommandPermissionUpdate
      ) {
        await this.logApplicationCommandUpdate(entry);
      } else if (entry.action === AuditLogEvent.MemberRoleUpdate) {
        await this.logMemberRoleUpdate(entry, target as GuildMember);
      } else if (entry.action === AuditLogEvent.BotAdd) {
        await this.logBotAdded(entry, target as User);
      }
    } catch (error) {
      console.error("Error | Processing audit log:", error);
    }
  }

  private async onMessageDelete(
    message: Message | { id: string }
  ): Promise<void> {
    if (!this.isReady) return;

    // Fetch partial messages
    if (!("guild" in message) || !message.guild) return;
    if (message.guild.id !== CONFIG.targetGuildId) return;

    const fullMessage = message as Message;
    if (!fullMessage.author) return;
    if (fullMessage.author.bot) return;
    if (!fullMessage.guild) return;

    try {
      const deleterId = await AuditLogHelper.getMessageDeleter(
        fullMessage.guild,
        fullMessage.channel.id,
        fullMessage.author.id
      );

      const deletedBy = deleterId
        ? await this.client.users.fetch(deleterId)
        : undefined;
      const { embed, mediaUrls } = EmbedFactory.createMessageDeleteEmbed(
        fullMessage,
        deletedBy
      );

      const content =
        deletedBy &&
        deletedBy.id !== fullMessage.author.id &&
        CONFIG.moderatorRoleId
          ? `<@&${CONFIG.moderatorRoleId}>`
          : undefined;

      await this.loggingChannels.messages.send({ content, embeds: [embed] });

      // Send GIFs and videos as separate messages
      for (const url of mediaUrls) {
        await this.loggingChannels.messages.send({ content: url });
      }
    } catch (error) {
      console.error("Error | Logging message delete:", error);
    }
  }

  private async onMessageUpdate(
    oldMessage: Message | { id: string },
    newMessage: Message | { id: string }
  ): Promise<void> {
    if (!this.isReady) return;

    try {
      const old = oldMessage as Message;
      const newMsg = newMessage as Message;

      if (old.partial) await old.fetch();
      if (newMsg.partial) await newMsg.fetch();

      if (
        !newMsg.guild ||
        newMsg.guild.id !== CONFIG.targetGuildId ||
        newMsg.author?.bot
      )
        return;

      // Skip if content is the same (embed-only updates like link previews)
      if (old.content === newMsg.content) return;

      // Skip if this is just an embed loading (content was empty/url only, now has embed)
      const contentIsUrl = /^https?:\/\/\S+$/i.test(
        newMsg.content?.trim() || ""
      );
      if (contentIsUrl && old.embeds.length !== newMsg.embeds.length) return;

      const { embed, mediaUrls } = EmbedFactory.createMessageEditEmbed(
        old,
        newMsg
      );
      await this.loggingChannels.messages.send({ embeds: [embed] });

      // Send GIFs and videos as separate messages so they load
      for (const url of mediaUrls) {
        await this.loggingChannels.messages.send({ content: url });
      }
    } catch (error) {
      console.error("Error | Logging message update:", error);
    }
  }

  private async onGuildMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember
  ): Promise<void> {
    if (!this.isReady || oldMember.guild.id !== CONFIG.targetGuildId) return;
    // Skip bot users
    if (newMember.user.bot) return;

    try {
      const fullOldMember = oldMember.partial
        ? await oldMember.fetch()
        : oldMember;

      if (fullOldMember.nickname !== newMember.nickname) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Gold)
          .setTitle("Nickname Changed")
          .setAuthor({
            name: formatUserForTitle(newMember),
            iconURL: newMember.user.displayAvatarURL(),
          })
          .setThumbnail(newMember.user.displayAvatarURL())
          .addFields(
            {
              name: "Old Nickname",
              value: fullOldMember.nickname || "*None (using username)*",
              inline: true,
            },
            {
              name: "New Nickname",
              value: newMember.nickname || "*None (using username)*",
              inline: true,
            }
          );

        await this.loggingChannels.members.send({ embeds: [embed] });
      }

      // Server profile change
      if (fullOldMember.avatar !== newMember.avatar) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle("Server Avatar Changed")
          .setAuthor({
            name: formatUserForTitle(newMember),
            iconURL: newMember.user.displayAvatarURL(),
          });

        const oldAvatarUrl = fullOldMember.avatar
          ? fullOldMember.displayAvatarURL({ size: 256 })
          : null;
        const newAvatarUrl = newMember.avatar
          ? newMember.displayAvatarURL({ size: 256 })
          : null;

        if (newAvatarUrl) {
          embed.setThumbnail(newAvatarUrl);
        }

        embed.addFields(
          {
            name: "Old Server Avatar",
            value: oldAvatarUrl
              ? `[View](${oldAvatarUrl})`
              : "*None (using global avatar)*",
            inline: true,
          },
          {
            name: "New Server Avatar",
            value: newAvatarUrl
              ? `[View](${newAvatarUrl})`
              : "*None (using global avatar)*",
            inline: true,
          }
        );

        // Show old avatar as image if it existed
        if (oldAvatarUrl) {
          embed.setImage(oldAvatarUrl);
        }

        await this.loggingChannels.members.send({ embeds: [embed] });
      }

      // Server banner change
      if (fullOldMember.banner !== newMember.banner) {
        const embed = new EmbedBuilder()
          .setColor(Colors.Purple)
          .setTitle("Server Banner Changed")
          .setAuthor({
            name: formatUserForTitle(newMember),
            iconURL: newMember.user.displayAvatarURL(),
          });

        const oldBannerUrl = fullOldMember.banner
          ? fullOldMember.bannerURL({ size: 512 })
          : null;
        const newBannerUrl = newMember.banner
          ? newMember.bannerURL({ size: 512 })
          : null;

        embed.addFields(
          {
            name: "Old Server Banner",
            value: oldBannerUrl ? `[View](${oldBannerUrl})` : "*None*",
            inline: true,
          },
          {
            name: "New Server Banner",
            value: newBannerUrl ? `[View](${newBannerUrl})` : "*None*",
            inline: true,
          }
        );

        if (newBannerUrl) {
          embed.setImage(newBannerUrl);
        }

        await this.loggingChannels.members.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error("Error | Logging member update:", error);
    }
  }

  private async onVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState
  ): Promise<void> {
    if (!this.isReady || oldState.guild.id !== CONFIG.targetGuildId) return;

    try {
      let title = "";
      let description = "";
      let color: number = Colors.Purple;
      let logChannel = this.loggingChannels.voice;

      // Clean up old cache entries
      const now = Date.now();
      for (const [key, value] of this.voiceMoveCache.entries()) {
        if (now - value.timestamp > 10000) {
          this.voiceMoveCache.delete(key);
        }
      }
      for (const [key, value] of this.reactionCache.entries()) {
        if (now - value.timestamp > 10000) {
          this.reactionCache.delete(key);
        }
      }

      // Check if user was moved
      const checkIfMoved = async (): Promise<User | null> => {
        try {
          // First check if we have a cached move for this channel
          for (const [key, cacheEntry] of this.voiceMoveCache.entries()) {
            if (
              key.startsWith(`${newState.channelId}:`) &&
              now - cacheEntry.timestamp < 5000 &&
              cacheEntry.usedCount < cacheEntry.totalCount
            ) {
              // Use this cached entry
              cacheEntry.usedCount++;
              return cacheEntry.executor;
            }
          }

          // Wait a bit for audit log to be created, then fetch
          await new Promise((resolve) => setTimeout(resolve, 800));

          const auditLogs = await newState.guild.fetchAuditLogs({
            type: AuditLogEvent.MemberMove,
            limit: 5,
          });

          // Find a recent MemberMove entry for our destination channel
          for (const [entryId, entry] of auditLogs.entries) {
            const timeDiff = now - entry.createdTimestamp;
            if (timeDiff > 5000) continue;

            const extra = entry.extra as {
              channel?: { id: string };
              count?: number;
            } | null;
            if (!extra?.channel?.id) continue;

            // Check if this entry is for the channel the user moved to
            if (extra.channel.id === newState.channelId) {
              const cacheKey = `${extra.channel.id}:${entryId}`;

              // Check if we already have this entry cached
              if (
                !this.voiceMoveCache.has(cacheKey) &&
                entry.executor &&
                entry.executor.id !== newState.id
              ) {
                // Cache this entry
                this.voiceMoveCache.set(cacheKey, {
                  executor: entry.executor as User,
                  timestamp: entry.createdTimestamp,
                  usedCount: 1,
                  totalCount: extra.count || 1,
                });
                return entry.executor as User;
              } else if (this.voiceMoveCache.has(cacheKey)) {
                const cached = this.voiceMoveCache.get(cacheKey)!;
                if (cached.usedCount < cached.totalCount) {
                  cached.usedCount++;
                  return cached.executor;
                }
              }
            }
          }
          return null;
        } catch (err) {
          console.error("Error checking move:", err);
          return null;
        }
      };

      // Helper to get mute/deafen actions
      const getModerator = async (
        eventType: AuditLogEvent
      ): Promise<User | null> => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const auditLogs = await newState.guild.fetchAuditLogs({
            type: eventType,
            limit: 5,
          });
          const entry = auditLogs.entries.find(
            (e) =>
              e.targetId === newState.id &&
              Date.now() - e.createdTimestamp < 5000
          );
          if (entry?.executor && entry.executor.id !== newState.id) {
            return entry.executor as User;
          }
          return null;
        } catch {
          return null;
        }
      };

      if (!oldState.channelId && newState.channelId) {
        title = "Joined Voice Channel";
        description = `**Channel:** ${newState.channel}`;
        color = Colors.Green;
      } else if (oldState.channelId && !newState.channelId) {
        title = "Left Voice Channel";
        description = `**Channel:** <#${oldState.channelId}>`;
        color = Colors.Red;
      } else if (oldState.channelId !== newState.channelId) {
        // User changed channels
        const mover = await checkIfMoved();

        if (mover) {
          title = "User Moved";
          description = `**From:** <#${oldState.channelId}>\n**To:** ${
            newState.channel
          }\n**Moved By:** ${formatUser(mover)}`;
          color = Colors.Orange;
        } else {
          title = "Switched Voice Channel";
          description = `**From:** <#${oldState.channelId}>\n**To:** ${newState.channel}`;
          color = Colors.Blue;
        }
      } else if (oldState.serverMute !== newState.serverMute) {
        const moderator = await getModerator(AuditLogEvent.MemberUpdate);
        title = newState.serverMute
          ? "User Server Muted"
          : "User Server Unmuted";
        if (moderator) {
          description = `**By:** ${formatUser(moderator)}`;
        }
        color = newState.serverMute ? Colors.Orange : Colors.Green;
      } else if (oldState.serverDeaf !== newState.serverDeaf) {
        const moderator = await getModerator(AuditLogEvent.MemberUpdate);
        title = newState.serverDeaf
          ? "User Server Deafened"
          : "User Server Undeafened";
        if (moderator) {
          description = `**By:** ${formatUser(moderator)}`;
        }
        color = newState.serverDeaf ? Colors.Orange : Colors.Green;
      } else if (oldState.streaming !== newState.streaming) {
        logChannel = this.loggingChannels.screenshare;
        if (newState.streaming) {
          title = "Started Streaming";
          description = `**Channel:** ${newState.channel}`;
          color = Colors.Purple;
        } else {
          title = "Stopped Streaming";
          description = `**Channel:** <#${oldState.channelId}>`;
          color = Colors.Grey;
        }
      } else if (oldState.selfVideo !== newState.selfVideo) {
        logChannel = this.loggingChannels.screenshare;
        if (newState.selfVideo) {
          title = "Started Video";
          description = `**Channel:** ${newState.channel}`;
          color = Colors.Purple;
        } else {
          title = "Stopped Video";
          description = `**Channel:** <#${oldState.channelId}>`;
          color = Colors.Grey;
        }
      } else {
        return;
      }

      const member = newState.member;
      const embed = new EmbedBuilder().setColor(color).setTitle(title);

      if (member?.user) {
        embed.setAuthor({
          name: formatUserForTitle(member),
          iconURL: member.user.displayAvatarURL(),
        });
      }

      if (description) {
        embed.setDescription(description);
      }

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging voice state update:", error);
    }
  }

  private async onGuildMemberAdd(member: GuildMember): Promise<void> {
    if (!this.isReady || member.guild.id !== CONFIG.targetGuildId) return;

    try {
      // Find who invited the member
      let inviter: User | null = null;
      let inviteUsed: string | null = null;

      try {
        const newInvites = await member.guild.invites.fetch();

        // Find the invite that was used by comparing uses
        for (const [code, invite] of newInvites) {
          const cachedInvite = this.inviteCache.get(code);
          if (cachedInvite && invite.uses && invite.uses > cachedInvite.uses) {
            inviter = invite.inviter;
            inviteUsed = code;
            break;
          }
        }

        // Check for new invites not in cache
        if (!inviter) {
          for (const [code, invite] of newInvites) {
            if (!this.inviteCache.has(code) && invite.uses && invite.uses > 0) {
              inviter = invite.inviter;
              inviteUsed = code;
              break;
            }
          }
        }

        // Update cache
        newInvites.forEach((invite) => {
          this.inviteCache.set(invite.code, {
            uses: invite.uses || 0,
            inviter: invite.inviter,
          });
        });
      } catch (error) {
        console.error("Error | Failed to fetch invites:", error);
      }

      const accountAge = new Date().getTime() - member.user.createdTimestamp;
      const daysSinceCreation = Math.floor(accountAge / (1000 * 60 * 60 * 24));
      const isSuspicious = daysSinceCreation < 7;

      const embed = new EmbedBuilder()
        .setColor(isSuspicious ? Colors.Orange : Colors.Green)
        .setTitle("Member Joined")
        .setAuthor({
          name: formatUserForTitle(member),
          iconURL: member.user.displayAvatarURL(),
        })
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          {
            name: "Account Created",
            value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "Member Count",
            value: member.guild.memberCount.toString(),
            inline: true,
          }
        );

      if (inviter && inviteUsed) {
        embed.addFields({
          name: "Invite Used",
          value: `https://discord.gg/${inviteUsed} - Invited by <@${inviter.id}> (${inviter.username}) / ${inviter.id}`,
          inline: false,
        });
      } else if (inviter) {
        embed.addFields({
          name: "Invited By",
          value: `<@${inviter.id}> (${inviter.username}) / ${inviter.id}`,
          inline: false,
        });
      } else {
        embed.addFields({
          name: "Invited By",
          value: "Unknown (Check Members Section on your Server)",
          inline: false,
        });
      }

      if (isSuspicious) {
        embed.addFields({
          name: "⚠️ Account Age Warning",
          value: `Account is only ${daysSinceCreation} days old`,
          inline: false,
        });
      }

      await this.loggingChannels.joins.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging member join:", error);
    }
  }

  private async onGuildMemberRemove(
    member: GuildMember | PartialGuildMember
  ): Promise<void> {
    if (!this.isReady || member.guild.id !== CONFIG.targetGuildId) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle("Member Left");

      if (member.user) {
        embed.setAuthor({
          name: formatUserForTitle(member),
          iconURL: member.user.displayAvatarURL(),
        });
        embed.setThumbnail(member.user.displayAvatarURL());
      } else {
        embed.setDescription(`**User ID:** ${member.id}`);
      }

      if (member.guild) {
        embed.addFields({
          name: "Member Count",
          value: member.guild.memberCount.toString(),
          inline: true,
        });
      }

      // Show roles the member had (without tagging)
      if (member.roles && member.roles.cache.size > 1) {
        const roles = member.roles.cache
          .filter((r) => r.id !== member.guild.id)
          .map((r) => r.name)
          .join(", ");
        if (roles) {
          embed.addFields({
            name: "Roles",
            value: roles.substring(0, 1024),
            inline: false,
          });
        }
      }

      // Check if they were kicked/banned
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const auditLogs = await member.guild.fetchAuditLogs({
          limit: 5,
        });

        const kickEntry = auditLogs.entries.find(
          (e) =>
            (e.action === AuditLogEvent.MemberKick ||
              e.action === AuditLogEvent.MemberBanAdd) &&
            e.targetId === member.id &&
            Date.now() - e.createdTimestamp < 5000
        );

        if (kickEntry) {
          const action =
            kickEntry.action === AuditLogEvent.MemberKick ? "Kicked" : "Banned";
          embed.addFields({
            name: `${action} By`,
            value: kickEntry.executor
              ? formatUser(kickEntry.executor)
              : "Unknown",
            inline: true,
          });
          if (kickEntry.reason) {
            embed.addFields({
              name: "Reason",
              value: kickEntry.reason,
              inline: false,
            });
          }
        }
      } catch {}

      await this.loggingChannels.leaves.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging member leave:", error);
    }
  }

  private async onUserUpdate(
    oldUser: User | PartialUser,
    newUser: User
  ): Promise<void> {
    if (!this.isReady) return;
    if (newUser.bot) return;

    try {
      // Check if user is in the target guild
      const member = await this.targetGuild.members
        .fetch(newUser.id)
        .catch(() => null);
      if (!member) return;

      const changes: string[] = [];
      let isAvatarChange = false;

      // Check username change
      if (oldUser.username !== newUser.username) {
        changes.push(
          `**Username:** \`${oldUser.username || "Unknown"}\` → \`${
            newUser.username
          }\``
        );
      }

      // Check global name (display name) change
      if (oldUser.globalName !== newUser.globalName) {
        changes.push(
          `**Display Name:** \`${oldUser.globalName || "None"}\` → \`${
            newUser.globalName || "None"
          }\``
        );
      }

      // Check avatar change
      if (oldUser.avatar !== newUser.avatar) {
        isAvatarChange = true;
      }

      if (changes.length === 0 && !isAvatarChange) return;

      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(isAvatarChange ? "Avatar Changed" : "User Profile Updated")
        .setAuthor({
          name: formatUserForTitle(member),
          iconURL: newUser.displayAvatarURL(),
        });

      if (changes.length > 0) {
        embed.setDescription(changes.join("\n"));
      }

      embed.setThumbnail(newUser.displayAvatarURL({ size: 256 }));

      await this.loggingChannels.members.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging user update:", error);
    }
  }

  private async onMessageReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<void> {
    if (!this.isReady || reaction.message.guild?.id !== CONFIG.targetGuildId)
      return;
    if (user.bot) return;

    try {
      if (reaction.partial) {
        await reaction.fetch();
      }

      const cacheKey = `${reaction.message.id}:${user.id}:add`;
      const cached = this.reactionCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < 5000) {
        return;
      }

      this.reactionCache.set(cacheKey, { timestamp: Date.now(), count: 1 });

      const emojiString = reaction.emoji?.toString() ?? "Unknown";
      const messageUrl = reaction.message?.url ?? "Unknown";

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("Reaction Added")
        .setDescription(`Added ${emojiString} to [message](${messageUrl})`);

      if (!user.partial && "username" in user) {
        embed.setAuthor({
          name: formatUserForTitle(user),
          iconURL: user.displayAvatarURL(),
        });
      }

      embed.addFields({
        name: "Channel",
        value: `${reaction.message.channel ?? "Unknown"}`,
        inline: true,
      });

      await this.loggingChannels.reactions.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging reaction add:", error);
    }
  }

  private async onMessageReactionRemove(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<void> {
    if (!this.isReady || reaction.message.guild?.id !== CONFIG.targetGuildId)
      return;
    if (user.bot) return;

    try {
      if (reaction.partial) {
        await reaction.fetch();
      }

      const emojiString = reaction.emoji?.toString() ?? "Unknown";
      const messageUrl = reaction.message?.url ?? "Unknown";

      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle("Reaction Removed")
        .setDescription(`Removed ${emojiString} from [message](${messageUrl})`);

      if (!user.partial && "username" in user) {
        embed.setAuthor({
          name: formatUserForTitle(user),
          iconURL: user.displayAvatarURL(),
        });
      }

      embed.addFields({
        name: "Channel",
        value: `${reaction.message.channel ?? "Unknown"}`,
        inline: true,
      });

      await this.loggingChannels.reactions.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging reaction remove:", error);
    }
  }

  private async onThreadCreate(thread: ThreadChannel): Promise<void> {
    if (!this.isReady || thread.guild?.id !== CONFIG.targetGuildId) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("Thread Created")
        .setDescription(`**Name:** ${thread.name}\n**Link:** ${thread.url}`)
        .addFields(
          {
            name: "Parent Channel",
            value: `${thread.parent}`,
            inline: true,
          },
          {
            name: "Auto Archive",
            value: `${thread.autoArchiveDuration} minutes`,
            inline: true,
          }
        );

      if (thread.ownerId) {
        try {
          const owner = await this.client.users.fetch(thread.ownerId);
          embed.setAuthor({
            name: formatUserForTitle(owner),
            iconURL: owner.displayAvatarURL(),
          });
        } catch (error) {
          console.error("Error | Failed to fetch thread owner:", error);
        }
      }

      await this.loggingChannels.threads.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging thread create:", error);
    }
  }

  private async onThreadDelete(thread: ThreadChannel): Promise<void> {
    if (!this.isReady || thread.guild?.id !== CONFIG.targetGuildId) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle("Thread Deleted")
        .setDescription(`**Name:** ${thread.name}`)
        .addFields({
          name: "Parent Channel",
          value: thread.parent ? `${thread.parent}` : "Unknown",
          inline: true,
        });

      await this.loggingChannels.threads.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging thread delete:", error);
    }
  }

  private async onThreadUpdate(
    oldThread: ThreadChannel,
    newThread: ThreadChannel
  ): Promise<void> {
    if (!this.isReady || newThread.guild?.id !== CONFIG.targetGuildId) return;

    try {
      const changes: string[] = [];
      let title = "Thread Updated";

      if (oldThread.name !== newThread.name) {
        changes.push(`**Name:** ${oldThread.name} → ${newThread.name}`);
      }

      // Combine archived and locked changes
      const wasArchived = oldThread.archived;
      const isArchived = newThread.archived;
      const wasLocked = oldThread.locked;
      const isLocked = newThread.locked;

      if (wasArchived !== isArchived || wasLocked !== isLocked) {
        if (isArchived && isLocked) {
          title = "Thread Archived & Locked";
        } else if (isArchived && !wasArchived) {
          title = "Thread Archived";
        } else if (!isArchived && wasArchived) {
          title = "Thread Unarchived";
        } else if (isLocked && !wasLocked) {
          title = "Thread Locked";
        } else if (!isLocked && wasLocked) {
          title = "Thread Unlocked";
        }
      }

      // Get who made the change from audit log
      let executor: User | null = null;
      try {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const auditLogs = await newThread.guild.fetchAuditLogs({
          type: AuditLogEvent.ThreadUpdate,
          limit: 5,
        });
        const entry = auditLogs.entries.find(
          (e) =>
            e.targetId === newThread.id &&
            Date.now() - e.createdTimestamp < 5000
        );
        if (entry?.executor) {
          executor = entry.executor as User;
        }
      } catch {}

      if (changes.length === 0 && title === "Thread Updated") return;

      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(title)
        .addFields({
          name: "Thread",
          value: `[${newThread.name}](${newThread.url})`,
          inline: true,
        });

      if (changes.length > 0) {
        embed.setDescription(changes.join("\n"));
      }

      if (executor) {
        embed.setAuthor({
          name: formatUserForTitle(executor),
          iconURL: executor.displayAvatarURL(),
        });
      }

      await this.loggingChannels.threads.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging thread update:", error);
    }
  }

  private async onAutoModExecution(execution: any): Promise<void> {
    if (!this.isReady || execution.guildId !== CONFIG.targetGuildId) return;

    try {
      // Map action types to human-readable names
      const actionTypeNames: Record<number, string> = {
        1: "Block Message",
        2: "Send Alert",
        3: "Timeout User",
        4: "Block Member Interaction",
      };

      // Map rule trigger types to human-readable names
      const triggerTypeNames: Record<number, string> = {
        1: "Keyword Filter",
        2: "Harmful Link",
        3: "Spam",
        4: "Keyword Preset",
        5: "Mention Spam",
        6: "Member Profile",
      };

      const actionName =
        actionTypeNames[execution.action?.type] ||
        `Unknown (${execution.action?.type})`;
      const triggerType =
        triggerTypeNames[execution.ruleTriggerType] ||
        `Unknown (${execution.ruleTriggerType})`;

      // Tries to fetch the user
      let user: User | null = null;
      try {
        user = await this.client.users.fetch(execution.userId);
      } catch {}

      const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle("AutoMod Action");

      if (user) {
        embed.setAuthor({
          name: formatUserForTitle(user),
          iconURL: user.displayAvatarURL(),
        });
      }

      embed.addFields(
        {
          name: "Action Taken",
          value: actionName,
          inline: true,
        },
        {
          name: "Rule",
          value: execution.ruleName || "Unknown",
          inline: true,
        },
        {
          name: "Trigger Type",
          value: triggerType,
          inline: true,
        }
      );

      if (execution.matchedContent) {
        embed.addFields({
          name: "Matched Content",
          value: `\`\`\`${execution.matchedContent.substring(0, 200)}\`\`\``,
          inline: false,
        });
      }

      if (execution.matchedKeyword) {
        embed.addFields({
          name: "Matched Keyword",
          value: `\`${execution.matchedKeyword}\``,
          inline: true,
        });
      }

      if (execution.channelId) {
        embed.addFields({
          name: "Channel",
          value: `<#${execution.channelId}>`,
          inline: true,
        });
      }

      await this.loggingChannels.automod.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging automod execution:", error);
    }
  }

  private async logModerationAction(
    entry: GuildAuditLogsEntry,
    target: User | GuildMember | null
  ): Promise<void> {
    let title = "";
    let description = "";
    let mention = "";

    const targetInfo = target
      ? formatUser(target)
      : entry.targetId
      ? `<@${entry.targetId}> / ${entry.targetId}`
      : "Unknown";

    const executorInfo = entry.executor
      ? formatUser(entry.executor)
      : "Unknown";

    const embed = new EmbedBuilder().setColor(Colors.Red);

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    switch (entry.action) {
      case AuditLogEvent.MemberBanAdd:
        title = "User Banned";
        description = `**Target:** ${targetInfo}\n**Banned By:** ${executorInfo}\n**Reason:** ${
          entry.reason || "No reason provided"
        }`;
        mention = CONFIG.moderatorRoleId ? `<@&${CONFIG.moderatorRoleId}>` : "";
        break;
      case AuditLogEvent.MemberBanRemove:
        title = "User Unbanned";
        description = `**Target:** ${targetInfo}\n**Unbanned By:** ${executorInfo}`;
        break;
      case AuditLogEvent.MemberKick:
        title = "User Kicked";
        description = `**Target:** ${targetInfo}\n**Kicked By:** ${executorInfo}\n**Reason:** ${
          entry.reason || "No reason provided"
        }`;
        mention = CONFIG.moderatorRoleId ? `<@&${CONFIG.moderatorRoleId}>` : "";
        break;
      case AuditLogEvent.MemberUpdate:
        if (entry.changes) {
          const timeoutChange = entry.changes.find(
            (change) => change.key === "communication_disabled_until"
          );
          if (timeoutChange) {
            const isTimeoutApplied = !!timeoutChange.new;
            title = isTimeoutApplied
              ? "User Timed Out"
              : "User Timeout Removed";

            if (isTimeoutApplied) {
              description = `**Target:** ${targetInfo}\n**By:** ${executorInfo}`;
              if (entry.reason) {
                description += `\n**Reason:** ${entry.reason}`;
              }
              embed.addFields({
                name: "Timeout Until",
                value: `<t:${Math.floor(
                  new Date(timeoutChange.new as string).getTime() / 1000
                )}:F>`,
                inline: true,
              });
              if (CONFIG.moderatorRoleId) {
                mention = `<@&${CONFIG.moderatorRoleId}>`;
              }
            } else {
              description = `**Target:** ${targetInfo}\n**By:** ${executorInfo}`;
            }
          }
        }
        break;
      case AuditLogEvent.MemberDisconnect:
        title = "User Disconnected from Voice";
        description = `**Target:** ${targetInfo}\n**Disconnected By:** ${executorInfo}`;
        if (entry.reason) {
          description += `\n**Reason:** ${entry.reason}`;
        }
        break;
      default:
        return;
    }

    if (!title) return;

    embed.setTitle(title);
    embed.setDescription(description);
    await this.loggingChannels.moderation.send({
      content: mention || undefined,
      embeds: [embed],
    });
  }

  private async logRoleChange(
    entry: GuildAuditLogsEntry,
    target: Role | null
  ): Promise<void> {
    const embed = EmbedFactory.createRoleEmbed(entry, target, "Role Update");

    const formatPermissionChanges = (
      oldPerms: bigint | string | undefined,
      newPerms: bigint | string | undefined
    ): { added: string[]; removed: string[] } => {
      let oldBits: bigint;
      let newBits: bigint;

      try {
        oldBits =
          typeof oldPerms === "string"
            ? BigInt(oldPerms)
            : BigInt(oldPerms || 0);
      } catch {
        oldBits = 0n;
      }

      try {
        newBits =
          typeof newPerms === "string"
            ? BigInt(newPerms)
            : BigInt(newPerms || 0);
      } catch {
        newBits = 0n;
      }

      console.log("Permission bits:", {
        oldBits: oldBits.toString(),
        newBits: newBits.toString(),
      });

      const permissionNames: { [key: string]: bigint } = {
        CreateInstantInvite: 1n << 0n,
        KickMembers: 1n << 1n,
        BanMembers: 1n << 2n,
        Administrator: 1n << 3n,
        ManageChannels: 1n << 4n,
        ManageGuild: 1n << 5n,
        AddReactions: 1n << 6n,
        ViewAuditLog: 1n << 7n,
        PrioritySpeaker: 1n << 8n,
        Stream: 1n << 9n,
        ViewChannel: 1n << 10n,
        SendMessages: 1n << 11n,
        SendTTSMessages: 1n << 12n,
        ManageMessages: 1n << 13n,
        EmbedLinks: 1n << 14n,
        AttachFiles: 1n << 15n,
        ReadMessageHistory: 1n << 16n,
        MentionEveryone: 1n << 17n,
        UseExternalEmojis: 1n << 18n,
        ViewGuildInsights: 1n << 19n,
        Connect: 1n << 20n,
        Speak: 1n << 21n,
        MuteMembers: 1n << 22n,
        DeafenMembers: 1n << 23n,
        MoveMembers: 1n << 24n,
        UseVAD: 1n << 25n,
        ChangeNickname: 1n << 26n,
        ManageNicknames: 1n << 27n,
        ManageRoles: 1n << 28n,
        ManageWebhooks: 1n << 29n,
        ManageEmojisAndStickers: 1n << 30n,
        UseApplicationCommands: 1n << 31n,
        RequestToSpeak: 1n << 32n,
        ManageEvents: 1n << 33n,
        ManageThreads: 1n << 34n,
        CreatePublicThreads: 1n << 35n,
        CreatePrivateThreads: 1n << 36n,
        UseExternalStickers: 1n << 37n,
        SendMessagesInThreads: 1n << 38n,
        UseEmbeddedActivities: 1n << 39n,
        ModerateMembers: 1n << 40n,
        ViewCreatorMonetizationAnalytics: 1n << 41n,
        UseSoundboard: 1n << 42n,
        UseExternalSounds: 1n << 45n,
        SendVoiceMessages: 1n << 46n,
      };

      const added: string[] = [];
      const removed: string[] = [];

      for (const [name, bit] of Object.entries(permissionNames)) {
        const hadPerm = (oldBits & bit) === bit;
        const hasPerm = (newBits & bit) === bit;

        if (!hadPerm && hasPerm) {
          added.push(name);
        } else if (hadPerm && !hasPerm) {
          removed.push(name);
        }
      }

      console.log("Permission changes detected:", { added, removed });
      return { added, removed };
    };

    switch (entry.action) {
      case AuditLogEvent.RoleCreate:
        if (target) {
          embed
            .setTitle("Role Created")
            .setDescription(`**Role:** ${target.name}`)
            .addFields(
              { name: "ID", value: target.id, inline: true },
              { name: "Color", value: target.hexColor, inline: true },
              {
                name: "Mentionable",
                value: target.mentionable ? "Yes" : "No",
                inline: true,
              },
              {
                name: "Hoisted",
                value: target.hoist ? "Yes" : "No",
                inline: true,
              },
              {
                name: "Position",
                value: target.position.toString(),
                inline: true,
              }
            );

          // Show initial permissions if any
          const permList = target.permissions.toArray();
          if (permList.length > 0) {
            embed.addFields({
              name: "Permissions",
              value:
                permList.slice(0, 20).join(", ") +
                (permList.length > 20
                  ? ` (+${permList.length - 20} more)`
                  : ""),
              inline: false,
            });
          }
        } else {
          embed
            .setTitle("Role Created")
            .setDescription("A new role was created");
          if (entry.changes) {
            const nameChange = entry.changes.find((c) => c.key === "name");
            if (nameChange?.new) {
              embed.addFields({
                name: "Role Name",
                value: String(nameChange.new),
                inline: true,
              });
            }
          }
        }
        break;
      case AuditLogEvent.RoleDelete:
        const deletedRoleName = entry.changes?.find(
          (c) => c.key === "name"
        )?.old;
        const deletedRoleColor = entry.changes?.find(
          (c) => c.key === "color"
        )?.old;
        const deletedRoleId = entry.targetId;

        embed.setTitle("Role Deleted").addFields(
          {
            name: "Role Name",
            value: String(deletedRoleName || "Unknown"),
            inline: true,
          },
          {
            name: "Role ID",
            value: String(deletedRoleId || "Unknown"),
            inline: true,
          }
        );

        if (deletedRoleColor) {
          embed.addFields({
            name: "Color",
            value: `#${Number(deletedRoleColor).toString(16).padStart(6, "0")}`,
            inline: true,
          });
        }
        break;
      case AuditLogEvent.RoleUpdate:
        const roleName =
          target?.name ||
          entry.changes?.find((c) => c.key === "name")?.old ||
          "Unknown Role";
        const roleDisplay = target
          ? target.name
          : `${roleName} (ID: ${entry.targetId})`;

        embed
          .setTitle("Role Updated")
          .setDescription(`**Role:** ${roleDisplay}`);

        if (target) {
          embed.addFields({ name: "Role ID", value: target.id, inline: true });
        } else if (entry.targetId) {
          embed.addFields({
            name: "Role ID",
            value: entry.targetId,
            inline: true,
          });
        }

        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.key === "name") {
              embed.addFields({
                name: "Name Changed",
                value: `\`${change.old}\` → \`${change.new}\``,
                inline: false,
              });
            } else if (change.key === "color") {
              const oldColor = `#${Number(change.old || 0)
                .toString(16)
                .padStart(6, "0")}`;
              const newColor = `#${Number(change.new || 0)
                .toString(16)
                .padStart(6, "0")}`;
              embed.addFields({
                name: "Color Changed",
                value: `\`${oldColor}\` → \`${newColor}\``,
                inline: true,
              });
            } else if (change.key === "hoist") {
              embed.addFields({
                name: "Display Separately Changed",
                value: `${change.old ? "Yes" : "No"} → ${
                  change.new ? "Yes" : "No"
                }`,
                inline: true,
              });
            } else if (change.key === "mentionable") {
              embed.addFields({
                name: "Mentionable Changed",
                value: `${change.old ? "Yes" : "No"} → ${
                  change.new ? "Yes" : "No"
                }`,
                inline: true,
              });
            } else if (change.key === "permissions") {
              const { added, removed } = formatPermissionChanges(
                change.old as bigint | string | undefined,
                change.new as bigint | string | undefined
              );

              if (added.length > 0) {
                embed.addFields({
                  name: "✅ Permissions Added",
                  value: added.join(", ").substring(0, 1024) || "None",
                  inline: false,
                });
              }

              if (removed.length > 0) {
                embed.addFields({
                  name: "❌ Permissions Removed",
                  value: removed.join(", ").substring(0, 1024) || "None",
                  inline: false,
                });
              }

              if (added.length === 0 && removed.length === 0) {
                embed.addFields({
                  name: "Permissions Changed",
                  value:
                    "Permission bits were modified (no individual permission changes detected)",
                  inline: false,
                });
              }
            } else {
              // Handle any unknown change keys
              const keyName = String(change.key).replace(/_/g, " ");
              const displayName =
                keyName.charAt(0).toUpperCase() + keyName.slice(1);
              embed.addFields({
                name: displayName,
                value: "Modified",
                inline: true,
              });
            }
          }
        }
        break;
    }

    await this.loggingChannels.roles.send({ embeds: [embed] });
  }

  private async logChannelUpdate(
    entry: GuildAuditLogsEntry,
    target: GuildChannel | null
  ): Promise<void> {
    const embed = EmbedFactory.createChannelEmbed(
      entry,
      target,
      "Channel Update"
    );

    switch (entry.action) {
      case AuditLogEvent.ChannelCreate:
        embed
          .setTitle("Channel Created")
          .setDescription(`**Channel:** ${target || "Unknown"}`)
          .addFields(
            { name: "Name", value: target?.name || "Unknown", inline: true },
            {
              name: "Type",
              value: target ? formatChannelType(target.type) : "Unknown",
              inline: true,
            }
          );
        break;
      case AuditLogEvent.ChannelDelete:
        const deletedType = entry.changes?.find((c) => c.key === "type")
          ?.old as number | undefined;
        embed.setTitle("Channel Deleted").addFields(
          {
            name: "Name",
            value: String(
              entry.changes?.find((c) => c.key === "name")?.old || "Unknown"
            ),
            inline: true,
          },
          {
            name: "Type",
            value:
              deletedType !== undefined
                ? formatChannelType(deletedType)
                : "Unknown",
            inline: true,
          }
        );
        break;
      case AuditLogEvent.ChannelUpdate:
        embed
          .setTitle("Channel Updated")
          .setDescription(`**Channel:** ${target || "Unknown"}`);
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.key === "name") {
              embed.addFields({
                name: "Name",
                value: `${change.old || "None"} → ${change.new || "None"}`,
                inline: true,
              });
            } else if (change.key === "topic") {
              embed.addFields({
                name: "Topic",
                value: `${change.old || "*No topic*"} → ${
                  change.new || "*No topic*"
                }`,
                inline: false,
              });
            } else if (change.key === "bitrate") {
              embed.addFields({
                name: "Bitrate",
                value: `${change.old || "Default"}kbps → ${
                  change.new || "Default"
                }kbps`,
                inline: true,
              });
            } else if (change.key === "rate_limit_per_user") {
              const oldSlowmode = (change.old as number) || 0;
              const newSlowmode = (change.new as number) || 0;
              embed.addFields({
                name: "Slowmode",
                value: `${oldSlowmode === 0 ? "Off" : `${oldSlowmode}s`} → ${
                  newSlowmode === 0 ? "Off" : `${newSlowmode}s`
                }`,
                inline: true,
              });
            } else if (change.key === "nsfw") {
              embed.addFields({
                name: "Age Restricted",
                value: `${change.old ? "Yes" : "No"} → ${
                  change.new ? "Yes" : "No"
                }`,
                inline: true,
              });
            } else if (change.key === "user_limit") {
              embed.addFields({
                name: "User Limit",
                value: `${change.old || "Unlimited"} → ${
                  change.new || "Unlimited"
                }`,
                inline: true,
              });
            } else if (change.key === "default_auto_archive_duration") {
              // Thread hide after inactivity
              const formatDuration = (mins: number | undefined): string => {
                if (!mins) return "Default";
                if (mins === 60) return "1 Hour";
                if (mins === 1440) return "1 Day";
                if (mins === 4320) return "3 Days";
                if (mins === 10080) return "1 Week";
                return `${mins} minutes`;
              };
              embed.addFields({
                name: "Hide After Inactivity",
                value: `${formatDuration(
                  change.old as number
                )} → ${formatDuration(change.new as number)}`,
                inline: true,
              });
            } else if (change.key === "default_thread_rate_limit_per_user") {
              const oldLimit = (change.old as number) || 0;
              const newLimit = (change.new as number) || 0;
              embed.addFields({
                name: "Thread Slowmode",
                value: `${oldLimit === 0 ? "Off" : `${oldLimit}s`} → ${
                  newLimit === 0 ? "Off" : `${newLimit}s`
                }`,
                inline: true,
              });
            }
          }
        }
        break;
    }

    await this.loggingChannels.channels.send({ embeds: [embed] });
  }

  private async logGuildUpdate(
    entry: GuildAuditLogsEntry,
    _guild: Guild
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(Colors.DarkButNotBlack)
      .setTitle("Server Settings Updated");

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    const changes: string[] = [];

    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.key === "name") {
          changes.push(`**Server Name:** ${change.old} → ${change.new}`);
        } else if (change.key === "icon_hash") {
          changes.push(`**Server Icon:** Updated`);
        } else if (change.key === "verification_level") {
          const levels = ["None", "Low", "Medium", "High", "Highest"];
          changes.push(
            `**Verification Level:** ${
              levels[change.old as number] || change.old
            } → ${levels[change.new as number] || change.new}`
          );
        } else if (change.key === "default_message_notifications") {
          const notifLevels = ["All Messages", "Only Mentions"];
          changes.push(
            `**Default Notifications:** ${
              notifLevels[change.old as number] || change.old
            } → ${notifLevels[change.new as number] || change.new}`
          );
        } else if (change.key === "description") {
          changes.push(
            `**Description:** ${change.old || "*None*"} → ${
              change.new || "*None*"
            }`
          );
        } else if (change.key === "discovery_splash_hash") {
          changes.push(`**Discovery Splash:** Updated`);
        } else if (change.key === "banner_hash") {
          changes.push(`**Server Banner:** Updated`);
        } else if (change.key === "afk_channel_id") {
          changes.push(
            `**AFK Channel:** ${change.old ? `<#${change.old}>` : "None"} → ${
              change.new ? `<#${change.new}>` : "None"
            }`
          );
        } else if (change.key === "afk_timeout") {
          changes.push(
            `**AFK Timeout:** ${(change.old as number) / 60}min → ${
              (change.new as number) / 60
            }min`
          );
        } else if (change.key === "system_channel_id") {
          changes.push(
            `**System Channel:** ${
              change.old ? `<#${change.old}>` : "None"
            } → ${change.new ? `<#${change.new}>` : "None"}`
          );
        } else if (change.key === "premium_progress_bar_enabled") {
          changes.push(
            `**Boost Progress Bar:** ${change.old ? "Enabled" : "Disabled"} → ${
              change.new ? "Enabled" : "Disabled"
            }`
          );
        }
      }
    }

    if (changes.length === 0) {
      changes.push("Server settings were modified");
    }

    embed.setDescription(changes.join("\n"));

    await this.loggingChannels.server.send({ embeds: [embed] });
  }

  private async logInviteUpdate(
    entry: GuildAuditLogsEntry,
    target: Invite | null
  ): Promise<void> {
    const embed = new EmbedBuilder().setColor(Colors.Fuchsia);

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    const inviteCode = target?.code || entry.targetId || null;
    const inviteLink = inviteCode
      ? `https://discord.gg/${inviteCode}`
      : "Unknown";

    switch (entry.action) {
      case AuditLogEvent.InviteCreate:
        embed.setTitle("Invite Created");
        if (inviteCode) {
          embed.setDescription(`**Invite Link:** ${inviteLink}`);
        }
        if (target?.channel) {
          embed.addFields({
            name: "Channel",
            value: `${target.channel}`,
            inline: true,
          });
        }
        if (target?.maxUses) {
          embed.addFields({
            name: "Max Uses",
            value:
              target.maxUses === 0 ? "Unlimited" : target.maxUses.toString(),
            inline: true,
          });
        }
        if (target?.maxAge !== undefined && target.maxAge !== null) {
          embed.addFields({
            name: "Expires",
            value:
              target.maxAge === 0 ? "Never" : `${target.maxAge / 3600} hours`,
            inline: true,
          });
        }
        break;
      case AuditLogEvent.InviteDelete:
        embed.setTitle("Invite Deleted");
        if (inviteCode) {
          embed.setDescription(`**Invite Link:** ~~${inviteLink}~~`);
        }
        break;
    }

    await this.loggingChannels.invites.send({ embeds: [embed] });
  }

  private async logEmojiUpdate(
    entry: GuildAuditLogsEntry,
    target: GuildEmoji
  ): Promise<void> {
    const embed = new EmbedBuilder().setColor(Colors.Yellow);

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    switch (entry.action) {
      case AuditLogEvent.EmojiCreate:
        embed
          .setTitle("Emoji Created")
          .setDescription(`**Emoji:** ${target}`)
          .addFields(
            { name: "Name", value: target.name || "Unknown", inline: true },
            {
              name: "Animated",
              value: target.animated ? "Yes" : "No",
              inline: true,
            }
          );
        if (target.imageURL) {
          embed.setThumbnail(target.imageURL());
        }
        break;
      case AuditLogEvent.EmojiDelete:
        const deletedName =
          entry.changes?.find((c) => c.key === "name")?.old ||
          target?.name ||
          "Unknown";
        embed.setTitle("Emoji Deleted").addFields({
          name: "Name",
          value: String(deletedName),
          inline: true,
        });
        break;
      case AuditLogEvent.EmojiUpdate:
        embed.setTitle("Emoji Updated").setDescription(`**Emoji:** ${target}`);
        if (target.imageURL) {
          embed.setThumbnail(target.imageURL());
        }
        break;
    }

    await this.loggingChannels.emojis.send({ embeds: [embed] });
  }

  private async logStickerUpdate(
    entry: GuildAuditLogsEntry,
    target: any
  ): Promise<void> {
    const embed = new EmbedBuilder().setColor(Colors.Purple);

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    // Get sticker name from target or audit log changes
    const stickerName =
      target?.name ??
      entry.changes?.find((c) => c.key === "name")?.new ??
      entry.changes?.find((c) => c.key === "name")?.old ??
      "Unknown";

    // Get sticker URL if available
    const stickerId = target?.id ?? entry.targetId;
    const stickerUrl = stickerId
      ? `https://cdn.discordapp.com/stickers/${stickerId}.png`
      : null;

    switch (entry.action) {
      case AuditLogEvent.StickerCreate:
        embed
          .setTitle("Sticker Created")
          .setDescription(`**Name:** ${stickerName}`);
        if (stickerId) {
          embed.addFields({
            name: "ID",
            value: stickerId,
            inline: true,
          });
        }
        if (stickerUrl) {
          embed.setThumbnail(stickerUrl);
        }
        break;
      case AuditLogEvent.StickerDelete:
        const deletedStickerName =
          entry.changes?.find((c) => c.key === "name")?.old ?? stickerName;
        embed
          .setTitle("Sticker Deleted")
          .setDescription(`**Name:** ${deletedStickerName}`);
        break;
      case AuditLogEvent.StickerUpdate:
        embed
          .setTitle("Sticker Updated")
          .setDescription(`**Name:** ${stickerName}`);
        if (stickerUrl) {
          embed.setThumbnail(stickerUrl);
        }
        // Show what changed
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.key === "name") {
              embed.addFields({
                name: "Name Changed",
                value: `${change.old} → ${change.new}`,
                inline: true,
              });
            } else if (change.key === "description") {
              embed.addFields({
                name: "Description Changed",
                value: `${change.old || "*None*"} → ${change.new || "*None*"}`,
                inline: false,
              });
            }
          }
        }
        break;
    }

    await this.loggingChannels.stickers.send({ embeds: [embed] });
  }

  private async logIntegrationUpdate(
    entry: GuildAuditLogsEntry,
    target: any
  ): Promise<void> {
    const embed = new EmbedBuilder().setColor(Colors.Green);

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    const integrationName =
      target?.name ?? entry.targetId ?? "Unknown Integration";

    switch (entry.action) {
      case AuditLogEvent.IntegrationCreate:
        embed
          .setTitle("Integration Added")
          .setDescription(`**Name:** ${integrationName}`);
        break;
      case AuditLogEvent.IntegrationDelete:
        embed
          .setTitle("Integration Removed")
          .setDescription(`**Name:** ${integrationName}`);
        break;
      case AuditLogEvent.IntegrationUpdate:
        embed
          .setTitle("Integration Updated")
          .setDescription(`**Name:** ${integrationName}`);
        break;
    }

    await this.loggingChannels.integrations.send({ embeds: [embed] });
  }

  private async logWebhookUpdate(
    entry: GuildAuditLogsEntry,
    target: any
  ): Promise<void> {
    const embed = new EmbedBuilder().setColor(Colors.Blue);

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
      embed.addFields({
        name: "By",
        value: formatUser(entry.executor),
        inline: true,
      });
    }

    const webhookName = target?.name ?? entry.targetId ?? "Unknown Webhook";

    switch (entry.action) {
      case AuditLogEvent.WebhookCreate:
        embed
          .setTitle("Webhook Created")
          .setDescription(`**Name:** ${webhookName}`);
        if (target?.channel) {
          embed.addFields({
            name: "Channel",
            value: `${target.channel}`,
            inline: true,
          });
        }
        break;
      case AuditLogEvent.WebhookDelete:
        embed
          .setTitle("Webhook Deleted")
          .setDescription(`**Name:** ${webhookName}`);
        break;
      case AuditLogEvent.WebhookUpdate:
        embed
          .setTitle("Webhook Updated")
          .setDescription(`**Name:** ${webhookName}`);
        break;
    }

    await this.loggingChannels.integrations.send({ embeds: [embed] });
  }

  private async logApplicationCommandUpdate(
    entry: GuildAuditLogsEntry
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(Colors.DarkGold)
      .setTitle("Application Command Permissions Updated");

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
      embed.addFields({
        name: "By",
        value: formatUser(entry.executor),
        inline: true,
      });
    }

    embed.setDescription(
      `**Target:** ${
        entry.targetId ? `<@${entry.targetId}> / ${entry.targetId}` : "Unknown"
      }`
    );

    await this.loggingChannels.integrations.send({ embeds: [embed] });
  }

  private async logMemberRoleUpdate(
    entry: GuildAuditLogsEntry,
    target: GuildMember | null
  ): Promise<void> {
    const targetInfo = target
      ? formatUser(target)
      : entry.targetId
      ? `<@${entry.targetId}> / ${entry.targetId}`
      : "Unknown";

    const embed = new EmbedBuilder()
      .setColor(Colors.Purple)
      .setTitle("Member Roles Changed")
      .setDescription(`**User:** ${targetInfo}`);

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    if (target) {
      embed.setThumbnail(target.user.displayAvatarURL());
    }

    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.key === "$add" || change.key === "$remove") {
          const roleArray = Array.isArray(change.new)
            ? change.new
            : Array.isArray(change.old)
            ? change.old
            : undefined;

          if (roleArray && roleArray.length > 0) {
            // Extract role names only
            const rolesFormatted = (
              roleArray as Array<{ id: string; name: string }>
            )
              .map((role) => {
                if (
                  typeof role === "object" &&
                  role !== null &&
                  "name" in role
                ) {
                  return role.name || "Unknown Role";
                }
                return "Unknown Role";
              })
              .join(", ");

            embed.addFields({
              name:
                change.key === "$add" ? "✅ Roles Added" : "❌ Roles Removed",
              value: rolesFormatted.substring(0, 1024) || "Unknown",
              inline: false,
            });
          }
        }
      }
    }

    if (entry.reason) {
      embed.addFields({
        name: "Reason",
        value: entry.reason,
        inline: false,
      });
    }
    await this.loggingChannels.roles.send({ embeds: [embed] });
  }

  private async logBotAdded(
    entry: GuildAuditLogsEntry,
    target: User
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(Colors.Fuchsia)
      .setTitle("Bot Added to Server")
      .setDescription(`**Bot:** ${formatUser(target)}`)
      .setThumbnail(target.displayAvatarURL());

    if (entry.executor) {
      embed.setAuthor({
        name: formatUserForTitle(entry.executor),
        iconURL: entry.executor.displayAvatarURL(),
      });
      embed.addFields({
        name: "Added By",
        value: formatUser(entry.executor),
        inline: true,
      });
    }

    await this.loggingChannels.integrations.send({ embeds: [embed] });
  }

  private async onInviteCreate(invite: Invite): Promise<void> {
    if (!this.isReady || invite.guild?.id !== CONFIG.targetGuildId) return;

    try {
      // Update invite cache
      this.inviteCache.set(invite.code, {
        uses: invite.uses || 0,
        inviter: invite.inviter,
      });
    } catch (error) {
      console.error("Error | Caching invite create:", error);
    }
  }

  private async onInviteDelete(invite: Invite): Promise<void> {
    if (!this.isReady || invite.guild?.id !== CONFIG.targetGuildId) return;

    try {
      this.inviteCache.delete(invite.code);
    } catch (error) {
      console.error("Error | Removing invite from cache:", error);
    }
  }

  private async onScheduledEventCreate(
    event: GuildScheduledEvent
  ): Promise<void> {
    if (!this.isReady || event.guild?.id !== CONFIG.targetGuildId) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("Scheduled Event Created")
        .setDescription(`**${event.name}**`)
        .addFields(
          {
            name: "Description",
            value: event.description || "*No description*",
            inline: false,
          },
          {
            name: "Start Time",
            value: event.scheduledStartAt
              ? `<t:${Math.floor(event.scheduledStartAt.getTime() / 1000)}:F>`
              : "Not set",
            inline: true,
          },
          {
            name: "End Time",
            value: event.scheduledEndAt
              ? `<t:${Math.floor(event.scheduledEndAt.getTime() / 1000)}:F>`
              : "Not set",
            inline: true,
          },
          {
            name: "Location",
            value:
              event.entityMetadata?.location ||
              event.channel?.toString() ||
              "Not specified",
            inline: true,
          }
        );

      if (event.creator) {
        embed.setAuthor({
          name: formatUserForTitle(event.creator),
          iconURL: event.creator.displayAvatarURL(),
        });
        embed.addFields({
          name: "Created By",
          value: formatUser(event.creator),
          inline: true,
        });
      }

      if (event.coverImageURL()) {
        embed.setImage(event.coverImageURL({ size: 512 }));
      }

      await this.loggingChannels.events.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging scheduled event create:", error);
    }
  }

  private async onScheduledEventDelete(
    event: GuildScheduledEvent
  ): Promise<void> {
    if (!this.isReady || event.guild?.id !== CONFIG.targetGuildId) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle("Scheduled Event Deleted")
        .setDescription(`**${event.name}**`)
        .addFields({
          name: "Was Scheduled For",
          value: event.scheduledStartAt
            ? `<t:${Math.floor(event.scheduledStartAt.getTime() / 1000)}:F>`
            : "Unknown",
          inline: true,
        });

      if (event.creator) {
        embed.setAuthor({
          name: formatUserForTitle(event.creator),
          iconURL: event.creator.displayAvatarURL(),
        });
      }

      await this.loggingChannels.events.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging scheduled event delete:", error);
    }
  }

  private async onScheduledEventUpdate(
    oldEvent: GuildScheduledEvent | null,
    newEvent: GuildScheduledEvent
  ): Promise<void> {
    if (!this.isReady || newEvent.guild?.id !== CONFIG.targetGuildId) return;

    try {
      const changes: string[] = [];
      let title = "Scheduled Event Updated";

      // Check for status changes
      if (oldEvent?.status !== newEvent.status) {
        const statusNames: Record<number, string> = {
          [GuildScheduledEventStatus.Scheduled]: "Scheduled",
          [GuildScheduledEventStatus.Active]: "Active (Started)",
          [GuildScheduledEventStatus.Completed]: "Completed",
          [GuildScheduledEventStatus.Canceled]: "Canceled",
        };
        const oldStatus = oldEvent?.status
          ? statusNames[oldEvent.status] || "Unknown"
          : "Unknown";
        const newStatus = statusNames[newEvent.status] || "Unknown";

        if (newEvent.status === GuildScheduledEventStatus.Active) {
          title = "Scheduled Event Started";
        } else if (newEvent.status === GuildScheduledEventStatus.Completed) {
          title = "Scheduled Event Ended";
        } else if (newEvent.status === GuildScheduledEventStatus.Canceled) {
          title = "Scheduled Event Canceled";
        } else {
          changes.push(`**Status:** ${oldStatus} → ${newStatus}`);
        }
      }

      if (oldEvent?.name !== newEvent.name) {
        changes.push(
          `**Name:** ${oldEvent?.name || "Unknown"} → ${newEvent.name}`
        );
      }

      if (oldEvent?.description !== newEvent.description) {
        changes.push(`**Description:** Updated`);
      }

      if (
        oldEvent?.scheduledStartAt?.getTime() !==
        newEvent.scheduledStartAt?.getTime()
      ) {
        const oldTime = oldEvent?.scheduledStartAt
          ? `<t:${Math.floor(oldEvent.scheduledStartAt.getTime() / 1000)}:F>`
          : "Not set";
        const newTime = newEvent.scheduledStartAt
          ? `<t:${Math.floor(newEvent.scheduledStartAt.getTime() / 1000)}:F>`
          : "Not set";
        changes.push(`**Start Time:** ${oldTime} → ${newTime}`);
      }

      const embed = new EmbedBuilder()
        .setColor(
          newEvent.status === GuildScheduledEventStatus.Active
            ? Colors.Green
            : newEvent.status === GuildScheduledEventStatus.Completed
            ? Colors.Blue
            : newEvent.status === GuildScheduledEventStatus.Canceled
            ? Colors.Red
            : Colors.Gold
        )
        .setTitle(title)
        .setDescription(
          `**${newEvent.name}**${
            changes.length > 0 ? "\n\n" + changes.join("\n") : ""
          }`
        );

      if (newEvent.creator) {
        embed.setAuthor({
          name: formatUserForTitle(newEvent.creator),
          iconURL: newEvent.creator.displayAvatarURL(),
        });
      }

      if (newEvent.userCount) {
        embed.addFields({
          name: "Interested Users",
          value: newEvent.userCount.toString(),
          inline: true,
        });
      }

      await this.loggingChannels.events.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging scheduled event update:", error);
    }
  }

  private async onScheduledEventUserAdd(
    event: GuildScheduledEvent,
    user: User
  ): Promise<void> {
    if (!this.isReady || event.guild?.id !== CONFIG.targetGuildId) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("User Interested in Event")
        .setDescription(`**Event:** ${event.name}`)
        .setAuthor({
          name: formatUserForTitle(user),
          iconURL: user.displayAvatarURL(),
        })
        .addFields({
          name: "User",
          value: formatUser(user),
          inline: true,
        });

      if (event.userCount) {
        embed.addFields({
          name: "Total Interested",
          value: event.userCount.toString(),
          inline: true,
        });
      }

      await this.loggingChannels.events.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging scheduled event user add:", error);
    }
  }

  private async onScheduledEventUserRemove(
    event: GuildScheduledEvent,
    user: User
  ): Promise<void> {
    if (!this.isReady || event.guild?.id !== CONFIG.targetGuildId) return;

    try {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle("User No Longer Interested in Event")
        .setDescription(`**Event:** ${event.name}`)
        .setAuthor({
          name: formatUserForTitle(user),
          iconURL: user.displayAvatarURL(),
        })
        .addFields({
          name: "User",
          value: formatUser(user),
          inline: true,
        });

      await this.loggingChannels.events.send({ embeds: [embed] });
    } catch (error) {
      console.error("Error | Logging scheduled event user remove:", error);
    }
  }
  async start(): Promise<void> {
    try {
      await this.client.login(CONFIG.token);
    } catch (error) {
      console.error("Error | Failed to login:", error);
      process.exit(1);
    }
  }
}

const bot = new c0rd();
bot.start();
