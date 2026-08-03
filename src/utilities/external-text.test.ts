import { describe, expect, it } from 'vitest';

import { escapeDiscordFormatting, normalizeExternalText } from './external-text.js';

describe('external text utilities', () => {
    it('removes control characters, normalizes whitespace, and truncates text', () => {
        expect(normalizeExternalText('  Song\u0000\n   title  ', 8)).toBe('Song tit');
    });

    it('escapes Discord formatting characters before display', () => {
        expect(escapeDiscordFormatting('*song* `title`')).toBe('\\*song\\* \\`title\\`');
    });
});
