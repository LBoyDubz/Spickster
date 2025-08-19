import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
} from "discord.js";

const { DISCORD_TOKEN, CHANNEL_ID } = process.env;
if (!DISCORD_TOKEN || !CHANNEL_ID) {
  console.error("Missing DISCORD_TOKEN or CHANNEL_ID in .env");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---- build your message payloads here ----
function buildMessages() {
  const embed1 = new EmbedBuilder()
    .setAuthor({
      name: "Tricky's Servant",
    })
    .setTitle("OG Scrims")
    .setDescription(
      [
        "_Read carefully. Rules can update anytime — check announcements before playing._",
        "",
        "**1) General Rules**",
        "• **No Cheating / Exploits** → Any hacks, macros, glitches = **instant ban**.",
        "• **No Toxic Behavior** → Harassment, racism, or excessive trash talk not tolerated.",
        "• **Respect Staff** → Listen to admins, mods, and hosts at all times.",
        "• **Custom Codes** → Never share codes outside verified members.",
        "",
        "**2) Queueing & Matches**",
        "• **Queue Up Correctly** → Be verified & ready before queue start.",
        "• **No Code Leaking** → Sharing the custom code with non-members = **ban**.",
        "• **No Double-Queueing** → Only **one account** per player.",
        "• **Start Signal** → Don’t ready up until staff announce it.",
      ].join("\n")
    )
    .setColor(0xffd54f)
    .setTimestamp();

  const embed2 = new EmbedBuilder()
    .setDescription(
      [
        "**3) In-Game Rules**",
        "• **Storm Surge Scrims (if active)** → Follow surge rules (fight when announced).",
        "• **No Griefing** → Don’t ruin games by early W-keying unless it’s surge.",
        "• **Rotation Rules** → Play serious. No skybases, trolling, or wasting lobbies.",
        "• **No Teaming** → Don’t work with others outside your team.",
        "",
        "**4) Endgame Expectations**",
        "• Play seriously (no messing around).",
        "• Follow zone rules if set for the lobby.",
        "• Intentional griefing or rule-breaking = removal.",
      ].join("\n")
    )
    .setColor(0xffd54f);

  const embed3 = new EmbedBuilder()
    .setDescription(
      [
        "**5) Punishments**",
        "• **Warnings** → Minor issues.",
        "• **Temporary Ban** → Breaking scrim flow or minor griefing.",
        "• **Permanent Ban** → Cheating, teaming, or repeated offenses.",
        "",
        "**6) Extra Notes**",
        "• Host decisions are final.",
        "• Rules may update anytime — check announcements before playing.",
        "• Always use the correct Discord/Server tags if verification is required.",
      ].join("\n")
    )
    .setColor(0xffd54f);

  return [
    { content: "**OG Scrims Rules**", embeds: [embed1] },
    { embeds: [embed2] },
    { embeds: [embed3] },
  ];
}
// ------------------------------------------

client.once("ready", async () => {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) throw new Error("Channel not found");

    // basic diagnostics so you know what's wrong if it fails again
    if (channel.guild) {
      const me = await channel.guild.members.fetchMe();
      const perms = channel.permissionsFor(me);
      const need = {
        view: perms?.has(PermissionsBitField.Flags.ViewChannel),
        send: perms?.has(PermissionsBitField.Flags.SendMessages),
        embed: perms?.has(PermissionsBitField.Flags.EmbedLinks),
        attach: perms?.has(PermissionsBitField.Flags.AttachFiles),
        history: perms?.has(PermissionsBitField.Flags.ReadMessageHistory),
      };
      console.log("Channel type:", channel.type, "Perms:", need);
      if (!need.view || !need.send) {
        throw new Error(
          "Missing ViewChannel or SendMessages in this channel. Fix perms and retry."
        );
      }
    }

    const messages = buildMessages();

    // if it's a Forum channel, post as a new thread; else, send directly
    if (channel.type === ChannelType.GuildForum) {
      await channel.threads.create({
        name: "OG Scrims Rules",
        message: messages[0], // first message (title + embed)
        autoArchiveDuration: 10080, // 7 days
      });
      // send the remaining embeds as replies in the created thread
      const thread = channel.lastMessage?.thread || (await channel.threads.fetchActive()).threads.first();
      if (thread) {
        for (let i = 1; i < messages.length; i++) {
          await thread.send(messages[i]);
        }
      }
    } else {
      // normal text / announcement / thread channel
      for (const msg of messages) {
        await channel.send(msg);
      }
    }

    console.log("Messages sent. Exiting.");
  } catch (err) {
    console.error("Failed to send:", err);
  } finally {
    setTimeout(() => process.exit(0), 1500);
  }
});

client.login(DISCORD_TOKEN);
