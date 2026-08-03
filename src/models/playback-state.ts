import type { Track } from './track.js';

export const PlaybackStatus = {
    Idle: 'idle',
    Buffering: 'buffering',
    Playing: 'playing',
    Paused: 'paused',
} as const;

export type PlaybackStatus = (typeof PlaybackStatus)[keyof typeof PlaybackStatus];

export const LoopMode = {
    Off: 'off',
    Track: 'track',
    Queue: 'queue',
} as const;

export type LoopMode = (typeof LoopMode)[keyof typeof LoopMode];

export interface PlaybackState {
    readonly status: PlaybackStatus;
    readonly loopMode: LoopMode;
    readonly currentTrack: Track | null;
}
