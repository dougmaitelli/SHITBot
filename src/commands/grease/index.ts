import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { CommandFactory, CommandModule } from "../types.js";

const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const GREASE_SUCCESS_CHANCE = 0.05;

export function greaseSucceeds(random: () => number = Math.random): boolean {
  return random() < GREASE_SUCCESS_CHANCE;
}

const createGreaseCommand: CommandFactory = ({ store }): CommandModule => {
  return {
    data: new SlashCommandBuilder()
      .setName("grease")
      .setDescription("Send grease to every other text channel")
      .toJSON(),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      if (!interaction.inCachedGuild()) {
        await interaction.reply({
          content: "The grease command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const now = Date.now();
      const lastUsedAt = store.getGreaseLastUsedAt();
      if (lastUsedAt && now - lastUsedAt < COOLDOWN_MS) {
        const availableAt = Math.floor((lastUsedAt + COOLDOWN_MS) / 1000);
        await interaction.reply({
          content: `Grease is on cooldown. It will be available <t:${availableAt}:R>.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Every attempt claims the cooldown before yielding so concurrent uses cannot both pass the check.
      const cooldownSave = store.setGreaseLastUsedAt(now);
      const succeeded = greaseSucceeds();

      if (!succeeded) {
        await cooldownSave;
        await interaction.reply({ content: `<@${interaction.user.id}> tried to cast grease and failed.` });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await cooldownSave;

      const sends: Promise<unknown>[] = [];
      for (const channel of interaction.guild.channels.cache.values()) {
        if (channel.id !== interaction.channelId && channel.isTextBased() && channel.isSendable()) {
          sends.push(channel.send("🛢️ Grease!"));
        }
      }

      const results = await Promise.allSettled(sends);
      const sent = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - sent;
      await interaction.editReply(
        failed > 0
          ? `Greased ${sent} channel(s). I couldn't send to ${failed} channel(s), likely because of channel permissions.`
          : `Greased ${sent} channel(s).`,
      );
    },
  };
};

export default createGreaseCommand;
