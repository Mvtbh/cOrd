# cOrd

A Simple Discord logging bot that tracks most of the things happening in your server And sending them to a separate server.

## Quick Start

**Windows:**

```cmd
start.bat
```

**Linux/Mac:**

```bash
./start.sh
```

The scripts will automatically install dependencies, build the project, and start the bot.

## Setup

1. Clone this repo
2. Copy `.env.example` to `.env` (or create `.env` from scratch)
3. Fill in your bot token and server IDs
4. Run `start.bat` (Windows) or `./start.sh` (Linux)

### Config

```env
DISCORD_TOKEN=your_bot_token_here
LOGGING_GUILD_ID=logging_server_id
TARGET_GUILD_ID=server_to_monitor_id
MODERATOR_ROLE_ID=role_id_to_ping (optional, since it only pings for certain moderation actions)
```

## Dev Portal

Enable these intents:

- Server Members Intent
- Message Content Intent
- Presence Intent

Bot Needs:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- View Audit Log
- Manage Channels

Permissions For Both Servers

## Running with PM2

For production with auto-restart:

```bash
npm install -g pm2
npm run build
pm2 start ecosystem.config.json
pm2 save
```

## Docker

Build and run:

```bash
docker-compose up -d
```

View logs:

```bash
docker-compose logs -f
```

Stop:

```bash
docker-compose down
```

## What Gets Logged

The bot creates channels for different log types:

**Moderation** - bans, kicks, timeouts, voice disconnects  
**Messages** - deletes, edits  
**Members** - nickname changes, profile updates  
**Voice** - joins, leaves, mutes, streaming  
**Roles** - creation, deletion, updates, member role changes  
**Channels** - creation, deletion, permission changes  
**Server** - settings changes, boosts  
**Invites** - creation, deletion, who joined with what invite  
**Emojis/Stickers** - creation, deletion, updates  
**Reactions** - additions and removals  
**Threads** - creation, archiving  
**AutoMod** - rule executions  
**Integrations** - webhooks, bots  
**Joins/Leaves** - member join/leave with details  
**Screenshare** - streaming and video events  
**Polls** - vote tracking - WIP  
**Events** - scheduled events and RSVPs - WIP

## Manual Build

```bash
npm install
npm run build
npm start
```
