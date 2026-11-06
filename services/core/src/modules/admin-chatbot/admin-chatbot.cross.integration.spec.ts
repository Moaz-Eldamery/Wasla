import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../shared/audit.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { SharedModule } from '../../shared/shared.module.js';
import { AdminChatbotModule } from './admin-chatbot.module.js';

const ADMIN_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const ENGLISH_QUESTION =
  'By what time is the central front desk staffed each day?';
const ARABIC_QUESTION = 'إلى أي ساعة يبقى مكتب الاستقبال الرئيسي مفتوحًا؟';
const ENGLISH_ANSWER =
  'The main reception desk is open daily from 8:00 AM to 8:00 PM.';
const ARABIC_ANSWER =
  'مكتب الاستقبال الرئيسي مفتوح يوميًا من الساعة 8:00 صباحًا حتى 8:00 مساءً.';

function listenOnEphemeralPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      if (!address || typeof address === 'string') {
        listener.close();
        reject(new Error('Could not allocate a local integration-test port'));
        return;
      }
      listener.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

const wait = (ms: number) =>
  new Promise((resolveWait) => setTimeout(resolveWait, ms));

describe('Core-to-AI chatbot HTTP integration with test-only providers', () => {
  let coreApp: INestApplication;
  let aiProcess: ChildProcess;
  let aiBaseUrl: string;
  let originalAiServiceUrl: string | undefined;

  beforeAll(async () => {
    const repositoryRoot = resolve(process.cwd(), '../..');
    const aiDirectory = join(repositoryRoot, 'services', 'ai');
    const pythonExecutable =
      process.env.WASLA_AI_TEST_PYTHON ??
      join(
        aiDirectory,
        '.venv',
        process.platform === 'win32' ? 'Scripts' : 'bin',
        process.platform === 'win32' ? 'python.exe' : 'python',
      );

    if (!existsSync(pythonExecutable)) {
      throw new Error(
        'AI test Python was not found. Run `uv sync --locked` in services/ai before this integration test.',
      );
    }

    const port = await listenOnEphemeralPort();
    aiBaseUrl = `http://127.0.0.1:${port}`;
    aiProcess = spawn(
      pythonExecutable,
      [
        '-m',
        'uvicorn',
        'tests.mock_chatbot_http_app:app',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--no-access-log',
      ],
      {
        cwd: aiDirectory,
        env: { ...process.env, PYTHONPATH: aiDirectory },
        stdio: 'ignore',
      },
    );
    let spawnFailure: Error | undefined;
    aiProcess.once('error', (error) => {
      spawnFailure = error;
    });

    let ready = false;
    const deadline = Date.now() + 15_000;
    while (!ready && Date.now() < deadline) {
      if (spawnFailure) throw spawnFailure;
      if (aiProcess.exitCode !== null) {
        throw new Error(
          `The test-only FastAPI process exited with code ${aiProcess.exitCode}`,
        );
      }
      try {
        const response = await fetch(`${aiBaseUrl}/health`);
        ready = response.ok;
      } catch {
        await wait(100);
      }
    }
    if (!ready)
      throw new Error('The test-only FastAPI service did not become healthy');

    originalAiServiceUrl = process.env.AI_SERVICE_URL;
    process.env.AI_SERVICE_URL = aiBaseUrl;

    const module: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, AdminChatbotModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AuditService)
      .useValue({ record: vi.fn().mockResolvedValue(undefined) })
      .compile();

    coreApp = module.createNestApplication();
    await coreApp.init();
  }, 30_000);

  afterAll(async () => {
    if (coreApp) await coreApp.close();
    if (originalAiServiceUrl === undefined) delete process.env.AI_SERVICE_URL;
    else process.env.AI_SERVICE_URL = originalAiServiceUrl;
    if (
      aiProcess &&
      aiProcess.exitCode === null &&
      aiProcess.signalCode === null
    ) {
      const exited = once(aiProcess, 'exit');
      aiProcess.kill();
      await Promise.race([exited, wait(3_000)]);
    }
  });

  it('authenticates Core callers and carries unseen English and Arabic questions through real HTTP routes', async () => {
    const endpoint = () =>
      request(coreApp.getHttpServer()).post('/admin/chatbot/messages');

    const unauthenticated = await endpoint().send({
      question: ENGLISH_QUESTION,
    });
    expect(unauthenticated.status).toBe(401);

    const nonAdmin = await endpoint()
      .set('x-user-id', ADMIN_ID)
      .set('x-user-type', 'STAFF')
      .set('x-user-roles', 'RECEPTIONIST')
      .send({ question: ENGLISH_QUESTION });
    expect(nonAdmin.status).toBe(403);

    const english = await endpoint()
      .set('x-user-id', ADMIN_ID)
      .set('x-user-type', 'STAFF')
      .set('x-user-roles', 'ADMIN')
      .send({ question: ENGLISH_QUESTION });
    expect(english.status).toBe(200);
    expect(english.body).toEqual({
      status: 'ANSWERED',
      answer: ENGLISH_ANSWER,
      language: 'en',
      sources: [
        {
          entryId: 'KB-001',
          title: { ar: 'مواعيد الاستقبال الرئيسي', en: 'Main Reception Hours' },
        },
      ],
    });

    const arabic = await endpoint()
      .set('x-user-id', ADMIN_ID)
      .set('x-user-type', 'STAFF')
      .set('x-user-roles', 'ADMIN')
      .send({ question: ARABIC_QUESTION });
    expect(arabic.status).toBe(200);
    expect(arabic.body).toEqual({
      status: 'ANSWERED',
      answer: ARABIC_ANSWER,
      language: 'ar',
      sources: [
        {
          entryId: 'KB-001',
          title: { ar: 'مواعيد الاستقبال الرئيسي', en: 'Main Reception Hours' },
        },
      ],
    });

    const noInformationQuestion = 'Does the hospital have a rooftop café?';
    const noInformation = await endpoint()
      .set('x-user-id', ADMIN_ID)
      .set('x-user-type', 'STAFF')
      .set('x-user-roles', 'ADMIN')
      .send({ question: noInformationQuestion });
    expect(noInformation.status).toBe(200);
    expect(noInformation.body).toEqual({
      status: 'NO_INFORMATION',
      answer: "I don't have that information",
      language: 'en',
      sources: [],
    });

    const unavailableQuestion = 'private question that must not be echoed';
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:1';
    try {
      const unavailable = await endpoint()
        .set('x-user-id', ADMIN_ID)
        .set('x-user-type', 'STAFF')
        .set('x-user-roles', 'ADMIN')
        .send({ question: unavailableQuestion });
      expect(unavailable.status).toBe(503);
      expect(JSON.stringify(unavailable.body)).not.toContain(
        unavailableQuestion,
      );
    } finally {
      process.env.AI_SERVICE_URL = aiBaseUrl;
    }

    const mockState = await fetch(`${aiBaseUrl}/__test__/state`).then(
      (response) => response.json(),
    );
    expect(mockState).toEqual({
      query_texts: [ENGLISH_QUESTION, ARABIC_QUESTION, noInformationQuestion],
      claude_languages: ['en', 'ar'],
    });
  }, 30_000);
});
