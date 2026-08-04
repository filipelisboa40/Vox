import type { Track } from './track.js';

export type RemovePositionResult =
    | { readonly status: 'empty' }
    | { readonly status: 'out-of-range' }
    | { readonly status: 'removed'; readonly track: Track };

export type MovePositionResult =
    | { readonly status: 'empty' }
    | { readonly status: 'out-of-range' }
    | { readonly status: 'unchanged'; readonly track: Track }
    | { readonly status: 'moved'; readonly track: Track };

export class QueueManager {
    readonly #waitingTracks: Track[] = [];

    public constructor(private readonly random: () => number = Math.random) {}

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

    public removePosition(position: number): RemovePositionResult {
        if (this.isEmpty) {
            return { status: 'empty' };
        }

        const index = position - 1;

        if (!this.#isValidIndex(index)) {
            return { status: 'out-of-range' };
        }

        const track = this.remove(index);
        return track === undefined ? { status: 'out-of-range' } : { status: 'removed', track };
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

    public movePosition(fromPosition: number, toPosition: number): MovePositionResult {
        if (this.isEmpty) {
            return { status: 'empty' };
        }

        const fromIndex = fromPosition - 1;
        const toIndex = toPosition - 1;

        if (!this.#isValidIndex(fromIndex) || !this.#isValidIndex(toIndex)) {
            return { status: 'out-of-range' };
        }

        const track = this.#waitingTracks[fromIndex];

        if (track === undefined) {
            return { status: 'out-of-range' };
        }

        if (fromIndex === toIndex) {
            return { status: 'unchanged', track };
        }

        return this.move(fromIndex, toIndex)
            ? { status: 'moved', track }
            : { status: 'out-of-range' };
    }

    public snapshot(): readonly Track[] {
        return [...this.#waitingTracks];
    }

    public shuffle(): boolean {
        if (this.#waitingTracks.length < 2) {
            return false;
        }

        // Fisher-Yates visits each suffix exactly once, keeping all track references intact.
        for (let index = this.#waitingTracks.length - 1; index > 0; index -= 1) {
            const randomValue = this.random();

            if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
                throw new RangeError('Queue random source must return a number from 0 up to 1');
            }

            const swapIndex = Math.floor(randomValue * (index + 1));
            const current = this.#waitingTracks[index];
            const replacement = this.#waitingTracks[swapIndex];

            if (current === undefined || replacement === undefined) {
                throw new Error('Queue shuffle selected an invalid track index');
            }

            this.#waitingTracks[index] = replacement;
            this.#waitingTracks[swapIndex] = current;
        }

        return true;
    }

    #isValidIndex(index: number): boolean {
        // Queue internals are zero-based. Slash commands translate their one-based positions.
        return Number.isInteger(index) && index >= 0 && index < this.#waitingTracks.length;
    }
}
