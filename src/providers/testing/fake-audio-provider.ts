import { Readable } from 'node:stream';

import {
    AudioSourceFormat,
    type AudioProvider,
    type PlayableSource,
    type ProviderTrack,
} from '../audio-provider.js';
import { MediaUnavailableError, NoMediaResultsError } from '../provider-errors.js';

export class FakeAudioProvider implements AudioProvider {
    public readonly name: string;
    readonly #tracks: ProviderTrack[];

    public constructor(name = 'fake', tracks: readonly ProviderTrack[] = []) {
        this.name = name;
        this.#tracks = [...tracks];
    }

    public canHandleUrl(url: URL): boolean {
        return url.hostname === `${this.name}.example.com`;
    }

    public search(query: string): Promise<ProviderTrack> {
        const normalizedQuery = query.toLocaleLowerCase();
        const track = this.#tracks.find((candidate) =>
            candidate.title.toLocaleLowerCase().includes(normalizedQuery),
        );

        if (track === undefined) {
            return Promise.reject(new NoMediaResultsError(query));
        }

        return Promise.resolve(track);
    }

    public resolveUrl(url: URL): Promise<ProviderTrack> {
        const track = this.#tracks.find((candidate) => candidate.url === url.toString());

        if (track === undefined) {
            return Promise.reject(new MediaUnavailableError());
        }

        return Promise.resolve(track);
    }

    public createPlayableSource(track: ProviderTrack): Promise<PlayableSource> {
        if (!this.#tracks.includes(track)) {
            return Promise.reject(new MediaUnavailableError());
        }

        return Promise.resolve({
            stream: Readable.from([Buffer.from(track.providerTrackId)]),
            format: AudioSourceFormat.Unknown,
        });
    }
}
