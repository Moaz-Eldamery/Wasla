import { Injectable } from '@nestjs/common';
import { ApiError } from '../../shared/api-error.js';
import type { ChatbotAnswer } from './admin-chatbot.types.js';

const AI_TIMEOUT_MS = 15_000;
const AI_PATH = '/internal/admin/chatbot/answer';

function isChatbotAnswer(value: unknown): value is ChatbotAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const answer = value as Partial<ChatbotAnswer>;
  if (
    !['ANSWERED', 'NO_INFORMATION'].includes(answer.status ?? '') ||
    typeof answer.answer !== 'string' ||
    !answer.answer.trim() ||
    !['ar', 'en'].includes(answer.language ?? '') ||
    !Array.isArray(answer.sources)
  ) {
    return false;
  }
  if (answer.status === 'ANSWERED' && answer.sources.length === 0) return false;
  if (answer.status === 'NO_INFORMATION' && answer.sources.length !== 0)
    return false;
  return answer.sources.every(
    (source) =>
      typeof source?.entryId === 'string' &&
      typeof source?.title?.ar === 'string' &&
      typeof source?.title?.en === 'string',
  );
}

@Injectable()
export class AdminChatbotService {
  async ask(question: string): Promise<ChatbotAnswer> {
    const baseUrl = (process.env.AI_SERVICE_URL ?? 'http://ai:8000').replace(
      /\/+$/,
      '',
    );
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${AI_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (!response.ok)
        throw new Error('AI service returned a non-success status');
      const payload: unknown = await response.json();
      if (!isChatbotAnswer(payload))
        throw new Error('AI service returned an invalid answer');
      return payload;
    } catch {
      // Never log the question, request payload, provider response, or headers.
      throw new ApiError(
        503,
        'AI_UNAVAILABLE',
        'The AI service is temporarily unavailable.',
      );
    }
  }
}
