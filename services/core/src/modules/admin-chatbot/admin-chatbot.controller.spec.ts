import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../shared/audit.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { SharedModule } from '../../shared/shared.module.js';
import { AdminChatbotModule } from './admin-chatbot.module.js';
import { AdminChatbotService } from './admin-chatbot.service.js';

const ADMIN_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const RESPONSE = {
  status: 'ANSWERED',
  answer: 'Open daily.',
  language: 'en',
  sources: [
    {
      entryId: 'KB-001',
      title: { ar: 'ساعات الاستقبال', en: 'Reception hours' },
    },
  ],
};

describe('AdminChatbotController authorization and validation', () => {
  let app: INestApplication;
  let chatbot: { ask: ReturnType<typeof vi.fn> };
  let audit: { record: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    chatbot = { ask: vi.fn().mockResolvedValue(RESPONSE) };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, AdminChatbotModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuditService)
      .useValue(audit)
      .overrideProvider(AdminChatbotService)
      .useValue(chatbot)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires an authenticated caller', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/chatbot/messages')
      .send({ question: 'Where is reception?' });

    expect(response.status).toBe(401);
    expect(chatbot.ask).not.toHaveBeenCalled();
  });

  it('requires the ADMIN role', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/chatbot/messages')
      .set('x-user-id', ADMIN_ID)
      .set('x-user-type', 'STAFF')
      .set('x-user-roles', 'RECEPTIONIST')
      .send({ question: 'Where is reception?' });

    expect(response.status).toBe(403);
    expect(chatbot.ask).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('allows an ADMIN and forwards a validated question', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/chatbot/messages')
      .set('x-user-id', ADMIN_ID)
      .set('x-user-type', 'STAFF')
      .set('x-user-roles', 'ADMIN')
      .send({ question: '  Where is reception?  ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(RESPONSE);
    expect(chatbot.ask).toHaveBeenCalledWith('Where is reception?');
  });

  it('validates question size and rejects extra fields', async () => {
    const headers = {
      'x-user-id': ADMIN_ID,
      'x-user-type': 'STAFF',
      'x-user-roles': 'ADMIN',
    };
    const empty = await request(app.getHttpServer())
      .post('/admin/chatbot/messages')
      .set(headers)
      .send({ question: '  ' });
    const tooLong = await request(app.getHttpServer())
      .post('/admin/chatbot/messages')
      .set(headers)
      .send({ question: 'x'.repeat(1001) });
    const extra = await request(app.getHttpServer())
      .post('/admin/chatbot/messages')
      .set(headers)
      .send({ question: 'Hours?', patientId: 'not-accepted' });

    expect(empty.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(chatbot.ask).not.toHaveBeenCalled();
  });
});
