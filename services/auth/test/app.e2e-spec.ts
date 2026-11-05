import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule, GLOBAL_PREFIX } from './../src/app.module.js';

describe('Auth service (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX);
    await app.init();
  });

  it('GET /auth/health is ok', () => {
    return request(app.getHttpServer())
      .get('/auth/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /auth/check refuses requests without a session', () => {
    return request(app.getHttpServer()).get('/auth/check').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
