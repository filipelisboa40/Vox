import { SlashCommandBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { Command } from './command.js';
import { CommandRegistry } from './command-registry.js';

function createCommand(name: string): Command {
    return {
        data: new SlashCommandBuilder().setName(name).setDescription(`${name} command`),
        execute: vi.fn().mockResolvedValue(undefined),
    };
}

describe('CommandRegistry', () => {
    it('returns explicitly registered commands', () => {
        const command = createCommand('play');
        const registry = new CommandRegistry([command]);

        expect(registry.get('play')).toBe(command);
        expect(registry.get('missing')).toBeUndefined();
    });

    it('rejects duplicate command names', () => {
        expect(() => new CommandRegistry([createCommand('play'), createCommand('play')])).toThrow(
            'Duplicate command registration: play',
        );
    });

    it('serializes command definitions for Discord deployment', () => {
        const registry = new CommandRegistry([createCommand('queue')]);

        expect(registry.toJSON()).toEqual([
            expect.objectContaining({ name: 'queue', description: 'queue command' }),
        ]);
    });
});
