export class MediaLookupRateLimitError extends Error {
    public constructor() {
        super('Too many music requests. Please wait a moment and try again');
        this.name = 'MediaLookupRateLimitError';
    }
}

export class MediaLookupLimiter {
    readonly #requests = new Map<string, number[]>();

    public constructor(
        private readonly maximumRequests = 5,
        private readonly windowMs = 10_000,
        private readonly now: () => number = Date.now,
    ) {}

    public acquire(key: string): void {
        const cutoff = this.now() - this.windowMs;
        const recent = (this.#requests.get(key) ?? []).filter((time) => time > cutoff);

        if (recent.length >= this.maximumRequests) {
            this.#requests.set(key, recent);
            throw new MediaLookupRateLimitError();
        }

        recent.push(this.now());
        this.#requests.set(key, recent);
    }
}
