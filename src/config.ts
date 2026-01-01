import { config } from "dotenv";

config();

export interface BotConfig {
  token: string;
  loggingGuildId: string;
  targetGuildId: string;
  moderatorRoleId?: string;
}

export const CONFIG: BotConfig = {
  token: process.env.DISCORD_TOKEN || "",
  loggingGuildId: process.env.LOGGING_GUILD_ID || "",
  targetGuildId: process.env.TARGET_GUILD_ID || "",
  moderatorRoleId: process.env.MODERATOR_ROLE_ID,
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (!CONFIG.token) {
    errors.push("DISCORD_TOKEN is not set");
  }
  if (!CONFIG.loggingGuildId) {
    errors.push("LOGGING_GUILD_ID is not set");
  }
  if (!CONFIG.targetGuildId) {
    errors.push("TARGET_GUILD_ID is not set");
  }

  if (errors.length > 0) {
    console.error("Configuration errors:");
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }
}

export const CHANNEL_CONFIG = {
  category: {
    name: "c0rd",
  },
  channels: [
    {
      key: "moderation",
      name: "moderation",
      topic: "Logs for moderation actions (bans, kicks, timeouts)",
    },
    {
      key: "messages",
      name: "message",
      topic: "Logs for message events (deletes, edits, bulk deletes)",
    },
    {
      key: "members",
      name: "member",
      topic: "Logs for member events (nickname, profile updates)",
    },
    {
      key: "voice",
      name: "voice",
      topic:
        "Logs for voice channel events (joins, leaves, mutes, deafens, moves)",
    },
    {
      key: "roles",
      name: "role",
      topic:
        "Logs for role events (create, delete, update, permissions, assigned, removed)",
    },
    {
      key: "channels",
      name: "channel",
      topic: "Logs for channel events (create, delete, update, permissions)",
    },
    {
      key: "server",
      name: "server",
      topic: "Logs for server events (settings, boosts, banners)",
    },
    {
      key: "invites",
      name: "invite",
      topic: "Logs for invite events (create, delete, uses)",
    },
    {
      key: "emojis",
      name: "emoji",
      topic: "Logs for emoji events (create, delete, update, rename)",
    },
    {
      key: "stickers",
      name: "sticker",
      topic: "Logs for sticker events (create, delete, update)",
    },
    {
      key: "integrations",
      name: "integration",
      topic: "Logs for integrations, bots, webhooks, and applications",
    },
    {
      key: "threads",
      name: "thread",
      topic: "Logs for thread events (create, delete, archive, unarchive)",
    },
    {
      key: "stages",
      name: "stage",
      topic: "Logs for stage channel events (create, delete, updates)",
    },
    {
      key: "automod",
      name: "automod",
      topic: "Logs for auto moderation and rule executions",
    },
    {
      key: "joins",
      name: "member-join",
      topic: "Logs for member joins with inviter info and account age",
    },
    {
      key: "leaves",
      name: "member-leave",
      topic: "Logs for member leaves with role information",
    },
    {
      key: "reactions",
      name: "reaction",
      topic: "Logs for message reaction events (add, remove)",
    },
    {
      key: "screenshare",
      name: "screenshare",
      topic: "Logs for screenshare and video stream events",
    },
    {
      key: "polls",
      name: "poll",
      topic: "Logs for poll events (create, end, votes)",
    },
    {
      key: "events",
      name: "event",
      topic:
        "Logs for scheduled events (create, update, delete, user interest)",
    },
  ],
} as const;
