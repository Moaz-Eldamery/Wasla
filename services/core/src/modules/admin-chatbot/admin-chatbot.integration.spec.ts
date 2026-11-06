import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../shared/audit.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { SharedModule } from '../../shared/shared.module.js';
import { AdminChatbotModule } from './admin-chatbot.module.js';

const ADMIN_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const AI_RESPONSE = {
  status: 'ANSWERED',
  answer: 'The main reception desk is open daily from 8:00 AM to 8:00 PM.',
  language: 'en',
  sources: [
    {
      entryId: 'KB-001',
      title: { ar: 'مواعيد الاستقبال الرئيسي', en: 'Main Reception Hours' },
    },
  ],
};

describe('Admin chatbot mocked Core-to-AI integration', () => {
  let app: INestApplication;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(AI_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('AI_SERVICE_URL', 'http://mock-ai:8000');

    const module: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, AdminChatbotModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuditService)
      .useValue({ record: vi.fn().mockResolvedValue(undefined) })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('authorizes ADMIN, proxies to the AI contract, and returns grounded sources', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/chatbot/messages')
      .set('x-user-id', ADMIN_ID)
      .set('x-user-type', 'STAFF')
      .set('x-user-roles', 'ADMIN')
      .send({ question: 'What are the main reception hours?' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(AI_RESPONSE);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://mock-ai:8000/internal/admin/chatbot/answer',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          question: 'What are the main reception hours?',
        }),
      }),
    );
  });
});
