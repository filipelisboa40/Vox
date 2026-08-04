import type { Environment } from '../config/environment.js';
import { ProviderManager } from './provider-manager.js';
import { ProcessYtDlpRunner, YouTubeProvider } from './youtube/youtube-provider.js';

export function createProviderManager(environment: Environment): ProviderManager {
    const youtubeProvider = new YouTubeProvider({
        runner: new ProcessYtDlpRunner(environment.ytDlpPath),
    });

    return new ProviderManager([youtubeProvider], youtubeProvider);
}
