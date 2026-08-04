import { describe, expect, it } from 'vitest';

import {
    errorResponse,
    informationResponse,
    ResponseKind,
    successResponse,
} from './command-response.js';

describe('command responses', () => {
    it.each([
        [successResponse, ResponseKind.Success, 'Success'],
        [informationResponse, ResponseKind.Information, 'Information'],
        [errorResponse, ResponseKind.Error, 'Unable to complete command'],
    ])('creates a consistently presented embed', (createResponse, color, title) => {
        const response = createResponse('Example response');
        const embed = response.embeds?.[0];
        const json = embed !== undefined && 'toJSON' in embed ? embed.toJSON() : embed;

        expect(json).toMatchObject({ color, title, description: 'Example response' });
    });
});
