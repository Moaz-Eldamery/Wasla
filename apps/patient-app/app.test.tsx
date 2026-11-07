import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import LoginScreen from './app/(auth)/login';
import SignUpScreen from './app/(auth)/sign-up';
import VerifyCodeScreen from './app/(auth)/verify-code';
import BookScreen from './app/(tabs)/book';
import JourneyScreen from './app/(tabs)/journey';
import QueueScreen from './app/(tabs)/queue';
import ResultsScreen from './app/(tabs)/results';
import Index from './app/index';
import {
  clearSession,
  getSessionToken,
  setPendingVerification,
  setSession,
  type Appointment,
  type Department,
  type Doctor,
  type Journey,
  type PatientResult,
  type QueuePosition,
  type Slot,
  type VisitSummary,
} from './lib/api';
import ar from './translations/ar.json';
import en from './translations/en.json';
import { isRtlLanguage, setAppLanguage } from './translations/i18n';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text testID="redirect-target">{href}</Text>;
  },
  Stack: () => null,
  Tabs: Object.assign(() => null, { Screen: () => null }),
}));

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

/** A fetch response with a JSON body, the shape the app's API client reads. */
const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
});

// Tests live outside app/: expo-router would treat any file in app/ as a screen.
describe('Patient app (KAN-14: sign up, log in and book)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    mockPush.mockClear();
    mockReplace.mockClear();
    clearSession();
    setPendingVerification(null, null);
    await setAppLanguage('en');
    globalThis.fetch = jest.fn();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('keeps identical translation keys in English and Arabic', () => {
    const collectKeys = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k;
        return v && typeof v === 'object' && !Array.isArray(v)
          ? collectKeys(v as Record<string, unknown>, key)
          : [key];
      });

    expect(collectKeys(ar).sort()).toEqual(collectKeys(en).sort());
  });

  it('redirects Index to login when logged out and to book when logged in', async () => {
    const first = await render(<Index />);
    expect((await screen.findByTestId('redirect-target')).props.children).toBe('/(auth)/login');
    await first.unmount();

    setSession('session-token-1', {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'PATIENT',
      name: 'Salma Hassan',
      phone: '+201000000006',
      roles: [],
    });

    await render(<Index />);
    expect((await screen.findByTestId('redirect-target')).props.children).toBe('/(tabs)/book');
  });

  it(
    'signs up a patient, displays the simulated SMS code, and verifies the phone',
    async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            expiresAt: '2026-11-06T09:00:00Z',
            simulatedCode: '654321',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

    const signUp = await render(<SignUpScreen />);
    const nameInput = await screen.findByPlaceholderText('Enter your full name');
    await fireEvent.changeText(nameInput, 'Salma Hassan');
    await fireEvent.changeText(
      await screen.findByPlaceholderText('+201000000006'),
      '+201012345678',
    );
    await fireEvent.changeText(
      await screen.findByPlaceholderText('At least 8 characters'),
      'password123',
    );
    await fireEvent.press(await screen.findByText('Sign up'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/(auth)/verify-code');
    });
    await signUp.unmount();

    await render(<VerifyCodeScreen />);
    expect(await screen.findByText('Simulated SMS code: 654321')).toBeTruthy();
    expect((await screen.findByPlaceholderText('123456')).props.value).toBe('654321');

    await fireEvent.press(await screen.findByText('Verify Phone'));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
    },
    15_000,
  );

  it('logs in a patient and stores the session token', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          token: 'live-token-abc',
          expiresAt: '2026-11-13T09:00:00Z',
          user: {
            id: '11111111-1111-1111-1111-111111111111',
            type: 'PATIENT',
            name: 'Salma Hassan',
            phone: '+201000000006',
            roles: [],
          },
        }),
    });

    await render(<LoginScreen />);
    await fireEvent.changeText(
      await screen.findByPlaceholderText('+201000000006'),
      '+201000000006',
    );
    await fireEvent.changeText(
      await screen.findByPlaceholderText('At least 8 characters'),
      'demo-password',
    );
    await fireEvent.press((await screen.findAllByText('Log in'))[0]);

    await waitFor(() => {
      expect(getSessionToken()).toBe('live-token-abc');
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/book');
    });
  });

  it('browses departments -> doctors -> free slots, books a slot, sees appointments, and logs out', async () => {
    setSession('live-token-abc', {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'PATIENT',
      name: 'Salma Hassan',
      phone: '+201000000006',
      roles: [],
    });

    const clinic = {
      id: '22222222-2222-2222-2222-222222222222',
      departmentId: '33333333-3333-3333-3333-333333333333',
      name: { ar: 'عيادة الباطنة ١', en: 'Internal Medicine Clinic 1' },
      building: 'A',
      floor: '2',
      directions: { ar: 'المبنى أ، الدور الثاني', en: 'Building A, 2nd floor' },
    };

    const departments: Department[] = [
      {
        id: clinic.departmentId,
        kind: 'CLINICAL',
        name: { ar: 'الباطنة', en: 'Internal Medicine' },
        clinics: [clinic],
      },
    ];

    const doctors: Doctor[] = [
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Dr. Kareem Adel',
        clinics: [clinic],
      },
    ];

    const slots: Slot[] = [
      {
        id: '55555555-5555-5555-5555-555555555555',
        doctorId: doctors[0].id,
        clinic,
        startsAt: '2026-11-07T08:00:00Z',
        endsAt: '2026-11-07T08:15:00Z',
      },
    ];

    const bookedAppointment: Appointment = {
      id: '66666666-6666-6666-6666-666666666666',
      status: 'BOOKED',
      startsAt: slots[0].startsAt,
      endsAt: slots[0].endsAt,
      bookedAt: '2026-11-06T08:00:00Z',
      patient: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Salma Hassan',
      },
      doctor: {
        id: doctors[0].id,
        name: doctors[0].name,
      },
      clinic,
    };

    (globalThis.fetch as jest.Mock)
      // initial loadDepartments
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(departments),
      })
      // initial loadAppointments(upcoming)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([]),
      })
      // listDepartmentDoctors
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(doctors),
      })
      // listDoctorFreeSlots
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(slots),
      })
      // bookAppointment
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify(bookedAppointment),
      })
      // refresh free slots after booking
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([]),
      })
      // refresh upcoming appointments after booking
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([bookedAppointment]),
      })
      // logout
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });

    await render(<BookScreen />);

    // Select department
    const deptText = await screen.findByText('Internal Medicine');
    expect(deptText).toBeTruthy();
    await fireEvent.press(deptText);

    // Select doctor
    const docText = await screen.findByText('Dr. Kareem Adel');
    expect(docText).toBeTruthy();
    await fireEvent.press(docText);

    // Book free slot
    const bookBtn = await screen.findByText('Book Slot');
    await fireEvent.press(bookBtn);

    // Verify booking success and appointment card
    expect(await screen.findByText('Appointment booked successfully!')).toBeTruthy();
    expect(await screen.findByText('Booked')).toBeTruthy();

    // Switch to Arabic and verify RTL & Arabic text
    await act(async () => {
      await setAppLanguage('ar');
    });
    expect(isRtlLanguage()).toBe(true);
    expect(await screen.findByText('الباطنة')).toBeTruthy();

    // Log out
    await fireEvent.press(await screen.findByText('تسجيل الخروج'));
    await waitFor(() => {
      expect(getSessionToken()).toBeNull();
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('shows how many people are ahead in the queue and updates on refresh', async () => {
    setSession('live-token-abc', {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'PATIENT',
      name: 'Salma Hassan',
      phone: '+201000000006',
      roles: [],
    });

    const clinic = {
      id: '22222222-2222-2222-2222-222222222222',
      departmentId: '33333333-3333-3333-3333-333333333333',
      name: { ar: 'عيادة الباطنة ١', en: 'Internal Medicine Clinic 1' },
      building: 'A',
      floor: '2',
      directions: { ar: 'المبنى أ، الدور الثاني', en: 'Building A, 2nd floor' },
    };

    const checkedInAppointment: Appointment = {
      id: '77777777-7777-7777-7777-777777777777',
      status: 'CHECKED_IN',
      startsAt: '2026-11-06T09:00:00Z',
      endsAt: '2026-11-06T09:15:00Z',
      bookedAt: '2026-11-05T10:00:00Z',
      checkedInAt: '2026-11-06T08:50:00Z',
      patient: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Salma Hassan',
      },
      doctor: {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Dr. Kareem Adel',
      },
      clinic,
    };

    const initialPosition: QueuePosition = {
      appointmentId: checkedInAppointment.id,
      status: 'CHECKED_IN',
      peopleAhead: 3,
    };

    const refreshedPosition: QueuePosition = {
      appointmentId: checkedInAppointment.id,
      status: 'CHECKED_IN',
      peopleAhead: 0,
    };

    (globalThis.fetch as jest.Mock)
      // initial listMyAppointments('upcoming')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([checkedInAppointment]),
      })
      // initial getQueuePosition
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(initialPosition),
      })
      // refresh listMyAppointments('upcoming')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([checkedInAppointment]),
      })
      // refresh getQueuePosition
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(refreshedPosition),
      });

    await render(<QueueScreen />);

    expect((await screen.findByTestId('people-ahead-count')).props.children).toBe(3);

    // Trigger refresh
    await fireEvent.press(await screen.findByTestId('queue-refresh-button'));
    await waitFor(async () => {
      expect((await screen.findByTestId('people-ahead-count')).props.children).toBe(0);
    });
    expect(await screen.findByText('You are next in line!')).toBeTruthy();
  });

  it('shows the patient journey stage, next step, and where to go in English and Arabic with refresh', async () => {
    setSession('live-token-abc', {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'PATIENT',
      name: 'Salma Hassan',
      phone: '+201000000006',
      roles: [],
    });

    const clinic = {
      id: '22222222-2222-2222-2222-222222222222',
      departmentId: '33333333-3333-3333-3333-333333333333',
      name: { ar: 'عيادة الباطنة ٣', en: 'Clinic 3' },
      building: 'A',
      floor: '2',
      directions: { ar: 'الدور الثاني، يمين المصعد', en: '2nd floor, right of the lift' },
    };

    const labClinic = {
      id: '88888888-8888-8888-8888-888888888888',
      departmentId: '99999999-9999-9999-9999-999999999999',
      name: { ar: 'المعمل الرئيسي', en: 'Main Laboratory' },
      building: 'B',
      floor: 'Ground',
      directions: { ar: 'المبنى ب، الدور الأرضي', en: 'Building B, ground floor' },
    };

    const appointment: Appointment = {
      id: '77777777-7777-7777-7777-777777777777',
      status: 'CHECKED_IN',
      startsAt: '2026-11-06T09:00:00Z',
      endsAt: '2026-11-06T09:15:00Z',
      bookedAt: '2026-11-05T10:00:00Z',
      checkedInAt: '2026-11-06T08:50:00Z',
      patient: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Salma Hassan',
      },
      doctor: {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'Dr. Kareem Adel',
      },
      clinic,
    };

    const checkedInJourney: Journey = {
      appointmentId: appointment.id,
      stage: 'CHECKED_IN',
      title: { ar: 'تم تسجيل الحضور', en: 'Checked in' },
      nextStep: {
        ar: 'انتظر في منطقة الانتظار حتى ينادي الطبيب اسمك',
        en: 'Wait at the clinic waiting area until the doctor calls you',
      },
      location: clinic,
    };

    const testOrderedJourney: Journey = {
      appointmentId: appointment.id,
      stage: 'TEST_ORDERED',
      title: { ar: 'تم طلب فحص', en: 'Test ordered' },
      nextStep: {
        ar: 'توجه إلى عيادة الفحص لإجراء الفحص المطلوب',
        en: 'Go to the test clinic to complete the ordered test',
      },
      location: labClinic,
    };

    (globalThis.fetch as jest.Mock)
      // initial listMyAppointments('upcoming')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([appointment]),
      })
      // initial getAppointmentJourney
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(checkedInJourney),
      })
      // refresh listMyAppointments('upcoming')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([appointment]),
      })
      // refresh getAppointmentJourney
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(testOrderedJourney),
      });

    await render(<JourneyScreen />);

    expect((await screen.findByTestId('journey-stage-title')).props.children).toBe('Checked in');
    expect((await screen.findByTestId('journey-next-step')).props.children).toBe(
      'Wait at the clinic waiting area until the doctor calls you',
    );
    expect((await screen.findByTestId('journey-location-name')).props.children).toBe('Clinic 3');

    // Refresh updates stage to TEST_ORDERED and location to Building B Lab
    await fireEvent.press(await screen.findByTestId('journey-refresh-button'));
    await waitFor(async () => {
      expect((await screen.findByTestId('journey-stage-title')).props.children).toBe(
        'Test ordered',
      );
    });
    expect((await screen.findByTestId('journey-location-name')).props.children).toBe(
      'Main Laboratory',
    );

    // Switch to Arabic and verify RTL journey text
    await act(async () => {
      await setAppLanguage('ar');
    });
    expect((await screen.findByTestId('journey-stage-title')).props.children).toBe('تم طلب فحص');
    expect((await screen.findByTestId('journey-location-name')).props.children).toBe(
      'المعمل الرئيسي',
    );
  });

  describe('results and visit summary (KAN-16)', () => {
    const patient = {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'PATIENT' as const,
      name: 'Salma Hassan',
      phone: '+201000000006',
      roles: [],
    };

    const clinic = {
      id: '22222222-2222-2222-2222-222222222222',
      departmentId: '33333333-3333-3333-3333-333333333333',
      name: { ar: 'عيادة الباطنة ١', en: 'Internal Medicine Clinic 1' },
      building: 'A',
      floor: '2',
      directions: { ar: 'المبنى أ، الدور الثاني', en: 'Building A, 2nd floor' },
    };

    const pendingResult: PatientResult = {
      testId: 'aaaa1111-1111-1111-1111-111111111111',
      appointmentId: '77777777-7777-7777-7777-777777777777',
      testName: 'Chest X-Ray',
      orderedAt: '2026-11-06T09:10:00Z',
      status: 'WAITING_FOR_REVIEW',
      releasedAt: null,
      file: null,
    };

    const releasedResult: PatientResult = {
      testId: 'bbbb2222-2222-2222-2222-222222222222',
      appointmentId: '77777777-7777-7777-7777-777777777777',
      testName: 'Complete Blood Count (CBC)',
      orderedAt: '2026-11-06T09:05:00Z',
      status: 'RELEASED',
      releasedAt: '2026-11-06T11:30:00Z',
      file: {
        fileName: 'cbc-report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 24576,
        uploadedAt: '2026-11-06T11:00:00Z',
      },
    };

    const completedVisit = (id: string, doctorName: string, startsAt: string): Appointment => ({
      id,
      status: 'COMPLETED',
      startsAt,
      endsAt: startsAt,
      bookedAt: '2026-11-01T10:00:00Z',
      checkedInAt: startsAt,
      startedAt: startsAt,
      completedAt: startsAt,
      patient: { id: patient.id, name: patient.name },
      doctor: { id: '44444444-4444-4444-4444-444444444444', name: doctorName },
      clinic,
    });

    const visitA = completedVisit(
      '77777777-7777-7777-7777-777777777777',
      'Dr. Kareem Adel',
      '2026-11-06T09:00:00Z',
    );
    const visitB = completedVisit(
      '88888888-8888-8888-8888-888888888888',
      'Dr. Mona Fathy',
      '2026-10-20T09:00:00Z',
    );

    const summaryFor = (visit: Appointment, text: string): VisitSummary => ({
      appointmentId: visit.id,
      doctorName: visit.doctor.name,
      completedAt: visit.completedAt ?? visit.startsAt,
      summary: text,
    });

    // Real PDF bytes are not valid UTF-8; the app must save them untouched, not decode them.
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0xfe, 0x00, 0x9c]);
    const fileResponse = (bytes: Uint8Array, contentType: string) => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
      arrayBuffer: async () => bytes.slice().buffer,
      text: async () => '',
    });

    beforeEach(() => {
      setSession('live-token-abc', patient);
      (Sharing.shareAsync as jest.Mock).mockClear();
    });

    it('shows waiting and released results, opens and shares the real file, and shows the summary', async () => {
      const previewSpy = jest.spyOn(File.prototype, 'preview');
      const summary = summaryFor(
        visitA,
        'Continue iron supplement once daily for 4 weeks and drink plenty of water.',
      );

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce(jsonResponse([pendingResult, releasedResult])) // listMyResults
        .mockResolvedValueOnce(jsonResponse([visitA])) // listMyAppointments('past')
        .mockResolvedValueOnce(jsonResponse(summary)) // getVisitSummary
        .mockResolvedValueOnce(fileResponse(pdfBytes, 'application/pdf')); // downloadTestResult

      await render(<ResultsScreen />);

      // Unreleased: "Waiting for review", nothing to open or share
      expect(await screen.findByText('Chest X-Ray')).toBeTruthy();
      expect(await screen.findByText('Waiting for review')).toBeTruthy();
      expect(screen.queryByTestId(`download-result-${pendingResult.testId}`)).toBeNull();
      expect(screen.queryByTestId(`share-result-${pendingResult.testId}`)).toBeNull();

      // Released: open saves the exact bytes privately and hands them to the system viewer
      expect(await screen.findByText('Released')).toBeTruthy();
      await fireEvent.press(await screen.findByTestId(`download-result-${releasedResult.testId}`));
      expect(await screen.findByText('Saved cbc-report.pdf on this phone')).toBeTruthy();

      const fetchMock = globalThis.fetch as jest.Mock;
      const [url, init] = fetchMock.mock.calls[3];
      expect(url).toMatch(new RegExp(`/tests/${releasedResult.testId}/result/file$`));
      expect(init.headers.Authorization).toBe('Bearer live-token-abc');

      expect(previewSpy).toHaveBeenCalledWith({
        title: releasedResult.testName,
        mimeType: 'application/pdf',
      });
      const saved = previewSpy.mock.contexts[0] as File;
      expect(saved.uri).toMatch(new RegExp(`results/${releasedResult.testId}\\.pdf$`));
      expect(Array.from(saved.bytesSync())).toEqual(Array.from(pdfBytes));

      // Share reuses the saved file (no second download) and sends the file, not text
      await fireEvent.press(screen.getByTestId(`share-result-${releasedResult.testId}`));
      await waitFor(() =>
        expect(Sharing.shareAsync).toHaveBeenCalledWith(saved.uri, {
          mimeType: 'application/pdf',
          dialogTitle: releasedResult.testName,
        }),
      );
      expect(fetchMock).toHaveBeenCalledTimes(4);

      // Completed visit summary
      expect((await screen.findByTestId('visit-summary-text')).props.children).toBe(
        summary.summary,
      );

      // Arabic (RTL)
      await act(async () => {
        await setAppLanguage('ar');
      });
      expect(await screen.findByText('بانتظار مراجعة الطبيب')).toBeTruthy();
      expect(await screen.findByText('متاحة')).toBeTruthy();
      expect(await screen.findByText('ملخص الزيارة')).toBeTruthy();

      // Ending the session deletes the saved result from the phone
      await act(async () => {
        clearSession();
      });
      expect(new File(saved.uri).exists).toBe(false);
      previewSpy.mockRestore();
    });

    it('says when a summary is not ready yet and shows an error when a download is refused', async () => {
      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce(jsonResponse([releasedResult]))
        .mockResolvedValueOnce(jsonResponse([visitA]))
        .mockResolvedValueOnce(
          jsonResponse(
            { error: { code: 'NOT_YET_AVAILABLE', message: 'No summary yet' } },
            409,
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404),
        );

      await render(<ResultsScreen />);

      expect(await screen.findByTestId('summary-not-available-text')).toBeTruthy();
      expect(screen.queryByTestId('results-error')).toBeNull();

      await fireEvent.press(await screen.findByTestId(`download-result-${releasedResult.testId}`));
      expect(await screen.findByTestId('results-error')).toBeTruthy();
      expect(screen.queryByTestId(`downloaded-result-${releasedResult.testId}`)).toBeNull();
    });

    it('shows the summary of the visit picked last, even if an earlier request answers later', async () => {
      let answerFirst: (value: unknown) => void = () => undefined;
      const firstSummary = new Promise((resolve) => {
        answerFirst = resolve;
      });

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse([visitA, visitB]))
        .mockResolvedValueOnce(jsonResponse(summaryFor(visitA, 'Summary A')))
        .mockReturnValueOnce(firstSummary) // visit B, slow
        .mockResolvedValueOnce(jsonResponse(summaryFor(visitA, 'Summary A again'))); // visit A

      await render(<ResultsScreen />);
      expect((await screen.findByTestId('visit-summary-text')).props.children).toBe('Summary A');

      await fireEvent.press(screen.getByTestId(`summary-visit-${visitB.id}`));
      await fireEvent.press(screen.getByTestId(`summary-visit-${visitA.id}`));
      expect((await screen.findByTestId('visit-summary-text')).props.children).toBe(
        'Summary A again',
      );

      await act(async () => {
        answerFirst(jsonResponse(summaryFor(visitB, 'Summary B')));
      });
      expect(screen.getByTestId('visit-summary-text').props.children).toBe('Summary A again');
    });
  });

  it('falls back to all days when the chosen day runs out of free slots', async () => {
    setSession('live-token-abc', {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'PATIENT',
      name: 'Salma Hassan',
      phone: '+201000000006',
      roles: [],
    });
    const clinic = {
      id: '22222222-2222-2222-2222-222222222222',
      departmentId: '33333333-3333-3333-3333-333333333333',
      name: { ar: 'عيادة الباطنة ١', en: 'Internal Medicine Clinic 1' },
      building: 'A',
      floor: '2',
      directions: { ar: 'المبنى أ، الدور الثاني', en: 'Building A, 2nd floor' },
    };
    const doctor: Doctor = {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Dr. Kareem Adel',
      clinics: [clinic],
    };
    const slot = (id: string, startsAt: string): Slot => ({
      id,
      doctorId: doctor.id,
      clinic,
      startsAt,
      endsAt: startsAt,
    });
    // 10:00 Cairo on three different days
    const day1 = slot('55555555-0000-0000-0000-000000000001', '2026-11-08T08:00:00Z');
    const day2 = slot('55555555-0000-0000-0000-000000000002', '2026-11-09T08:00:00Z');
    const day3 = slot('55555555-0000-0000-0000-000000000003', '2026-11-10T08:00:00Z');

    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse([
          { id: clinic.departmentId, kind: 'CLINICAL', name: { ar: 'الباطنة', en: 'Internal Medicine' }, clinics: [clinic] },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([])) // upcoming appointments
      .mockResolvedValueOnce(jsonResponse([doctor]))
      .mockResolvedValueOnce(jsonResponse([day1, day2, day3]))
      .mockResolvedValueOnce(jsonResponse({}, 201)) // book day 2
      .mockResolvedValueOnce(jsonResponse([day1, day3])) // slots after booking
      .mockResolvedValueOnce(jsonResponse([])); // upcoming appointments after booking

    await render(<BookScreen />);
    await fireEvent.press(await screen.findByText('Internal Medicine'));
    await fireEvent.press(await screen.findByText('Dr. Kareem Adel'));

    await fireEvent.press(await screen.findByTestId('slot-day-2026-11-09'));
    expect(screen.queryByTestId(`slot-item-${day1.id}`)).toBeNull();
    await fireEvent.press(screen.getByTestId(`book-slot-${day2.id}`));

    expect(await screen.findByText('Appointment booked successfully!')).toBeTruthy();
    expect(await screen.findByTestId(`slot-item-${day1.id}`)).toBeTruthy();
    expect(screen.getByTestId(`slot-item-${day3.id}`)).toBeTruthy();
    expect(screen.queryByTestId('slot-day-2026-11-09')).toBeNull();
  });
});
