import type {
    AudioProvider,
    PlayableSource,
    PlayableSourceOptions,
    ProviderTrack,
} from './audio-provider.js';
import {
    InvalidMediaQueryError,
    MediaProviderError,
    ProviderOperationError,
    UnsupportedMediaUrlError,
} from './provider-errors.js';

export class ProviderManager {
    readonly #providersByName = new Map<string, AudioProvider>();

    public constructor(
        providers: readonly AudioProvider[],
        private readonly searchProvider: AudioProvider | undefined = providers[0],
    ) {
        for (const provider of providers) {
            if (this.#providersByName.has(provider.name)) {
                throw new Error(`Duplicate media provider registration: ${provider.name}`);
            }

            this.#providersByName.set(provider.name, provider);
        }

        if (
            searchProvider !== undefined &&
            this.#providersByName.get(searchProvider.name) !== searchProvider
        ) {
            throw new Error('The search provider must be included in the provider list');
        }
    }

    public async resolve(queryOrUrl: string): Promise<ProviderTrack> {
        const input = queryOrUrl.trim();

        if (input.length === 0) {
            throw new InvalidMediaQueryError();
        }

        const url = parseUrl(input);

        if (url !== undefined) {
            const provider = [...this.#providersByName.values()].find((candidate) =>
                candidate.canHandleUrl(url),
            );

            if (provider === undefined) {
                throw new UnsupportedMediaUrlError();
            }

            return this.#runProviderOperation(provider, () => provider.resolveUrl(url));
        }

        if (this.searchProvider === undefined) {
            throw new UnsupportedMediaUrlError();
        }

        return this.#runProviderOperation(this.searchProvider, () =>
            this.searchProvider!.search(input),
        );
    }

    public async createPlayableSource(
        track: ProviderTrack,
        options?: PlayableSourceOptions,
    ): Promise<PlayableSource> {
        const provider = this.#providersByName.get(track.provider);

        if (provider === undefined) {
            throw new UnsupportedMediaUrlError();
        }

        // The caller owns the returned stream and must destroy it on completion or replacement.
        return this.#runProviderOperation(provider, () =>
            provider.createPlayableSource(track, options),
        );
    }

    public canSeek(track: ProviderTrack): boolean {
        return this.#providersByName.get(track.provider)?.supportsSeeking === true;
    }

    async #runProviderOperation<T>(
        provider: AudioProvider,
        operation: () => Promise<T>,
    ): Promise<T> {
        try {
            return await operation();
        } catch (error: unknown) {
            if (error instanceof MediaProviderError) {
                throw error;
            }

            throw new ProviderOperationError(provider.name, { cause: error });
        }
    }
}

function parseUrl(value: string): URL | undefined {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
    } catch {
        return undefined;
    }
}
