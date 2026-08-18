import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderEvent } from "../../../../src/commands/event/renderers/event.js";
import type { CommunityEvent } from "../../../../src/commands/event/types.js";

function communityEvent(): CommunityEvent {
  return {
    id: "event",
    guildId: "guild",
    channelId: "channel",
    messageId: "message",
    scheduledEventId: "scheduled",
    creatorId: "creator",
    name: "Board games",
    startsAt: Math.floor(Date.now() / 1000) + 3600,
    description: "Bring your favorites",
    link: "https://example.com/details",
    attendanceLimit: 5,
    rsvps: { alice: "yes", bob: "maybe", charlie: "no" },
    createdAt: Date.now(),
  };
}

describe("renderEvent", () => {
  it("renders event details, RSVP groups, and Discord event links", () => {
    const rendered = renderEvent(communityEvent());
    const embed = rendered.embeds[0].toJSON();

    assert.equal(embed.title, "📅 Board games");
    assert.match(embed.description ?? "", /Bring your favorites/);
    assert.equal(embed.fields?.find((field) => field.name === "Going (1 / 5)")?.value, "<@alice>");
    assert.match(embed.fields?.find((field) => field.name === "Link")?.value ?? "", /https:\/\/example\.com\/details/);
    assert.match(
      embed.fields?.find((field) => field.name === "Discord event")?.value ?? "",
      /discord\.com\/events\/guild\/scheduled/,
    );
    assert.equal(rendered.components[0]?.components.length, 3);
  });

  it("disables RSVP controls after the event closes", () => {
    const event = communityEvent();

    event.closedAt = Date.now();
    const rendered = renderEvent(event);

    assert.ok(rendered.components[0]?.components.every((button) => button.toJSON().disabled));
    assert.equal(rendered.embeds[0].toJSON().footer?.text, "This event is closed");
  });

  it("renders all-day events as dates without time or relative-time output", () => {
    const event = communityEvent();

    event.startsAt = 1_787_292_000;
    event.endsAt = 1_787_378_400;
    event.fullDay = true;
    const when = renderEvent(event)
      .embeds[0].toJSON()
      .fields?.find((field) => field.name === "When")?.value;

    assert.equal(when, "<t:1787292000:D> – <t:1787378399:D> (all day)");
    assert.doesNotMatch(when ?? "", /:[FRTtfd]>/);
  });
});
