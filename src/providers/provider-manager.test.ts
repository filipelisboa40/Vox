import { describe, expect, it } from 'vitest';

import type { AudioProvider, ProviderTrack } from './audio-provider.js';
import {
    InvalidMediaQueryError,
    MediaUnavailableError,
    NoMediaResultsError,
    ProviderOperationError,
    ProviderTimeoutError,
    UnsupportedMediaUrlError,
} from './provider-errors.js';
import { ProviderManager } from './provider-manager.js';
import { FakeAudioProvider } from './testing/fake-audio-provider.js';

function createProviderTrack(provider: string, id: string, title = `Track ${id}`): ProviderTrack {
    return {
        provider,
        providerTrackId: id,
        title,
        url: `https://${provider}.example.com/${id}`,
        durationMs: 180_000,
    };
}

describe('ProviderManager', () => {
    it('selects the provider that recognizes a URL', async () => {
        const firstTrack = createProviderTrack('first', 'one');
        const secondTrack = createProviderTrack('second', 'two');
        const manager = new ProviderManager([
            new FakeAudioProvider('first', [firstTrack]),
            new FakeAudioProvider('second', [secondTrack]),
        ]);

        await expect(manager.resolve(secondTrack.url)).resolves.toBe(secondTrack);
    });

    it('uses the configured search provider for text queries', async () => {
        const firstTrack = createProviderTrack('first', 'one', 'Unrelated');
        const secondTrack = createProviderTrack('second', 'two', 'Wanted song');
        const first = new FakeAudioProvider('first', [firstTrack]);
        const second = new FakeAudioProvider('second', [secondTrack]);
        const manager = new ProviderManager([first, second], second);

        await expect(manager.resolve('wanted')).resolves.toBe(secondTrack);
    });

    it('rejects empty input and unsupported URLs', async () => {
        const manager = new ProviderManager([new FakeAudioProvider()]);

        await expect(manager.resolve('   ')).rejects.toBeInstanceOf(InvalidMediaQueryError);
        await expect(
            manager.resolve('https://unsupported.example.com/song'),
        ).rejects.toBeInstanceOf(UnsupportedMediaUrlError);
    });

    it('preserves typed provider failures', async () => {
        const manager = new ProviderManager([new FakeAudioProvider()]);

        await expect(manager.resolve('missing song')).rejects.toBeInstanceOf(NoMediaResultsError);
        await expect(manager.resolve('https://fake.example.com/missing')).rejects.toBeInstanceOf(
            MediaUnavailableError,
        );
    });

    it('translates unexpected provider failures', async () => {
        const brokenProvider: AudioProvider = {
            name: 'broken',
            canHandleUrl: () => false,
            search: () => Promise.reject(new Error('implementation detail')),
            resolveUrl: () => Promise.reject(new Error('implementation detail')),
            createPlayableSource: () => Promise.reject(new Error('implementation detail')),
        };
        const manager = new ProviderManager([brokenProvider]);

        await expect(manager.resolve('song')).rejects.toBeInstanceOf(ProviderOperationError);
    });

    it('times out a provider that never resolves', async () => {
        const slowProvider: AudioProvider = {
            name: 'slow',
            canHandleUrl: () => false,
            search: () => new Promise<ProviderTrack>(() => undefined),
            resolveUrl: () => new Promise<ProviderTrack>(() => undefined),
            createPlayableSource: () => new Promise(() => undefined),
        };
        const manager = new ProviderManager([slowProvider], slowProvider, 1);

        await expect(manager.resolve('song')).rejects.toBeInstanceOf(ProviderTimeoutError);
    });

    it('creates a source through the provider recorded on the track', async () => {
        const track = createProviderTrack('fake', 'playable');
        const manager = new ProviderManager([new FakeAudioProvider('fake', [track])]);

        const source = await manager.createPlayableSource(track);

        expect(source.stream.destroyed).toBe(false);
        source.stream.destroy();
        expect(source.stream.destroyed).toBe(true);
    });

    it('rejects duplicate provider names and an unregistered search provider', () => {
        const first = new FakeAudioProvider('duplicate');
        const second = new FakeAudioProvider('duplicate');

        expect(() => new ProviderManager([first, second])).toThrow(
            'Duplicate media provider registration: duplicate',
        );
        expect(() => new ProviderManager([first], new FakeAudioProvider('other'))).toThrow(
            'The search provider must be included in the provider list',
        );
    });
});
