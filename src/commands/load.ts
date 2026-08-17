import { readdir } from "node:fs/promises";
import type { CommandFactory } from "./types.js";

interface CommandModuleExport {
  default?: unknown;
}

export async function loadCommandFactories(): Promise<CommandFactory[]> {
  const commandsDirectory = new URL("./", import.meta.url);
  const entries = await readdir(commandsDirectory, { withFileTypes: true });
  const commandDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    commandDirectories.map(async (directory) => {
      const moduleUrl = new URL(`./${directory}/index.js`, commandsDirectory);
      const commandModule = (await import(moduleUrl.href)) as CommandModuleExport;

      if (typeof commandModule.default !== "function") {
        throw new TypeError(`Command module ${directory}/index must default-export a command factory`);
      }

      return commandModule.default as CommandFactory;
    }),
  );
}
