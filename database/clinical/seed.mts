// Fake demo data for wasla_clinical (KAN-13): departments, clinics, staff,
// patients, free slots and past visits. Every name and number here is made up.
//
//   docker compose run --rm seed                     the usual way
//   docker compose run --rm seed --past-visits 10000
//   MIGRATOR_DATABASE_URL=... pnpm db:seed           against any database
//
// Runs as wasla_migrator (it writes to both schemas), in one transaction, and
// refuses to touch a database that already has data. To start over:
// docker compose down -v.
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';

// ---------------------------------------------------------------- settings

const { values: args } = parseArgs({
  options: {
    'past-visits': { type: 'string', default: '3000' },
    patients: { type: 'string', default: '200' },
    'past-days': { type: 'string', default: '90' },
    'future-days': { type: 'string', default: '14' },
  },
});
const PAST_VISITS = Number(args['past-visits']);
const PATIENTS = Number(args.patients);
const PAST_DAYS = Number(args['past-days']);
const FUTURE_WORKING_DAYS = Number(args['future-days']);

/** Shared by every demo account. Demo databases only. */
const DEMO_PASSWORD = 'demo-password';
/**
 * The fixed demo logins, one per staff role plus a patient. Listed in the
 * README. Staff log in to the website with a work email (`.test` is a reserved
 * domain, so these never reach a real inbox); the patient logs in to the app
 * with a phone number.
 */
const STAFF_EMAIL_DOMAIN = 'wasla.test';
const DEMO_LOGINS = [
  { role: 'admin', login: `admin@${STAFF_EMAIL_DOMAIN}` },
  { role: 'receptionist', login: `receptionist@${STAFF_EMAIL_DOMAIN}` },
  { role: 'doctor', login: `doctor@${STAFF_EMAIL_DOMAIN}` },
  { role: 'lab', login: `lab@${STAFF_EMAIL_DOMAIN}` },
  { role: 'radiology', login: `radiology@${STAFF_EMAIL_DOMAIN}` },
  { role: 'patient', login: '+201000000006' },
];
const SLOT_MINUTES = 15;
const DAY_START_HOUR = 9; // Cairo time
const DAY_END_HOUR = 14;
/** Share of future slots that are already booked. */
const FUTURE_BOOKED_SHARE = 0.25;

// ---------------------------------------------------------------- randomness

/** mulberry32: a small seeded PRNG, so every run builds the same hospital. */
let state = 20261105;
function random(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number): number => min + random() * (max - min);
/** Roughly normal, from the average of three uniforms. */
const around = (mean: number, spread: number): number =>
  mean + ((random() + random() + random()) / 3 - 0.5) * 2 * spread;

// ---------------------------------------------------------------- Cairo time
// Times are stored in UTC, but the hospital works Cairo hours (with DST).

const cairoParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function cairoOffsetAt(instant: number): number {
  const p = Object.fromEntries(
    cairoParts.formatToParts(new Date(instant)).map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(instant / 1000) * 1000;
}

/** A Cairo wall-clock time on a Cairo day, as a UTC instant. */
function cairoTime(day: string, hour: number, minute = 0): Date {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  return new Date(wall - cairoOffsetAt(wall - cairoOffsetAt(wall)));
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const cairoToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

/** The hospital works Sunday to Thursday (Egypt's weekend is Friday and Saturday). */
const isWorkingDay = (day: string): boolean => new Date(`${day}T12:00:00Z`).getUTCDay() <= 4;

const minutes = (n: number): number => n * 60_000;
const SLOT_TIMES: [number, number][] = [];
for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
  for (let m = 0; m < 60; m += SLOT_MINUTES) SLOT_TIMES.push([h, m]);
}

// ---------------------------------------------------------------- the hospital

interface ClinicSeed {
  nameAr: string;
  nameEn: string;
  building: string;
  floor: string;
  directionsAr: string;
  directionsEn: string;
  doctors: number;
}
interface DepartmentSeed {
  kind: 'CLINICAL' | 'LAB' | 'RADIOLOGY';
  nameAr: string;
  nameEn: string;
  /** Typical consultation length, minutes. */
  visitMinutes: number;
  clinics: ClinicSeed[];
}

const DEPARTMENTS: DepartmentSeed[] = [
  {
    kind: 'CLINICAL', nameAr: 'الباطنة', nameEn: 'Internal Medicine', visitMinutes: 14,
    clinics: [
      { nameAr: 'عيادة الباطنة ١', nameEn: 'Internal Medicine Clinic 1', building: 'A', floor: '1',
        directionsAr: 'من المدخل الرئيسي، يسار المصعد', directionsEn: 'From the main entrance, left of the lift', doctors: 2 },
      { nameAr: 'عيادة الباطنة ٢', nameEn: 'Internal Medicine Clinic 2', building: 'A', floor: '1',
        directionsAr: 'من المدخل الرئيسي، آخر الممر يسارًا', directionsEn: 'From the main entrance, end of the corridor on the left', doctors: 1 },
    ],
  },
  {
    kind: 'CLINICAL', nameAr: 'طب الأطفال', nameEn: 'Pediatrics', visitMinutes: 12,
    clinics: [
      { nameAr: 'عيادة الأطفال ١', nameEn: 'Pediatrics Clinic 1', building: 'A', floor: '2',
        directionsAr: 'الدور الثاني، يمين المصعد', directionsEn: 'Second floor, right of the lift', doctors: 2 },
      { nameAr: 'عيادة الأطفال ٢', nameEn: 'Pediatrics Clinic 2', building: 'A', floor: '2',
        directionsAr: 'الدور الثاني، بجوار غرفة الانتظار', directionsEn: 'Second floor, next to the waiting room', doctors: 1 },
    ],
  },
  {
    kind: 'CLINICAL', nameAr: 'أمراض القلب', nameEn: 'Cardiology', visitMinutes: 18,
    clinics: [
      { nameAr: 'عيادة القلب', nameEn: 'Cardiology Clinic', building: 'B', floor: '1',
        directionsAr: 'المبنى ب، الدور الأول، أول باب يمينًا', directionsEn: 'Building B, first floor, first door on the right', doctors: 2 },
    ],
  },
  {
    kind: 'CLINICAL', nameAr: 'العظام', nameEn: 'Orthopedics', visitMinutes: 15,
    clinics: [
      { nameAr: 'عيادة العظام', nameEn: 'Orthopedics Clinic', building: 'B', floor: '2',
        directionsAr: 'المبنى ب، الدور الثاني، مقابل المصعد', directionsEn: 'Building B, second floor, opposite the lift', doctors: 2 },
    ],
  },
  {
    kind: 'CLINICAL', nameAr: 'الجلدية', nameEn: 'Dermatology', visitMinutes: 9,
    clinics: [
      { nameAr: 'عيادة الجلدية', nameEn: 'Dermatology Clinic', building: 'B', floor: '3',
        directionsAr: 'المبنى ب، الدور الثالث، يسار المصعد', directionsEn: 'Building B, third floor, left of the lift', doctors: 2 },
    ],
  },
  {
    kind: 'CLINICAL', nameAr: 'الأنف والأذن والحنجرة', nameEn: 'Ear, Nose and Throat', visitMinutes: 11,
    clinics: [
      { nameAr: 'عيادة الأنف والأذن', nameEn: 'ENT Clinic', building: 'C', floor: '1',
        directionsAr: 'المبنى ج، الدور الأول، آخر الممر', directionsEn: 'Building C, first floor, end of the corridor', doctors: 2 },
    ],
  },
  {
    kind: 'LAB', nameAr: 'المعمل', nameEn: 'Laboratory', visitMinutes: 0,
    clinics: [
      { nameAr: 'المعمل الرئيسي', nameEn: 'Main Laboratory', building: 'C', floor: 'Ground',
        directionsAr: 'المبنى ج، الدور الأرضي، بجوار الصيدلية', directionsEn: 'Building C, ground floor, next to the pharmacy', doctors: 0 },
    ],
  },
  {
    kind: 'RADIOLOGY', nameAr: 'الأشعة', nameEn: 'Radiology', visitMinutes: 0,
    clinics: [
      { nameAr: 'قسم الأشعة', nameEn: 'Radiology Unit', building: 'C', floor: 'Basement',
        directionsAr: 'المبنى ج، الدور السفلي، اتبع العلامات الزرقاء', directionsEn: 'Building C, basement, follow the blue signs', doctors: 0 },
    ],
  },
];

// Made-up names: random combinations of common Egyptian first and family names.
const MALE: [string, string][] = [
  ['أحمد', 'Ahmed'], ['محمد', 'Mohamed'], ['مصطفى', 'Mostafa'], ['عمر', 'Omar'], ['يوسف', 'Youssef'],
  ['كريم', 'Karim'], ['خالد', 'Khaled'], ['حسن', 'Hassan'], ['طارق', 'Tarek'], ['ياسين', 'Yassin'],
  ['مازن', 'Mazen'], ['شريف', 'Sherif'],
];
const FEMALE: [string, string][] = [
  ['فاطمة', 'Fatma'], ['مريم', 'Mariam'], ['نور', 'Nour'], ['سارة', 'Sara'], ['هبة', 'Heba'],
  ['ياسمين', 'Yasmin'], ['منى', 'Mona'], ['رنا', 'Rana'], ['دينا', 'Dina'], ['سلمى', 'Salma'],
  ['ليلى', 'Laila'], ['جنى', 'Jana'],
];
const FAMILY: [string, string][] = [
  ['عبد الرحمن', 'Abdelrahman'], ['السيد', 'El-Sayed'], ['حسين', 'Hussein'], ['إبراهيم', 'Ibrahim'],
  ['علي', 'Ali'], ['محمود', 'Mahmoud'], ['عثمان', 'Osman'], ['فاروق', 'Farouk'], ['سليمان', 'Soliman'],
  ['النجار', 'El-Naggar'], ['الشريف', 'El-Sherif'], ['عبد الله', 'Abdallah'], ['رمضان', 'Ramadan'],
  ['زكي', 'Zaki'],
];

/** "First Father Family", in Arabic or English script (half each). */
function fakeName(): string {
  const first = pick(random() < 0.5 ? MALE : FEMALE);
  const father = pick(MALE);
  const family = pick(FAMILY);
  const i = random() < 0.5 ? 0 : 1;
  return `${first[i]} ${father[i]} ${family[i]}`;
}
const doctorName = (): string => {
  const name = fakeName();
  return /[a-z]/i.test(name) ? `Dr. ${name}` : `د. ${name}`;
};

const NOTES: [string, string][] = [
  ['Follow-up of blood pressure. Readings stable on current dose.', 'Your blood pressure is stable. Keep taking your medicine as before.'],
  ['Seasonal allergy symptoms. Antihistamine prescribed for 2 weeks.', 'You have a seasonal allergy. Take the prescribed tablet daily for 2 weeks.'],
  ['Mild lower back strain. Advised rest and physiotherapy.', 'Your back pain is from a muscle strain. Rest and start physiotherapy.'],
  ['Routine check. No new complaints. Labs within normal range.', 'Your check-up went well. No changes needed.'],
  ['Skin rash, likely contact dermatitis. Topical cream prescribed.', 'Your rash is a skin reaction. Use the cream twice a day.'],
  ['Sore throat, viral. Symptomatic treatment advised.', 'You have a viral sore throat. Rest and drink warm fluids.'],
];

// ---------------------------------------------------------------- writing

type Row = Record<string, unknown>;

/** Multi-row INSERT in chunks (Postgres allows 65,535 parameters per query). */
async function insert(db: pg.PoolClient, table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const perChunk = Math.floor(60_000 / columns.length);
  for (let start = 0; start < rows.length; start += perChunk) {
    const chunk = rows.slice(start, start + perChunk);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const slots = columns.map((c) => {
        values.push(row[c]);
        return `$${values.length}`;
      });
      return `(${slots.join(', ')})`;
    });
    const cols = columns.map((c) => `"${c}"`).join(', ');
    await db.query(`INSERT INTO ${table} (${cols}) VALUES ${tuples.join(', ')}`, values);
  }
}

// ---------------------------------------------------------------- build

const url = process.env.MIGRATOR_DATABASE_URL;
if (!url) {
  console.error('MIGRATOR_DATABASE_URL is not set (connect as wasla_migrator).');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const db = await pool.connect();
try {
  const { rows: existing } = await db.query(
    'SELECT (SELECT count(*) FROM auth.accounts) + (SELECT count(*) FROM core.departments) AS n',
  );
  if (Number(existing[0].n) > 0) {
    console.error(
      'This database already has accounts or departments; the demo data only goes into an empty one.\n' +
        'To start over: docker compose down -v, then docker compose up and run the seed again.',
    );
    process.exitCode = 1;
  } else {
    await db.query('BEGIN');
    const counts = await build(db);
    await db.query('COMMIT');
    console.log('Demo data loaded:', counts);
    console.log(`Demo logins (password "${DEMO_PASSWORD}"):`);
    for (const login of DEMO_LOGINS) console.log(`  ${login.role.padEnd(13)} ${login.login}`);
  }
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  db.release();
  await pool.end();
}

async function build(db: pg.PoolClient): Promise<Record<string, number>> {
  const now = new Date();
  const today = cairoToday();
  const passwordHash = await hash(DEMO_PASSWORD);

  const accounts: Row[] = [];
  const staffClinics: Row[] = [];
  let staffNumber = 1;
  // Every row has the same columns (insert() takes them from the first row).
  const account = (row: Row): string => {
    const id = randomUUID();
    accounts.push({
      id,
      password_hash: passwordHash,
      phone: null,
      email: null,
      phone_verified_at: null,
      ...row,
    });
    return id;
  };
  // Staff: a work email to log in with, and no phone (it's optional for staff).
  const staff = (name: string, roles: string[], demoLogin?: string): string =>
    account({
      type: 'STAFF',
      name,
      roles,
      email: demoLogin
        ? `${demoLogin}@${STAFF_EMAIL_DOMAIN}`
        : `staff${String(staffNumber++).padStart(2, '0')}@${STAFF_EMAIL_DOMAIN}`,
    });
  // Patients: a verified phone number to log in to the app with.
  const patient = (name: string, phone: string): string =>
    account({ type: 'PATIENT', name, phone, roles: [], phone_verified_at: now });

  // Departments, clinics and the staff who work in them.
  const departments: Row[] = [];
  const clinics: Row[] = [];
  const doctors: { id: string; clinicId: string; visitMinutes: number }[] = [];
  const clinicsByKind: Record<string, string[]> = { CLINICAL: [], LAB: [], RADIOLOGY: [] };
  for (const d of DEPARTMENTS) {
    const departmentId = randomUUID();
    departments.push({ id: departmentId, kind: d.kind, name_ar: d.nameAr, name_en: d.nameEn });
    for (const c of d.clinics) {
      const clinicId = randomUUID();
      clinicsByKind[d.kind].push(clinicId);
      clinics.push({
        id: clinicId,
        department_id: departmentId,
        name_ar: c.nameAr,
        name_en: c.nameEn,
        building: c.building,
        floor: c.floor,
        directions_ar: c.directionsAr,
        directions_en: c.directionsEn,
      });
      for (let i = 0; i < c.doctors; i++) {
        const isDemoDoctor = doctors.length === 0;
        const id = staff(
          isDemoDoctor ? 'Dr. Demo Doctor' : doctorName(),
          ['DOCTOR'],
          isDemoDoctor ? 'doctor' : undefined,
        );
        doctors.push({ id, clinicId, visitMinutes: d.visitMinutes });
        staffClinics.push({ staff_id: id, clinic_id: clinicId });
      }
    }
  }

  // Demo logins (fixed emails), then one receptionist per clinical department.
  const [labClinic] = clinicsByKind.LAB;
  const [radiologyClinic] = clinicsByKind.RADIOLOGY;
  staff('Demo Admin', ['ADMIN'], 'admin');
  const demoReceptionist = staff('Demo Receptionist', ['RECEPTIONIST'], 'receptionist');
  const firstDepartment = clinics.filter((c) => c.department_id === departments[0].id);
  for (const c of firstDepartment) {
    staffClinics.push({ staff_id: demoReceptionist, clinic_id: c.id });
  }
  const demoLab = staff('Demo Lab Technician', ['LAB'], 'lab');
  staffClinics.push({ staff_id: demoLab, clinic_id: labClinic });
  const demoRadiology = staff('Demo Radiographer', ['LAB'], 'radiology');
  staffClinics.push({ staff_id: demoRadiology, clinic_id: radiologyClinic });
  for (const d of departments.slice(1)) {
    if (d.kind !== 'CLINICAL') continue;
    const id = staff(fakeName(), ['RECEPTIONIST']);
    for (const c of clinics.filter((c) => c.department_id === d.id)) {
      staffClinics.push({ staff_id: id, clinic_id: c.id });
    }
  }

  // Patients: the demo one first, then made-up ones.
  const demoPatient = patient('Demo Patient', '+201000000006');
  const patients = [demoPatient];
  for (let i = 1; i <= PATIENTS - 1; i++) {
    patients.push(patient(fakeName(), `+2012${String(i).padStart(8, '0')}`));
  }

  const slots: Row[] = [];
  const appointments: Row[] = [];
  const notes: Row[] = [];
  const slot = (doctor: (typeof doctors)[number], startsAt: Date): string => {
    const id = randomUUID();
    slots.push({
      id,
      doctor_id: doctor.id,
      clinic_id: doctor.clinicId,
      starts_at: startsAt,
      ends_at: new Date(startsAt.getTime() + minutes(SLOT_MINUTES)),
    });
    return id;
  };

  // Past visits: whole clinic days, simulated so wait times are realistic.
  // Patients arrive around their slot time; the doctor sees them in arrival
  // order, so waits grow when the doctor runs late.
  const pastDays: string[] = [];
  for (let n = 1; n <= PAST_DAYS; n++) {
    const day = addDays(today, -n);
    if (isWorkingDay(day)) pastDays.push(day);
  }
  let pastVisits = 0;
  const usedDoctorDays = new Set<string>();
  const doctorDays = doctors.length * pastDays.length;
  while (pastVisits < PAST_VISITS && usedDoctorDays.size < doctorDays) {
    const doctor = pick(doctors);
    const day = pick(pastDays);
    if (usedDoctorDays.has(`${doctor.id}|${day}`)) continue;
    usedDoctorDays.add(`${doctor.id}|${day}`);

    const booked = Math.min(
      PAST_VISITS - pastVisits,
      Math.round(between(SLOT_TIMES.length * 0.5, SLOT_TIMES.length * 0.9)),
    );
    const times = [...SLOT_TIMES].sort(() => random() - 0.5).slice(0, booked);
    const visits = times
      .map(([h, m]) => {
        const startsAt = cairoTime(day, h, m);
        return { startsAt, slotId: slot(doctor, startsAt), arrival: startsAt.getTime() + minutes(around(-8, 15)) };
      })
      .sort((a, b) => a.arrival - b.arrival);

    let doctorFreeAt = cairoTime(day, DAY_START_HOUR).getTime();
    for (const v of visits) {
      const patientId = pick(patients);
      const bookedAt = new Date(v.startsAt.getTime() - minutes(between(60, 14 * 24 * 60)));
      const id = randomUUID();
      const roll = random();
      if (roll < 0.08) {
        appointments.push({
          id, patient_id: patientId, slot_id: v.slotId, status: 'CANCELLED',
          booked_at: bookedAt, cancelled_at: new Date(bookedAt.getTime() + minutes(between(30, 600))),
          cancel_reason: 'Cancelled by the patient', updated_at: now,
        });
      } else if (roll < 0.15) {
        // NO_SHOW comes from CHECKED_IN (business.md): checked in, gone when called.
        appointments.push({
          id, patient_id: patientId, slot_id: v.slotId, status: 'NO_SHOW',
          booked_at: bookedAt, checked_in_at: new Date(v.arrival),
          no_show_reason: 'Did not answer when called', updated_at: now,
        });
      } else {
        const startedAt = Math.max(v.arrival + minutes(between(1, 4)), doctorFreeAt);
        const completedAt = startedAt + minutes(Math.max(4, around(doctor.visitMinutes, doctor.visitMinutes * 0.6)));
        doctorFreeAt = completedAt + minutes(between(0.5, 2));
        appointments.push({
          id, patient_id: patientId, slot_id: v.slotId, status: 'COMPLETED',
          booked_at: bookedAt, checked_in_at: new Date(v.arrival), started_at: new Date(startedAt),
          completed_at: new Date(completedAt), updated_at: now,
        });
        const [clinical, summary] = pick(NOTES);
        notes.push({
          id: randomUUID(), appointment_id: id, version: 1, clinical_notes: clinical,
          patient_summary: summary, author_id: doctor.id, created_at: new Date(completedAt),
        });
      }
      pastVisits++;
    }
  }

  // Future slots: every doctor, every working day, some already booked.
  let futureDays = 0;
  for (let n = 0; futureDays < FUTURE_WORKING_DAYS; n++) {
    const day = addDays(today, n);
    if (!isWorkingDay(day)) continue;
    futureDays++;
    for (const doctor of doctors) {
      for (const [h, m] of SLOT_TIMES) {
        const startsAt = cairoTime(day, h, m);
        const slotId = slot(doctor, startsAt);
        if (startsAt > now && random() < FUTURE_BOOKED_SHARE) {
          appointments.push({
            id: randomUUID(), patient_id: pick(patients.slice(1)), slot_id: slotId, status: 'BOOKED',
            booked_at: new Date(now.getTime() - minutes(between(10, 3 * 24 * 60))), updated_at: now,
          });
        }
      }
    }
  }

  // The demo patient gets one upcoming booking with the demo doctor.
  const demoDoctor = doctors[0];
  const bookedSlotIds = new Set(appointments.map((a) => a.slot_id));
  const upcoming = slots.find(
    (s) => s.doctor_id === demoDoctor.id && (s.starts_at as Date) > now && !bookedSlotIds.has(s.id),
  );
  if (upcoming) {
    appointments.push({
      id: randomUUID(), patient_id: demoPatient, slot_id: upcoming.id, status: 'BOOKED',
      booked_at: now, updated_at: now,
    });
  }

  // Every appointment row needs the same columns for the multi-row insert.
  const appointmentColumns = [
    'id', 'patient_id', 'slot_id', 'status', 'booked_at', 'checked_in_at', 'started_at',
    'completed_at', 'cancelled_at', 'cancel_reason', 'no_show_reason', 'updated_at',
  ];
  const uniformAppointments = appointments.map((a) =>
    Object.fromEntries(appointmentColumns.map((c) => [c, a[c] ?? null])),
  );
  const uniformAccounts = accounts.map((a) => ({ updated_at: now, ...a }));

  await insert(db, 'auth.accounts', uniformAccounts);
  await insert(db, 'core.departments', departments);
  await insert(db, 'core.clinics', clinics);
  await insert(db, 'core.staff_clinics', staffClinics);
  await insert(db, 'core.slots', slots);
  await insert(db, 'core.appointments', uniformAppointments);
  await insert(db, 'core.visit_note_versions', notes);

  return {
    departments: departments.length,
    clinics: clinics.length,
    doctors: doctors.length,
    staff: accounts.length - patients.length,
    patients: patients.length,
    slots: slots.length,
    pastVisits,
    upcomingBookings: appointments.length - pastVisits,
    visitNotes: notes.length,
  };
}
