import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api-error.js';
import { AdminChatbotService } from './admin-chatbot.service.js';

const answer = {
  status: 'ANSWERED',
  answer: 'Open daily.',
  language: 'en',
  sources: [
    {
      entryId: 'KB-001',
      title: { en: 'Reception hours', ar: 'ساعات الاستقبال' },
    },
  ],
};

describe('AdminChatbotService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('forwards a question to the internal AI endpoint and returns the contract response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(answer), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('AI_SERVICE_URL', 'http://ai:8000');

    const result = await new AdminChatbotService().ask('Where is reception?');

    expect(result).toEqual(answer);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai:8000/internal/admin/chatbot/answer',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ question: 'Where is reception?' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('maps an AI outage to the public AI_UNAVAILABLE contract error without question text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('sensitive question contents')),
    );

    const error = await new AdminChatbotService()
      .ask('private content')
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).getStatus()).toBe(503);
    expect((error as ApiError).code).toBe('AI_UNAVAILABLE');
    expect(JSON.stringify((error as ApiError).getResponse())).not.toContain(
      'private content',
    );
  });

  it('rejects an invalid response from the AI service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'ANSWERED',
            answer: 'Guess',
            language: 'en',
            sources: [],
          }),
          {
            status: 200,
          },
        ),
      ),
    );

    const error = await new AdminChatbotService()
      .ask('Question')
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('AI_UNAVAILABLE');
  });
});
