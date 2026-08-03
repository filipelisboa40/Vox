import type { Environment } from '../config/environment.js';
import { ProviderManager } from './provider-manager.js';
import { YouTubeProvider } from './youtube/youtube-provider.js';

export function createProviderManager(environment: Environment): ProviderManager {
    const youtubeProvider = new YouTubeProvider({
        apiKey: environment.youtubeApiKey,
        lavalinkUrl: environment.lavalinkUrl,
        lavalinkPassword: environment.lavalinkPassword,
        ...(environment.youtubeRegion === undefined ? {} : { region: environment.youtubeRegion }),
    });

    return new ProviderManager([youtubeProvider], youtubeProvider);
}
