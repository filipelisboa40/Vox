import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

import type { Command } from './command.js';

export class CommandRegistry {
    readonly #commands = new Map<string, Command>();

    public constructor(commands: readonly Command[]) {
        for (const command of commands) {
            const commandName = command.data.name;

            if (this.#commands.has(commandName)) {
                throw new Error(`Duplicate command registration: ${commandName}`);
            }

            this.#commands.set(commandName, command);
        }
    }

    public get(commandName: string): Command | undefined {
        return this.#commands.get(commandName);
    }

    public toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
        return [...this.#commands.values()].map((command) => command.data.toJSON());
    }
}
