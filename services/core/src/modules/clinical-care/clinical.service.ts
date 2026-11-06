import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TestStatus } from '../../generated/prisma/enums.js';
import { ApiError, notFound } from '../../shared/api-error.js';
import { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import { FileStorageService } from '../../shared/file-storage.service.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { RecordAccessService } from '../../shared/record-access.service.js';
import type { OrderTestDto } from './clinical.dto.js';
import {
  resultFileSelect,
  testOrderSelect,
  toFileView,
  toTestView,
} from './clinical.views.js';
import { validateResultUpload, type ResultUpload } from './result-upload.js';

function invalidTransition(): ApiError {
  return new ApiError(
    409,
    'INVALID_TRANSITION',
    'The test or visit is not in the required state.',
  );
}

/** IClinical: test orders, private result files and doctor-controlled release. */
@Injectable()
export class ClinicalService {
  private readonly logger = new Logger(ClinicalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RecordAccessService,
    private readonly storage: FileStorageService,
  ) {}

  async orderTest(caller: Caller, appointmentId: string, input: OrderTestDto) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize against completion of the visit, which updates this same row.
      await tx.$queryRaw`SELECT id FROM core.appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
      const visit = await this.access.doctorVisit(
        caller,
        appointmentId,
        'test.order',
        tx,
      );
      if (visit.status !== 'IN_CONSULTATION') throw invalidTransition();
      const clinic = await tx.clinic.findFirst({
        where: {
          id: input.clinicId,
          active: true,
          department: { active: true, kind: { in: ['LAB', 'RADIOLOGY'] } },
        },
        select: { id: true },
      });
      if (!clinic) {
        throw new ApiError(
          400,
          'VALIDATION_FAILED',
          'Choose an active lab or radiology clinic.',
          [
            {
              field: 'clinicId',
              problem: 'must be an active lab or radiology clinic',
            },
          ],
        );
      }
      const test = await tx.testOrder.create({
        data: {
          appointmentId,
          clinicId: input.clinicId,
          testName: input.testName,
          instructions: input.instructions,
          orderedById: caller.id,
        },
        select: testOrderSelect,
      });
      await this.record(caller, 'test.order', test.id, tx);
      return toTestView(test);
    });
  }

  async listVisitTests(caller: Caller, appointmentId: string) {
    await this.access.doctorVisit(caller, appointmentId, 'test.read');
    return this.prisma.$transaction(async (tx) => {
      const tests = await tx.testOrder.findMany({
        where: { appointmentId },
        select: testOrderSelect,
        orderBy: [{ orderedAt: 'asc' }, { id: 'asc' }],
      });
      await this.audit.record(
        {
          caller,
          action: 'test.read',
          entityType: 'appointment',
          entityId: appointmentId,
          outcome: 'SUCCESS',
        },
        tx,
      );
      return tests.map(toTestView);
    });
  }

  async listLabTests(caller: Caller, status?: TestStatus) {
    return this.prisma.$transaction(async (tx) => {
      const tests = await tx.testOrder.findMany({
        where: { status, clinic: { staff: { some: { staffId: caller.id } } } },
        select: testOrderSelect,
        orderBy: [{ orderedAt: 'asc' }, { id: 'asc' }],
      });
      await this.audit.record(
        { caller, action: 'test.lab_list', outcome: 'SUCCESS' },
        tx,
      );
      return tests.map(toTestView);
    });
  }

  async startTest(caller: Caller, testId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTest(tx, testId);
      const test = await this.access.test(
        caller,
        testId,
        'lab',
        'test.start',
        tx,
      );
      if (test.status !== 'REQUESTED') throw invalidTransition();
      const updated = await tx.testOrder.update({
        where: { id: testId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
        select: testOrderSelect,
      });
      await this.record(caller, 'test.start', testId, tx);
      return toTestView(updated);
    });
  }

  async uploadResult(caller: Caller, testId: string, upload?: ResultUpload) {
    // Ownership is checked before storage is touched and again under the row lock.
    const current = await this.access.test(
      caller,
      testId,
      'lab',
      'result.upload',
    );
    if (
      current.status !== 'IN_PROGRESS' &&
      current.status !== 'AWAITING_REVIEW'
    ) {
      throw invalidTransition();
    }
    const file = validateResultUpload(upload);
    const storageKey = `results/${randomUUID()}`;
    let oldKey: string | undefined;
    let committed = false;
    try {
      // Private and unreferenced until the database transaction commits.
      await this.storage.put(storageKey, file.buffer, file.mimetype);
      const view = await this.prisma.$transaction(async (tx) => {
        await this.lockTest(tx, testId);
        const test = await this.access.test(
          caller,
          testId,
          'lab',
          'result.upload',
          tx,
        );
        if (test.status !== 'IN_PROGRESS' && test.status !== 'AWAITING_REVIEW')
          throw invalidTransition();
        const previous = await tx.testResultFile.findUnique({
          where: { testOrderId: testId },
          select: { storageKey: true },
        });
        oldKey = previous?.storageKey;
        const data = {
          storageKey,
          fileName: file.originalname,
          contentType: file.mimetype,
          sizeBytes: file.size,
          uploadedById: caller.id,
          uploadedAt: new Date(),
        };
        await tx.testResultFile.upsert({
          where: { testOrderId: testId },
          create: { testOrderId: testId, ...data },
          update: data,
        });
        const updated = await tx.testOrder.update({
          where: { id: testId },
          data: { status: 'AWAITING_REVIEW' },
          select: testOrderSelect,
        });
        await this.record(caller, 'result.upload', testId, tx);
        return toTestView(updated);
      });
      committed = true;
      if (oldKey) await this.cleanup(oldKey);
      return view;
    } catch (error) {
      if (!committed) await this.cleanup(storageKey);
      throw error;
    }
  }

  async releaseResult(caller: Caller, testId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTest(tx, testId);
      const test = await this.access.test(
        caller,
        testId,
        'doctor',
        'result.release',
        tx,
      );
      const file = await tx.testResultFile.findUnique({
        where: { testOrderId: testId },
        select: { id: true },
      });
      if (test.status !== 'AWAITING_REVIEW' || !file) throw invalidTransition();
      const updated = await tx.testOrder.update({
        where: { id: testId },
        data: {
          status: 'RELEASED',
          releasedAt: new Date(),
          releasedById: caller.id,
        },
        select: testOrderSelect,
      });
      await this.record(caller, 'result.release', testId, tx);
      return toTestView(updated);
    });
  }

  async listMyResults(caller: Caller) {
    return this.prisma.$transaction(async (tx) => {
      const tests = await tx.testOrder.findMany({
        where: { appointment: { patientId: caller.id } },
        select: {
          id: true,
          appointmentId: true,
          testName: true,
          orderedAt: true,
          status: true,
          releasedAt: true,
          resultFile: { select: resultFileSelect },
        },
        orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
      });
      await this.audit.record(
        { caller, action: 'result.read', outcome: 'SUCCESS' },
        tx,
      );
      return tests.map((test) => ({
        testId: test.id,
        appointmentId: test.appointmentId,
        testName: test.testName,
        orderedAt: test.orderedAt.toISOString(),
        status: test.status === 'RELEASED' ? 'RELEASED' : 'WAITING_FOR_REVIEW',
        releasedAt:
          test.status === 'RELEASED'
            ? (test.releasedAt?.toISOString() ?? null)
            : null,
        file: test.status === 'RELEASED' ? toFileView(test.resultFile) : null,
      }));
    });
  }

  async downloadResult(caller: Caller, testId: string) {
    // Hold the test lock until the object is opened and the read is audited,
    // so a replacement cannot delete the old object before it is opened.
    let opened: Awaited<ReturnType<FileStorageService['get']>> | undefined;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.lockTest(tx, testId);
          await this.access.test(
            caller,
            testId,
            'download',
            'result.download',
            tx,
          );
          const file = await tx.testResultFile.findUnique({
            where: { testOrderId: testId },
          });
          if (!file) throw notFound();
          opened = await this.storage.get(file.storageKey);
          await this.record(caller, 'result.download', testId, tx);
          return { stream: opened, file: toFileView(file)! };
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      opened?.destroy();
      throw error;
    }
  }

  private async lockTest(
    tx: Prisma.TransactionClient,
    testId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM core.test_orders WHERE id = ${testId}::uuid FOR UPDATE`;
  }

  private record(
    caller: Caller,
    action: string,
    testId: string,
    tx: Prisma.TransactionClient,
  ) {
    return this.audit.record(
      {
        caller,
        action,
        entityType: 'test_order',
        entityId: testId,
        outcome: 'SUCCESS',
      },
      tx,
    );
  }

  private async cleanup(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch {
      // No clinical content, object keys, or names in logs. A private orphan
      // is safer than undoing a successful upload or masking the real error.
      this.logger.warn(
        'Could not remove an unreferenced private result object.',
      );
    }
  }
}
