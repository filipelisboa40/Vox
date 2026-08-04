export class InvalidSeekPositionError extends Error {
    public constructor() {
        super('Use seconds, MM:SS, or HH:MM:SS for the playback position');
        this.name = 'InvalidSeekPositionError';
    }
}

export function parseSeekPosition(value: string): number {
    const input = value.trim();

    if (/^\d+$/.test(input)) {
        const seconds = Number(input);

        if (!Number.isSafeInteger(seconds) || seconds > Number.MAX_SAFE_INTEGER / 1_000) {
            throw new InvalidSeekPositionError();
        }

        return seconds * 1_000;
    }

    const parts = input.split(':');

    if (parts.length !== 2 && parts.length !== 3) {
        throw new InvalidSeekPositionError();
    }

    if (parts.some((part) => !/^\d{1,2}$/.test(part))) {
        throw new InvalidSeekPositionError();
    }

    const numbers = parts.map(Number);
    const seconds = numbers.at(-1);
    const minutes = numbers.at(-2);
    const hours = parts.length === 3 ? numbers[0] : 0;

    if (
        seconds === undefined ||
        minutes === undefined ||
        hours === undefined ||
        seconds >= 60 ||
        minutes >= 60
    ) {
        throw new InvalidSeekPositionError();
    }

    return (hours * 3_600 + minutes * 60 + seconds) * 1_000;
}
