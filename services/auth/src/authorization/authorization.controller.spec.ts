import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthorizationController } from './authorization.controller.js';

describe('AuthorizationController', () => {
  let controller: AuthorizationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthorizationController],
    }).compile();

    controller = module.get(AuthorizationController);
  });

  it('refuses every request until sessions exist (fails closed)', () => {
    expect(() => controller.check()).toThrow(UnauthorizedException);
  });
});
