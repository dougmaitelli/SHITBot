import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it } from "node:test";
import { Client } from "discord.js";
import { startHealthServer } from "../src/discord-health.js";

describe("Discord health endpoint", () => {
  it("reports unhealthy before the Discord client is ready", async () => {
    const client = new Client({ intents: [] });
    const server = startHealthServer(client, 0);

    if (!server.listening) await once(server, "listening");

    const address = server.address();

    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { ready: boolean }).ready, false);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    client.destroy();
  });
});
