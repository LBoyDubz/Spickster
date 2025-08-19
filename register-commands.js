import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, ChannelType } from 'discord.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in .env');
  process.exit(1);
}

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
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash command registered for this guild!');
  } catch (err) {
    console.error(err);
  }
})();
