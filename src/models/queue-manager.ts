import type { Track } from './track.js';

export class QueueManager {
    readonly #waitingTracks: Track[] = [];

    public get size(): number {
        return this.#waitingTracks.length;
    }

    public get isEmpty(): boolean {
        return this.#waitingTracks.length === 0;
    }

    public add(track: Track): number {
        this.#waitingTracks.push(track);
        return this.#waitingTracks.length - 1;
    }

    public addFirst(track: Track): void {
        this.#waitingTracks.unshift(track);
    }

    public peek(): Track | undefined {
        return this.#waitingTracks[0];
    }

    public takeNext(): Track | undefined {
        return this.#waitingTracks.shift();
    }

    public clearWaiting(): Track[] {
        return this.#waitingTracks.splice(0);
    }

    public remove(index: number): Track | undefined {
        if (!this.#isValidIndex(index)) {
            return undefined;
        }

        return this.#waitingTracks.splice(index, 1)[0];
    }

    public move(fromIndex: number, toIndex: number): boolean {
        if (!this.#isValidIndex(fromIndex) || !this.#isValidIndex(toIndex)) {
            return false;
        }

        if (fromIndex === toIndex) {
            return true;
        }

        const track = this.#waitingTracks.splice(fromIndex, 1)[0];

        // Both indexes were validated before mutation, so removal must produce one track.
        if (track === undefined) {
            return false;
        }

        this.#waitingTracks.splice(toIndex, 0, track);
        return true;
    }

    public snapshot(): readonly Track[] {
        return [...this.#waitingTracks];
    }

    #isValidIndex(index: number): boolean {
        // Queue internals are zero-based. Slash commands translate their one-based positions.
        return Number.isInteger(index) && index >= 0 && index < this.#waitingTracks.length;
    }
}
