export class MediaProviderError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'MediaProviderError';
    }
}

export class InvalidMediaQueryError extends MediaProviderError {
    public constructor() {
        super('A song name or URL is required');
        this.name = 'InvalidMediaQueryError';
    }
}

export class UnsupportedMediaUrlError extends MediaProviderError {
    public constructor() {
        super('No configured media provider supports this URL');
        this.name = 'UnsupportedMediaUrlError';
    }
}

export class NoMediaResultsError extends MediaProviderError {
    public constructor(query?: string) {
        super('No media results were found');
        void query;
        this.name = 'NoMediaResultsError';
    }
}

export class MediaUnavailableError extends MediaProviderError {
    public constructor(message = 'The requested media is unavailable') {
        super(message);
        this.name = 'MediaUnavailableError';
    }
}

export class MediaStreamError extends MediaProviderError {
    public constructor(
        message = 'The provider could not create a playable stream',
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = 'MediaStreamError';
    }
}

export class ProviderOperationError extends MediaProviderError {
    public constructor(providerName: string, options?: ErrorOptions) {
        super(`The ${providerName} provider failed to complete the request`, options);
        this.name = 'ProviderOperationError';
    }
}

export class ProviderTimeoutError extends MediaProviderError {
    public constructor() {
        super('The media provider took too long to respond');
        this.name = 'ProviderTimeoutError';
    }
}
