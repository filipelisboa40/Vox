import { describe, expect, it } from 'vitest';

import { MediaLookupLimiter, MediaLookupRateLimitError } from './media-lookup-limiter.js';

describe('MediaLookupLimiter', () => {
    it('limits repeated lookups for one caller', () => {
        const limiter = new MediaLookupLimiter(2, 1_000, () => 100);

        limiter.acquire('user');
        limiter.acquire('user');

        expect(() => limiter.acquire('user')).toThrow(MediaLookupRateLimitError);
        expect(() => limiter.acquire('another-user')).not.toThrow();
    });

    it('allows requests after the window expires', () => {
        let now = 100;
        const limiter = new MediaLookupLimiter(1, 1_000, () => now);
        limiter.acquire('user');
        now = 1_101;

        expect(() => limiter.acquire('user')).not.toThrow();
    });
});
