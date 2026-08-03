const discordFormattingCharacters = /([\\*_~`|>])/g;

export function normalizeExternalText(value: string, maximumLength: number): string {
    const withoutControlCharacters = [...value]
        .filter((character) => {
            const codePoint = character.codePointAt(0);
            return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
        })
        .join('');

    return withoutControlCharacters.replace(/\s+/g, ' ').trim().slice(0, maximumLength);
}

export function escapeDiscordFormatting(value: string): string {
    return value.replace(discordFormattingCharacters, '\\$1');
}
