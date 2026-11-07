import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { DepartmentKind, StaffRole } from '../../generated/prisma/enums.js';
import { ApiError, notFound } from '../../shared/api-error.js';
import { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import type { LocalizedText } from '../../shared/clinic.views.js';
import { PrismaService } from '../../shared/prisma.service.js';

/** The contract's `AssignedStaff`. */
export interface AssignedStaffView {
  id: string;
  name: string;
  roles: StaffRole[];
  active: boolean;
}

/** The contract's `AdminClinic`. */
export interface AdminClinicView {
  id: string;
  departmentId: string;
  name: LocalizedText;
  building: string;
  floor: string;
  directions: LocalizedText;
  active: boolean;
  staff: AssignedStaffView[];
}

/** The contract's `AdminDepartment`. */
export interface AdminDepartmentView {
  id: string;
  kind: DepartmentKind;
  name: LocalizedText;
  active: boolean;
  clinics: AdminClinicView[];
}

export interface ClinicInput {
  name: LocalizedText;
  building: string;
  floor: string;
  directions: LocalizedText;
}

/** Departments come clinical first, then lab, then radiology (the statistics use the same order). */
export const KIND_ORDER: DepartmentKind[] = ['CLINICAL', 'LAB', 'RADIOLOGY'];

/** Roles that work inside clinics. An admin-only account has no clinic. */
const CLINIC_ROLES: StaffRole[] = ['RECEPTIONIST', 'DOCTOR', 'LAB'];
const ROLE_ORDER: StaffRole[] = ['RECEPTIONIST', 'DOCTOR', 'LAB', 'ADMIN'];

// Only the auth.accounts columns wasla_core may read (schema.md): never email.
const adminClinicSelect = {
  id: true,
  departmentId: true,
  nameAr: true,
  nameEn: true,
  building: true,
  floor: true,
  directionsAr: true,
  directionsEn: true,
  active: true,
  staff: {
    select: { staff: { select: { id: true, name: true, roles: true, active: true } } },
  },
} satisfies Prisma.ClinicSelect;

type AdminClinicRow = Prisma.ClinicGetPayload<{ select: typeof adminClinicSelect }>;

const adminDepartmentSelect = {
  id: true,
  kind: true,
  nameAr: true,
  nameEn: true,
  active: true,
  clinics: { select: adminClinicSelect },
} satisfies Prisma.DepartmentSelect;

type AdminDepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof adminDepartmentSelect }>;

const byEnglishName = (a: { name: LocalizedText }, b: { name: LocalizedText }) =>
  a.name.en.localeCompare(b.name.en, 'en');

function toClinicView(c: AdminClinicRow): AdminClinicView {
  return {
    id: c.id,
    departmentId: c.departmentId,
    name: { ar: c.nameAr, en: c.nameEn },
    building: c.building,
    floor: c.floor,
    directions: { ar: c.directionsAr, en: c.directionsEn },
    active: c.active,
    staff: c.staff
      .map(({ staff }) => ({ ...staff, roles: ROLE_ORDER.filter((r) => staff.roles.includes(r)) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)),
  };
}

function toDepartmentView(d: AdminDepartmentRow): AdminDepartmentView {
  return {
    id: d.id,
    kind: d.kind,
    name: { ar: d.nameAr, en: d.nameEn },
    active: d.active,
    clinics: d.clinics.map(toClinicView).sort(byEnglishName),
  };
}

/** Departments in the fixed order: by kind, then English name. */
export function sortDepartments<T extends { kind: DepartmentKind; name: LocalizedText }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || byEnglishName(a, b),
  );
}

/**
 * IAdmin: hospital setup (KAN-36). Business rules ("Hospital setup"): nothing
 * is deleted, only deactivated; a clinic is bookable only while it and its
 * department are both active; a department's kind is fixed once created.
 * Every change is audited in the same transaction.
 */
@Injectable()
export class HospitalSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listDepartments(): Promise<AdminDepartmentView[]> {
    const rows = await this.prisma.department.findMany({ select: adminDepartmentSelect });
    return sortDepartments(rows.map(toDepartmentView));
  }

  async createDepartment(
    caller: Caller,
    kind: DepartmentKind,
    name: LocalizedText,
  ): Promise<AdminDepartmentView> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.department.create({
        data: { kind, nameAr: name.ar, nameEn: name.en },
        select: adminDepartmentSelect,
      });
      await this.record(tx, caller, 'department.create', 'department', row.id, { kind });
      return toDepartmentView(row);
    });
  }

  async renameDepartment(
    caller: Caller,
    departmentId: string,
    name: LocalizedText,
  ): Promise<AdminDepartmentView> {
    await this.findDepartment(departmentId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.department.update({
        where: { id: departmentId },
        data: { nameAr: name.ar, nameEn: name.en },
        select: adminDepartmentSelect,
      });
      await this.record(tx, caller, 'department.update', 'department', departmentId);
      return toDepartmentView(row);
    });
  }

  /** Deactivating hides the department and all its clinics from booking. Twice is harmless. */
  async setDepartmentActive(
    caller: Caller,
    departmentId: string,
    active: boolean,
  ): Promise<AdminDepartmentView> {
    await this.findDepartment(departmentId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.department.update({
        where: { id: departmentId },
        data: { active },
        select: adminDepartmentSelect,
      });
      const action = active ? 'department.reactivate' : 'department.deactivate';
      await this.record(tx, caller, action, 'department', departmentId);
      return toDepartmentView(row);
    });
  }

  async createClinic(
    caller: Caller,
    departmentId: string,
    input: ClinicInput,
  ): Promise<AdminClinicView> {
    await this.findDepartment(departmentId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.clinic.create({
        data: { departmentId, ...clinicData(input) },
        select: adminClinicSelect,
      });
      await this.record(tx, caller, 'clinic.create', 'clinic', row.id, { departmentId });
      return toClinicView(row);
    });
  }

  /** Name, building, floor and directions. Booked appointments keep the clinic. */
  async updateClinic(caller: Caller, clinicId: string, input: ClinicInput): Promise<AdminClinicView> {
    await this.findClinic(clinicId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.clinic.update({
        where: { id: clinicId },
        data: clinicData(input),
        select: adminClinicSelect,
      });
      await this.record(tx, caller, 'clinic.update', 'clinic', clinicId);
      return toClinicView(row);
    });
  }

  async setClinicActive(caller: Caller, clinicId: string, active: boolean): Promise<AdminClinicView> {
    await this.findClinic(clinicId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.clinic.update({
        where: { id: clinicId },
        data: { active },
        select: adminClinicSelect,
      });
      await this.record(tx, caller, active ? 'clinic.reactivate' : 'clinic.deactivate', 'clinic', clinicId);
      return toClinicView(row);
    });
  }

  /**
   * Assigns an active staff member with a clinic role (receptionist, doctor,
   * lab) to a clinic. Assigning someone already there is harmless.
   */
  async assignStaff(caller: Caller, clinicId: string, staffId: string): Promise<AdminClinicView> {
    await this.findClinic(clinicId);
    const staff = await this.prisma.account.findUnique({
      where: { id: staffId },
      select: { type: true, roles: true, active: true },
    });
    if (staff?.type !== 'STAFF') throw notFound();
    if (!staff.active || !staff.roles.some((r) => CLINIC_ROLES.includes(r))) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        'Only active receptionists, doctors and lab staff can work in a clinic.',
        [{ field: 'staffId', problem: staff.active ? 'has no clinic role' : 'is inactive' }],
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.staffClinic.upsert({
        where: { staffId_clinicId: { staffId, clinicId } },
        create: { staffId, clinicId },
        update: {},
        select: { clinicId: true },
      });
      await this.record(tx, caller, 'clinic.staff.assign', 'clinic', clinicId, { staffId });
      return toClinicView(await tx.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: adminClinicSelect }));
    });
  }

  /** Their past and booked appointments in the clinic are unchanged. Removing someone not there is harmless. */
  async unassignStaff(caller: Caller, clinicId: string, staffId: string): Promise<AdminClinicView> {
    await this.findClinic(clinicId);
    return this.prisma.$transaction(async (tx) => {
      await tx.staffClinic.deleteMany({ where: { staffId, clinicId } });
      await this.record(tx, caller, 'clinic.staff.unassign', 'clinic', clinicId, { staffId });
      return toClinicView(await tx.clinic.findUniqueOrThrow({ where: { id: clinicId }, select: adminClinicSelect }));
    });
  }

  private async findDepartment(id: string): Promise<void> {
    const found = await this.prisma.department.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw notFound();
  }

  private async findClinic(id: string): Promise<void> {
    const found = await this.prisma.clinic.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw notFound();
  }

  private record(
    tx: Prisma.TransactionClient,
    caller: Caller,
    action: string,
    entityType: 'department' | 'clinic',
    entityId: string,
    details?: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.record({ caller, action, entityType, entityId, outcome: 'SUCCESS', details }, tx);
  }
}

function clinicData(input: ClinicInput) {
  return {
    nameAr: input.name.ar,
    nameEn: input.name.en,
    building: input.building,
    floor: input.floor,
    directionsAr: input.directions.ar,
    directionsEn: input.directions.en,
  };
}
