import type { Track } from './track.js';

export interface SkipHistoryRecord {
    readonly track: Track;
    readonly positionMs: number;
}

export class SkipHistory {
    readonly #records: SkipHistoryRecord[] = [];

    public constructor(private readonly maxEntries = 10) {
        if (!Number.isInteger(maxEntries) || maxEntries < 1) {
            throw new RangeError('Skip history capacity must be a positive integer');
        }
    }

    public get size(): number {
        return this.#records.length;
    }

    public push(record: SkipHistoryRecord): void {
        if (!Number.isFinite(record.positionMs) || record.positionMs < 0) {
            throw new RangeError('Skip position must be a non-negative finite number');
        }

        this.#records.push(record);

        if (this.#records.length > this.maxEntries) {
            this.#records.shift();
        }
    }

    public peek(): SkipHistoryRecord | undefined {
        return this.#records.at(-1);
    }

    public pop(): SkipHistoryRecord | undefined {
        return this.#records.pop();
    }

    public clear(): SkipHistoryRecord[] {
        return this.#records.splice(0);
    }

    public snapshot(): readonly SkipHistoryRecord[] {
        return [...this.#records];
    }
}
