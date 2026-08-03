import type { ChatInputCommandInteraction } from 'discord.js';

import type { PlaybackController } from '../../player/playback-controller.js';
import type { PlayerManager } from '../../player/player-manager.js';
import { resolveVoiceJoinTarget, type VoiceJoinTarget } from '../../player/voice-access.js';

export type VoiceTargetResolver = (
    interaction: ChatInputCommandInteraction,
) => Promise<VoiceJoinTarget>;

export interface PlaybackResolverDependencies {
    readonly players: Pick<PlayerManager, 'get'>;
    readonly resolveVoiceTarget?: VoiceTargetResolver;
}

export class PlaybackControlError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'PlaybackControlError';
    }
}

export async function resolvePlayback(
    interaction: ChatInputCommandInteraction,
    dependencies: PlaybackResolverDependencies,
): Promise<PlaybackController> {
    const voiceTarget = await (dependencies.resolveVoiceTarget ?? resolveVoiceJoinTarget)(
        interaction,
    );
    const guildPlayer = dependencies.players.get(voiceTarget.guildId);

    if (guildPlayer === undefined || guildPlayer.playback === undefined) {
        throw new PlaybackControlError('Nothing is currently playing in this server');
    }

    if (guildPlayer.voiceChannelId !== voiceTarget.voiceChannelId) {
        throw new PlaybackControlError("Join the bot's voice channel to control playback");
    }

    return guildPlayer.playback;
}
