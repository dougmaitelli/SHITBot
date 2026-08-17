import { createServer, type Server } from "node:http";
import { logger } from "./logger.js";
import type { Client } from "discord.js";

export function startDiscordHealthMonitor(client: Client, unreadyExitMs: number, heartbeatMs: number): NodeJS.Timeout {
  let unreadySince: number | undefined;
  let lastHeartbeatAt = 0;
  const run = () => {
    const ready = client.isReady();
    const now = Date.now();

    if (ready) unreadySince = undefined;
    else unreadySince ??= now;

    const unreadyMs = unreadySince === undefined ? 0 : now - unreadySince;

    if (now - lastHeartbeatAt >= heartbeatMs) {
      lastHeartbeatAt = now;
      logger.info("Discord health", {
        ready,
        websocketStatus: client.ws.status,
        pingMs: client.ws.ping,
        guildCount: client.guilds.cache.size,
        unreadyMs,
      });
    }

    if (!ready && unreadyMs >= unreadyExitMs) {
      logger.fatal("Discord remained unready; exiting for container restart", {
        unreadyMs,
        unreadyExitMs,
      });
      process.exit(1);
    }
  };

  run();

  return setInterval(run, Math.min(30_000, heartbeatMs, unreadyExitMs));
}

export function startHealthServer(client: Client, port: number): Server {
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end("not found\n");

      return;
    }

    const ready = client.isReady();

    response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
    response.end(`${JSON.stringify({ ready, websocketStatus: client.ws.status, pingMs: client.ws.ping })}\n`);
  });

  server.on("error", (error) => {
    logger.fatal("Health server failed", { error, port });
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => logger.info("Health server listening", { port }));

  return server;
}
