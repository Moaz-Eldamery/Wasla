import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import LoginScreen from './app/(auth)/login';
import SignUpScreen from './app/(auth)/sign-up';
import VerifyCodeScreen from './app/(auth)/verify-code';
import BookScreen from './app/(tabs)/book';
import JourneyScreen from './app/(tabs)/journey';
import QueueScreen from './app/(tabs)/queue';
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
  type QueuePosition,
  type Slot,
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
      email: null,
      roles: [],
    });

    await render(<Index />);
    expect((await screen.findByTestId('redirect-target')).props.children).toBe('/(tabs)/book');
  });

  it('signs up a patient, displays the simulated SMS code, and verifies the phone', async () => {
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
  });

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
            email: null,
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
      email: null,
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
      email: null,
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
      email: null,
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
});

