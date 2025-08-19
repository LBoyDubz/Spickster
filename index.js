import 'dotenv/config';
import express from "express";
import fs from 'fs-extra';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  OverwriteType,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  throw new Error("❌ Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in environment");
}

const app = express();
app.get("/", (req, res) => {
  res.send("✅ Bot is alive!");
});

app.listen(3000, () => {
  console.log("🌐 Keep-alive server running on port 3000");
});

// ========== command registration ==========
const commands = [
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post a Ticket Tool–style panel to create tickets')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to post the panel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
    .addChannelOption(opt =>
      opt.setName('tickets_parent')
        .setDescription('Category where ticket channels will be created')
        .addChannelTypes(ChannelType.GuildCategory))
    // only admins can run it
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .toJSON()
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('✅ Slash commands registered for this guild');
}

// ========== ticket counter ==========
const DATA_ROOT = process.env.DATA_DIR || 'data';
const DATA_PATH = `${DATA_ROOT}/tickets.json`;
await fs.ensureDir(DATA_ROOT);
await fs.ensureFile(DATA_PATH);
if (!(await fs.readFile(DATA_PATH, 'utf8')).trim()) {
  await fs.outputJson(DATA_PATH, { counter: 0 }, { spaces: 2 });
}
function pad(n) { return n.toString().padStart(4, '0'); }
async function nextTicketNumber() {
  const data = await fs.readJson(DATA_PATH);
  data.counter = (data.counter ?? 0) + 1;
  await fs.writeJson(DATA_PATH, data, { spaces: 2 });
  return data.counter;
}

// ========== client ==========
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async (i) => {
  try {
    // Slash: /ticket-panel  (admins only)
    if (i.isChatInputCommand() && i.commandName === 'ticket-panel') {
      const panelChannel = i.options.getChannel('channel', true);
      const parentCategory = i.options.getChannel('tickets_parent') ?? null;

      const btn = new ButtonBuilder()
        .setCustomId(JSON.stringify({ t: 'create', parentId: parentCategory?.id || null }))
        .setLabel('Create Report')
        .setEmoji('📩')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(btn);
      const embed = new EmbedBuilder()
        .setTitle('Support Tickets')
        .setDescription('To create a Report click the button 📩')
        .setColor(0xfefa1c);

      await panelChannel.send({ embeds: [embed], components: [row] });
      await i.reply({ content: `Panel posted in ${panelChannel}`, ephemeral: true });
      return;
    }

    // Buttons
    if (i.isButton()) {
      let data;
      try { data = JSON.parse(i.customId); } catch { /* not our button */ }
      if (!data?.t) return;

      // Always ACK within 3s so you don't get "Interaction failed"
      await i.deferReply({ ephemeral: true });

      if (data.t === 'create') {
        // Preflight: figure out parent category (if any)
        const parentId = data.parentId || null;
        let parent = null;
        if (parentId) {
          parent = await i.guild.channels.fetch(parentId).catch(() => null);
          if (!parent || parent.type !== ChannelType.GuildCategory) {
            await i.editReply('The configured ticket category is missing or not a category. I will create the ticket at the top level.');
            parent = null;
          }
        }

        // Check perms where we will create the channel
        const me = await i.guild.members.fetchMe();
        const where = parent ?? i.guild; // category or guild root
        const perms = parent
          ? parent.permissionsFor(me)
          : i.guild.members.me.permissions;

        const need = [
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
        ];
        if (!need.every(p => perms.has(p))) {
          await i.editReply('I do not have enough permissions to create a ticket channel here. Ensure I have **Administrator** or **Manage Channels** on the target category/server.');
          return;
        }

        // Create channel
        try {
          const number = await nextTicketNumber(); // starts at 1
          const slug = `ticket-${pad(number)}`;

          const overwrites = [
            { id: i.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel], type: OverwriteType.Role },
            { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory], type: OverwriteType.Member },
          ];
          if (process.env.SUPPORT_ROLE_ID) {
            overwrites.push({
              id: process.env.SUPPORT_ROLE_ID,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
              type: OverwriteType.Role
            });
          }

          const ch = await i.guild.channels.create({
            name: slug,
            type: ChannelType.GuildText,
            parent: parent?.id,
            permissionOverwrites: overwrites,
            topic: `Ticket for ${i.user.tag} • #${pad(number)}`
          });

          const closeBtn = new ButtonBuilder()
            .setCustomId(JSON.stringify({ t: 'close', ch: ch.id, opener: i.user.id }))
            .setLabel('Close')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary);

          const row = new ActionRowBuilder().addComponents(closeBtn);
          const welcome = new EmbedBuilder()
            .setDescription(`**Welcome <@${i.user.id}>**\nSupport will be with you shortly.\nTo close this ticket click **🔒 Close**.`)
            .setColor(0xfefa1c);

          await ch.send({ content: `<@${i.user.id}>`, embeds: [welcome], components: [row] });
          await i.editReply(`✓ Ticket Created  <#${ch.id}> (${slug})`);
          return;
        } catch (err) {
          console.error('Create channel failed:', err);

          // Helpful messages for common cases
          if (err.code === 60003) {
            await i.editReply('Discord blocked channel creation with **“Two factor is required for this operation”**.\nAsk the **server owner** to either enable 2FA on their account **or** toggle off **“Require 2FA for moderation actions”** (Server Settings → Moderation). Then try again.');
            return;
          }
          if (err.code === 50013) {
            await i.editReply('I’m missing permissions to create a channel here. Give the bot **Administrator** (or at least **Manage Channels**) and make sure category overrides don’t block me.');
            return;
          }
          await i.editReply('Something went wrong creating the ticket. Check my role position and category permissions, then try again.');
          return;
        }
      }

      if (data.t === 'close') {
        try {
          const channel = await i.guild.channels.fetch(data.ch).catch(() => null);
          if (!channel) { await i.editReply('Channel not found.'); return; }

          await i.editReply('Closing ticket…');
          await channel.delete().catch(async () => {
            await channel.permissionOverwrites.edit(i.guild.roles.everyone, { ViewChannel: false });
            await channel.setName(`closed-${channel.name.replace(/^ticket-/, '')}`);
            await channel.send({ content: 'Ticket locked (delete failed due to perms).' });
          });
        } catch (err) {
          console.error('Close failed:', err);
          await i.editReply('Couldn’t close this ticket. Make sure I have **Manage Channels**.');
        }
      }
    }
  } catch (err) {
    console.error(err);
    if (i.isRepliable()) {
      // final fallback if something else exploded
      try { await i.reply({ content: 'Something went wrong handling that interaction.', ephemeral: true }); } catch {}
    }
  }
});

client.login(DISCORD_TOKEN);
