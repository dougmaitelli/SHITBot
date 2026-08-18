import { renderNight } from "./renderers/night.js";
import { renderSuggestion } from "./renderers/suggestion.js";
import type { MovieNight, MovieSuggestion } from "./types.js";
import type { Client } from "discord.js";

export interface MovieNightMessageService {
  updateNight(night: MovieNight): Promise<void>;
  sendSuggestion(night: MovieNight, suggestion: MovieSuggestion): Promise<string>;
  updateSuggestion(night: MovieNight, suggestion: MovieSuggestion): Promise<void>;
  updateSuggestions(night: MovieNight): Promise<void>;
  updateAll(night: MovieNight): Promise<void>;
  deleteSuggestion(night: MovieNight, suggestion: MovieSuggestion): Promise<void>;
  deleteSuggestions(night: MovieNight): Promise<void>;
}

export function createMovieNightMessageService(client: Client): MovieNightMessageService {
  async function getChannel(night: MovieNight) {
    const channel = await client.channels.fetch(night.channelId);

    return channel?.isTextBased() && !channel.isDMBased() ? channel : undefined;
  }

  async function updateNight(night: MovieNight): Promise<void> {
    const channel = await getChannel(night);

    if (!channel) return;

    const message = await channel.messages.fetch(night.messageId);

    await message.edit(renderNight(night));
  }

  async function sendSuggestion(night: MovieNight, suggestion: MovieSuggestion): Promise<string> {
    const channel = await getChannel(night);

    if (!channel) throw new Error(`Could not find text channel ${night.channelId}`);

    return (await channel.send(renderSuggestion(night, suggestion))).id;
  }

  async function updateSuggestion(night: MovieNight, suggestion: MovieSuggestion): Promise<void> {
    if (!suggestion.messageId) return;

    const channel = await getChannel(night);

    if (!channel) return;

    const message = await channel.messages.fetch(suggestion.messageId);

    await message.edit(renderSuggestion(night, suggestion));
  }

  async function deleteSuggestion(night: MovieNight, suggestion: MovieSuggestion): Promise<void> {
    if (!suggestion.messageId) return;

    const channel = await getChannel(night);

    if (!channel) return;

    await (await channel.messages.fetch(suggestion.messageId)).delete();
  }

  async function updateSuggestions(night: MovieNight): Promise<void> {
    await Promise.allSettled(night.suggestions.map((suggestion) => updateSuggestion(night, suggestion)));
  }

  async function updateAll(night: MovieNight): Promise<void> {
    await updateNight(night);
    await updateSuggestions(night);
  }

  async function deleteSuggestions(night: MovieNight): Promise<void> {
    await Promise.allSettled(night.suggestions.map((suggestion) => deleteSuggestion(night, suggestion)));
  }

  return {
    updateNight,
    sendSuggestion,
    updateSuggestion,
    updateSuggestions,
    updateAll,
    deleteSuggestion,
    deleteSuggestions,
  };
}
