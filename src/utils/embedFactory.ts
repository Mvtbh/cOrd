import {
  EmbedBuilder,
  Colors,
  User,
  GuildMember,
  GuildAuditLogsEntry,
  Role,
  Message,
  VoiceState,
  PartialGuildMember,
  GuildChannel,
} from "discord.js";

export class EmbedFactory {
  static createBaseEmbed(): EmbedBuilder {
    return new EmbedBuilder();
  }

  static createModerationEmbed(
    entry: GuildAuditLogsEntry,
    _target: User | GuildMember | null,
    actionType: string,
    description: string
  ): EmbedBuilder {
    const embed = this.createBaseEmbed()
      .setColor(Colors.Red)
      .setTitle(actionType)
      .setDescription(description);

    if (entry.executor) {
      embed.setAuthor({
        name: entry.executor.tag ?? entry.executor.username ?? "Unknown User",
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    return embed;
  }

  static createMessageDeleteEmbed(
    message: Message,
    deletedBy?: User
  ): { embed: EmbedBuilder; mediaUrls: string[] } {
    const embed = this.createBaseEmbed()
      .setColor(Colors.Red)
      .setTitle("Message Deleted");

    const mediaUrls: string[] = [];

    if (message.author) {
      const displayName =
        message.member?.displayName ||
        message.author.globalName ||
        message.author.username;
      embed.setAuthor({
        name: `${displayName} (${message.author.username}) / ${message.author.id}`,
        iconURL: message.author.displayAvatarURL(),
      });
    }

    const images: string[] = [];
    const gifs: string[] = [];
    const videos: string[] = [];
    const otherFiles: { name: string; url: string }[] = [];

    if (message.attachments.size > 0) {
      message.attachments.forEach((a) => {
        const url = a.proxyURL || a.url;
        const isGif = a.contentType === "image/gif" || a.name?.endsWith(".gif");
        const isImage = a.contentType?.startsWith("image/") && !isGif;
        const isVideo = a.contentType?.startsWith("video/");

        if (isGif) {
          gifs.push(url);
        } else if (isImage) {
          images.push(url);
        } else if (isVideo) {
          videos.push(url);
        } else {
          otherFiles.push({ name: a.name || "file", url });
        }
      });
    }

    // Pull out media links from content
    const urlRegex =
      /(https?:\/\/[^\s]+\.(gif|png|jpg|jpeg|webp|mp4|webm|mov)(\?[^\s]*)?)/gi;
    const tenorGiphyRegex =
      /(https?:\/\/(tenor\.com|giphy\.com|media\.tenor\.com|media\.giphy\.com|i\.imgur\.com|imgur\.com\/[a-zA-Z0-9]+)[^\s]*)/gi;

    let contentWithoutMedia = message.content || "";
    const contentMediaUrls: string[] = [];

    const directMatches = message.content?.match(urlRegex) || [];
    for (const url of directMatches) {
      contentMediaUrls.push(url);
      contentWithoutMedia = contentWithoutMedia.replace(url, "").trim();
    }

    const embedMatches = message.content?.match(tenorGiphyRegex) || [];
    for (const url of embedMatches) {
      if (!contentMediaUrls.includes(url)) {
        contentMediaUrls.push(url);
        contentWithoutMedia = contentWithoutMedia.replace(url, "").trim();
      }
    }

    const hasAttachments =
      images.length > 0 ||
      gifs.length > 0 ||
      videos.length > 0 ||
      otherFiles.length > 0;
    const hasStickers = message.stickers.size > 0;
    const hasContentMedia = contentMediaUrls.length > 0;

    if (contentWithoutMedia) {
      embed.setDescription(
        `**Content:**\n${contentWithoutMedia.substring(0, 2000)}`
      );
    } else if (!hasAttachments && !hasStickers && !hasContentMedia) {
      embed.setDescription("*No text content*");
    }

    embed.addFields({
      name: "Channel",
      value: `${message.channel}`,
      inline: true,
    });

    if (deletedBy && deletedBy.id !== message.author.id) {
      const deleterDisplay = deletedBy.globalName || deletedBy.username;
      embed.addFields({
        name: "Deleted By",
        value: `${deleterDisplay} (${deletedBy.username}) / ${deletedBy.id}`,
        inline: true,
      });
    }

    if (hasAttachments) {
      // Non-visual files go in a field
      if (otherFiles.length > 0) {
        const fileList = otherFiles
          .map((f) => `📎 [${f.name}](${f.url})`)
          .join("\n");
        embed.addFields({
          name: "Files",
          value: fileList.substring(0, 1024),
          inline: false,
        });
      }

      if (images.length > 0) {
        embed.setImage(images[0]);
        mediaUrls.push(...images.slice(1));
      }

      // GIFs need to be separate to animate
      mediaUrls.push(...gifs);

      // Videos need to be separate too
      mediaUrls.push(...videos);
    }

    // Media from message content goes separate too
    mediaUrls.push(...contentMediaUrls);

    if (message.stickers.size > 0) {
      const stickerNames = message.stickers.map((s) => s.name).join(", ");
      const firstSticker = message.stickers.first();

      const currentDescription = embed.data.description || "";
      const stickerContent =
        message.stickers.size === 1
          ? `**Sticker:** ${stickerNames}`
          : `**Stickers:** ${stickerNames}`;
      embed.setDescription(
        currentDescription
          ? `${currentDescription}\n\n${stickerContent}`
          : stickerContent
      );

      if (firstSticker && !embed.data.image) {
        const stickerUrl = `https://cdn.discordapp.com/stickers/${firstSticker.id}.png`;
        embed.setImage(stickerUrl);
      }
    }

    return { embed, mediaUrls };
  }

  static createMessageEditEmbed(
    oldMessage: Message,
    newMessage: Message
  ): EmbedBuilder {
    const embed = this.createBaseEmbed()
      .setColor(Colors.Blue)
      .setTitle("Message Edited")
      .setDescription(`[Jump to Message](${newMessage.url})`);

    if (newMessage.author) {
      const displayName =
        newMessage.member?.displayName ||
        newMessage.author.globalName ||
        newMessage.author.username;
      embed.setAuthor({
        name: `${displayName} (${newMessage.author.username}) / ${newMessage.author.id}`,
        iconURL: newMessage.author.displayAvatarURL(),
      });
    }

    embed.addFields({
      name: "Channel",
      value: `${newMessage.channel}`,
      inline: true,
    });

    if (oldMessage.content !== newMessage.content) {
      embed.addFields(
        {
          name: "Before",
          value: oldMessage.content?.substring(0, 1024) || "*No text content*",
        },
        {
          name: "After",
          value: newMessage.content?.substring(0, 1024) || "*No text content*",
        }
      );
    }

    if (newMessage.attachments.size > 0) {
      const attachmentList = newMessage.attachments
        .map((a) => {
          const isImage = a.contentType?.startsWith("image/");
          const isVideo = a.contentType?.startsWith("video/");
          const isGif =
            a.contentType === "image/gif" || a.name?.endsWith(".gif");
          const type = isGif
            ? "GIF"
            : isImage
            ? "Image"
            : isVideo
            ? "Video"
            : "File";
          return `${type}: [${a.name}](${a.url})`;
        })
        .join("\n");

      embed.addFields({
        name: "Attachments",
        value: attachmentList.substring(0, 1024),
        inline: false,
      });

      const firstImage = newMessage.attachments.find(
        (a) =>
          a.contentType?.startsWith("image/") && !a.contentType?.includes("gif")
      );
      if (firstImage) {
        embed.setImage(firstImage.url);
      }
    }

    if (newMessage.stickers.size > 0) {
      const stickerList = newMessage.stickers
        .map((s) => {
          const stickerUrl = `https://cdn.discordapp.com/stickers/${s.id}.png`;
          return `[${s.name}](${stickerUrl})`;
        })
        .join(", ");

      embed.addFields({
        name: "Stickers",
        value: stickerList.substring(0, 1024),
        inline: true,
      });
    }

    return embed;
  }

  static createMemberJoinEmbed(member: GuildMember): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(Colors.Green)
      .setTitle("Member Joined")
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: "User", value: `${member} (${member.user.tag})`, inline: true },
        { name: "ID", value: member.id, inline: true },
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
  }

  static createMemberLeaveEmbed(
    member: GuildMember | PartialGuildMember
  ): EmbedBuilder {
    const embed = this.createBaseEmbed()
      .setColor(Colors.Red)
      .setTitle("Member Left")
      .addFields({ name: "ID", value: member.id, inline: true });

    if (member.user) {
      embed.setThumbnail(member.user.displayAvatarURL());
      embed.addFields({
        name: "User",
        value: `${member.user} (${member.user.tag})`,
        inline: true,
      });
    }

    if (member.guild) {
      embed.addFields({
        name: "Member Count",
        value: member.guild.memberCount.toString(),
        inline: true,
      });
    }

    return embed;
  }

  static createVoiceStateEmbed(
    _oldState: VoiceState,
    newState: VoiceState,
    action: string
  ): EmbedBuilder {
    return this.createBaseEmbed()
      .setColor(Colors.Purple)
      .setTitle("Voice State Update")
      .setDescription(action)
      .addFields(
        {
          name: "User",
          value: `${newState.member} (${
            newState.member?.user.tag || "Unknown"
          })`,
          inline: true,
        },
        { name: "User ID", value: newState.id, inline: true }
      );
  }

  static createRoleEmbed(
    entry: GuildAuditLogsEntry,
    _role: Role | null,
    action: string
  ): EmbedBuilder {
    const embed = this.createBaseEmbed()
      .setColor(Colors.Orange)
      .setTitle(action);

    if (entry.executor) {
      embed.setAuthor({
        name: entry.executor.tag ?? entry.executor.username ?? "Unknown User",
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    return embed;
  }

  static createChannelEmbed(
    entry: GuildAuditLogsEntry,
    _channel: GuildChannel | null,
    action: string
  ): EmbedBuilder {
    const embed = this.createBaseEmbed()
      .setColor(Colors.LuminousVividPink)
      .setTitle(action);

    if (entry.executor) {
      embed.setAuthor({
        name: entry.executor.tag ?? entry.executor.username ?? "Unknown User",
        iconURL: entry.executor.displayAvatarURL(),
      });
    }

    return embed;
  }
}
