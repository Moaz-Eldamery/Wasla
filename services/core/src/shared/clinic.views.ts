// The contract's Clinic shape (contracts/openapi.yaml) and the Prisma select
// that loads it. Shared because several modules return clinics (appointments,
// patient journey), and modules never import each other's internals.
import type { Prisma } from '../generated/prisma/client.js';

export interface LocalizedText {
  ar: string;
  en: string;
}

export interface ClinicView {
  id: string;
  departmentId: string;
  name: LocalizedText;
  building: string;
  floor: string;
  directions: LocalizedText;
}

export const clinicSelect = {
  id: true,
  departmentId: true,
  nameAr: true,
  nameEn: true,
  building: true,
  floor: true,
  directionsAr: true,
  directionsEn: true,
} satisfies Prisma.ClinicSelect;

export type ClinicRow = Prisma.ClinicGetPayload<{ select: typeof clinicSelect }>;

export function toClinicView(c: ClinicRow): ClinicView {
  return {
    id: c.id,
    departmentId: c.departmentId,
    name: { ar: c.nameAr, en: c.nameEn },
    building: c.building,
    floor: c.floor,
    directions: { ar: c.directionsAr, en: c.directionsEn },
  };
}
