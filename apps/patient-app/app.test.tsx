import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import LoginScreen from './app/(auth)/login';
import SignUpScreen from './app/(auth)/sign-up';
import VerifyCodeScreen from './app/(auth)/verify-code';
import { Linking } from 'react-native';
import AssistantScreen from './app/(tabs)/assistant';
import BookScreen from './app/(tabs)/book';
import ResultsScreen from './app/(tabs)/results';
import VisitScreen from './app/(tabs)/visit';
import Index from './app/index';
import { VISIT_REFRESH_MS, getVisitSteps } from './components/VisitSteps';
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
  // Every rendered screen counts as focused in tests.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(effect, [effect]);
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

const patientUser = {
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

const labClinic = {
  id: '88888888-8888-8888-8888-888888888888',
  departmentId: '99999999-9999-9999-9999-999999999999',
  name: { ar: 'المعمل الرئيسي', en: 'Main Laboratory' },
  building: 'B',
  floor: 'Ground',
  directions: { ar: 'المبنى ب، الدور الأرضي', en: 'Building B, ground floor' },
};

const department = (id: string, en: string, ar: string): Department => ({
  id,
  kind: 'CLINICAL',
  name: { ar, en },
  clinics: [clinic],
});

const doctorNamed = (id: string, name: string): Doctor => ({ id, name, clinics: [clinic] });

const slotAt = (id: string, doctorId: string, startsAt: string): Slot => ({
  id,
  doctorId,
  clinic,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 15 * 60_000).toISOString(),
});

const appointmentWith = (
  id: string,
  status: Appointment['status'],
  startsAt: string,
  doctorName = 'Dr. Kareem Adel',
): Appointment => ({
  id,
  status,
  startsAt,
  endsAt: startsAt,
  bookedAt: '2026-11-01T10:00:00Z',
  patient: { id: patientUser.id, name: patientUser.name },
  doctor: { id: '44444444-4444-4444-4444-444444444444', name: doctorName },
  clinic,
});

const journeyAt = (
  appointmentId: string,
  stage: Journey['stage'],
  nextStepEn: string,
  location: Journey['location'] = clinic,
): Journey => ({
  appointmentId,
  stage,
  title: { ar: stage, en: stage },
  nextStep: { ar: `ع: ${nextStepEn}`, en: nextStepEn },
  location,
});

/**
 * Answers each request by its method and path, so screens that make several
 * calls at once don't depend on the order they go out in. Change `routes`
 * during a test to change what the server says next.
 */
const routeFetch = (routes: Record<string, unknown>) => {
  (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init?: { method?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    if (!(key in routes)) throw new Error(`Unexpected request: ${key}`);
    const body = routes[key];
    return typeof body === 'function' ? (body as () => unknown)() : jsonResponse(body);
  });
};

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

  describe('booking with dropdowns', () => {
    beforeEach(() => {
      setSession('live-token-abc', patientUser);
    });

    it('picks the only department, doctor, day and time for the patient, books, and links to My Visit', async () => {
      const doctor = doctorNamed('44444444-4444-4444-4444-444444444444', 'Dr. Kareem Adel');
      const slot = slotAt('55555555-5555-5555-5555-555555555555', doctor.id, '2026-11-08T08:00:00Z');

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce(
          jsonResponse([department(clinic.departmentId, 'Internal Medicine', 'الباطنة')]),
        )
        .mockResolvedValueOnce(jsonResponse([doctor]))
        .mockResolvedValueOnce(jsonResponse([slot]))
        .mockResolvedValueOnce(jsonResponse(appointmentWith('66666666-6666-6666-6666-666666666666', 'BOOKED', slot.startsAt), 201))
        .mockResolvedValueOnce(jsonResponse([])) // free slots after booking
        .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' }); // logout

      await render(<BookScreen />);

      // One choice each: all four fields fill themselves in
      expect(await screen.findByText('Internal Medicine')).toBeTruthy();
      expect(await screen.findByText('Dr. Kareem Adel')).toBeTruthy();
      expect(await screen.findByText('Sun, Nov 8')).toBeTruthy();
      expect(await screen.findByTestId('selected-slot-info')).toBeTruthy();
      expect(screen.getByText('Hello, Salma Hassan')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('book-button'));
      expect(await screen.findByText('Your appointment is booked.')).toBeTruthy();
      const [bookUrl, bookInit] = (globalThis.fetch as jest.Mock).mock.calls[3];
      expect(bookUrl).toMatch(/\/appointments$/);
      expect(JSON.parse(bookInit.body)).toEqual({ slotId: slot.id });

      // The doctor has no free times left
      expect(await screen.findByTestId('day-dropdown-empty')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('booking-see-visit'));
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/visit');

      // Arabic (RTL), then log out from the shared header
      await act(async () => {
        await setAppLanguage('ar');
      });
      expect(isRtlLanguage()).toBe(true);
      expect(await screen.findByText('الباطنة')).toBeTruthy();
      expect(screen.getByText('احجز زيارة')).toBeTruthy();

      await fireEvent.press(await screen.findByText('تسجيل الخروج'));
      await waitFor(() => {
        expect(getSessionToken()).toBeNull();
        expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
      });
    });

    it('chooses department, doctor, day and time from dropdowns, and resets the day once it is fully booked', async () => {
      const cardiology = department('33333333-0000-0000-0000-000000000002', 'Cardiology', 'القلب');
      const internal = department(clinic.departmentId, 'Internal Medicine', 'الباطنة');
      const kareem = doctorNamed('44444444-0000-0000-0000-000000000001', 'Dr. Kareem Adel');
      const mona = doctorNamed('44444444-0000-0000-0000-000000000002', 'Dr. Mona Fathy');
      // 10:00 Cairo on three different days, plus 10:30 on the second
      const day1 = slotAt('55555555-0000-0000-0000-000000000001', mona.id, '2026-11-08T08:00:00Z');
      const day2 = slotAt('55555555-0000-0000-0000-000000000002', mona.id, '2026-11-09T08:00:00Z');
      const day2b = slotAt('55555555-0000-0000-0000-000000000004', mona.id, '2026-11-09T08:30:00Z');
      const day3 = slotAt('55555555-0000-0000-0000-000000000003', mona.id, '2026-11-10T08:00:00Z');

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce(jsonResponse([cardiology, internal]))
        .mockResolvedValueOnce(jsonResponse([kareem, mona]))
        .mockResolvedValueOnce(jsonResponse([day1, day2, day2b, day3]))
        .mockResolvedValueOnce(jsonResponse({}, 201)) // book day 2, 10:30
        .mockResolvedValueOnce(jsonResponse([day1, day2, day3])); // free slots after booking

      await render(<BookScreen />);

      // Nothing below the department can be opened yet
      expect((await screen.findByTestId('doctor-dropdown')).props.accessibilityState.disabled).toBe(true);
      expect(screen.getByTestId('book-button').props.accessibilityState.disabled).toBe(true);

      await fireEvent.press(await screen.findByTestId('department-dropdown'));
      await fireEvent.press(screen.getByTestId(`department-dropdown-option-${internal.id}`));

      await fireEvent.press(await screen.findByTestId('doctor-dropdown'));
      await fireEvent.press(await screen.findByTestId(`doctor-dropdown-option-${mona.id}`));

      await fireEvent.press(await screen.findByTestId('day-dropdown'));
      await fireEvent.press(await screen.findByTestId('day-dropdown-option-2026-11-09'));

      // Only the chosen day's times are offered
      await fireEvent.press(screen.getByTestId('time-dropdown'));
      expect(screen.queryByTestId(`time-dropdown-option-${day1.id}`)).toBeNull();
      expect(screen.getByTestId(`time-dropdown-option-${day2.id}`)).toBeTruthy();
      await fireEvent.press(screen.getByTestId(`time-dropdown-option-${day2b.id}`));

      await fireEvent.press(screen.getByTestId('book-button'));
      expect(await screen.findByText('Your appointment is booked.')).toBeTruthy();
      expect(JSON.parse((globalThis.fetch as jest.Mock).mock.calls[3][1].body)).toEqual({
        slotId: day2b.id,
      });

      // The form starts over at the day; the doctor keeps their remaining days
      await waitFor(() => expect(screen.getByText('Choose a day')).toBeTruthy());
      expect(screen.getByTestId('time-dropdown').props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(screen.getByTestId('day-dropdown'));
      expect(screen.getByTestId('day-dropdown-option-2026-11-09')).toBeTruthy();
    });

    it('says when someone else took the time and reloads the free times', async () => {
      const doctor = doctorNamed('44444444-4444-4444-4444-444444444444', 'Dr. Kareem Adel');
      const taken = slotAt('55555555-0000-0000-0000-000000000001', doctor.id, '2026-11-08T08:00:00Z');
      const other = slotAt('55555555-0000-0000-0000-000000000002', doctor.id, '2026-11-08T09:00:00Z');

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce(jsonResponse([department(clinic.departmentId, 'Internal Medicine', 'الباطنة')]))
        .mockResolvedValueOnce(jsonResponse([doctor]))
        .mockResolvedValueOnce(jsonResponse([taken, other]))
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'SLOT_TAKEN', message: 'Taken' } }, 409),
        )
        .mockResolvedValueOnce(jsonResponse([other]));

      await render(<BookScreen />);
      await fireEvent.press(await screen.findByTestId('time-dropdown'));
      await fireEvent.press(screen.getByTestId(`time-dropdown-option-${taken.id}`));
      await fireEvent.press(screen.getByTestId('book-button'));

      expect(
        await screen.findByText('This slot was just booked by someone else. Please pick another slot.'),
      ).toBeTruthy();
      expect(screen.queryByTestId('booking-success')).toBeNull();
      // Only one time left, so it is chosen again for the patient
      await waitFor(() => expect(screen.getByTestId('selected-slot-info')).toBeTruthy());
    });
  });

  describe('My Visit steps', () => {
    const appointmentId = '77777777-7777-7777-7777-777777777777';

    beforeEach(() => {
      setSession('live-token-abc', patientUser);
    });

    it('maps every backend stage onto the five steps, moving forward only', () => {
      const states = (stage: Journey['stage'], hasTests: boolean) =>
        getVisitSteps(stage, hasTests).steps.map((s) => s.state);

      expect(states('BOOKED', false)).toEqual(['current', 'upcoming', 'upcoming', 'optional', 'upcoming']);
      expect(states('CHECKED_IN', false)).toEqual(['done', 'current', 'upcoming', 'optional', 'upcoming']);
      expect(states('WITH_DOCTOR', false)).toEqual(['done', 'done', 'current', 'optional', 'upcoming']);
      expect(states('TEST_ORDERED', true)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
      // Back with the doctor after the lab stays on step 4
      expect(states('WITH_DOCTOR', true)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
      expect(states('RESULT_READY', true)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
      expect(getVisitSteps('TEST_ORDERED', true).testsPhase).toBe('atLab');
      expect(getVisitSteps('RESULT_READY', true).testsPhase).toBe('backToDoctor');
      expect(getVisitSteps('WITH_DOCTOR', true).testsPhase).toBe('backToDoctor');
      // Finished: the tests step is skipped when there were none
      expect(states('DONE', false)).toEqual(['done', 'done', 'done', 'skipped', 'done']);
      expect(states('DONE', true)).toEqual(['done', 'done', 'done', 'done', 'done']);
    });

    it('shows the checked-in step with people ahead and where to go, and refreshes every 30 seconds', async () => {
      jest.useFakeTimers();
      try {
        const visit = appointmentWith(appointmentId, 'CHECKED_IN', '2026-11-08T09:00:00Z');
        const routes: Record<string, unknown> = {
          'GET /me/appointments?when=upcoming': [visit],
          'GET /me/appointments?when=past': [],
          [`GET /appointments/${appointmentId}/journey`]: journeyAt(
            appointmentId,
            'CHECKED_IN',
            'Wait at the clinic waiting area until the doctor calls you',
          ),
          'GET /me/results': [],
          [`GET /appointments/${appointmentId}/queue-position`]: {
            appointmentId,
            status: 'CHECKED_IN',
            peopleAhead: 3,
          },
        };
        routeFetch(routes);

        await render(<VisitScreen />);

        expect((await screen.findByTestId('people-ahead-count')).props.children).toBe(3);
        expect(screen.getByTestId('visit-step-booked-done')).toBeTruthy();
        expect(screen.getByTestId('visit-step-checkedIn-current')).toBeTruthy();
        expect(screen.getByTestId('visit-step-tests-optional')).toBeTruthy();
        expect(screen.getByText('Only if your doctor orders tests')).toBeTruthy();
        expect(screen.getByTestId('visit-next-step').props.children).toBe(
          'Wait at the clinic waiting area until the doctor calls you',
        );
        expect(screen.getByTestId('visit-location-name').props.children).toBe(
          'Internal Medicine Clinic 1',
        );
        // A single visit needs no visit picker
        expect(screen.queryByTestId('visit-dropdown')).toBeNull();

        // 30 seconds later, without the patient doing anything
        routes[`GET /appointments/${appointmentId}/queue-position`] = {
          appointmentId,
          status: 'CHECKED_IN',
          peopleAhead: 0,
        };
        await act(async () => {
          jest.advanceTimersByTime(VISIT_REFRESH_MS);
        });
        await waitFor(() =>
          expect(screen.getByTestId('people-ahead-count').props.children).toBe(0),
        );
        expect(screen.getByText('You are next!')).toBeTruthy();

        // Called in, then sent to the lab
        routes[`GET /appointments/${appointmentId}/journey`] = journeyAt(
          appointmentId,
          'TEST_ORDERED',
          'Go to the lab for your blood test',
          labClinic,
        );
        routes['GET /me/results'] = [
          {
            testId: 'aaaa1111-1111-1111-1111-111111111111',
            appointmentId,
            testName: 'CBC',
            orderedAt: '2026-11-08T09:20:00Z',
            status: 'WAITING_FOR_REVIEW',
          },
        ];
        await act(async () => {
          jest.advanceTimersByTime(VISIT_REFRESH_MS);
        });
        await waitFor(() => expect(screen.getByTestId('visit-step-tests-current')).toBeTruthy());
        expect(screen.getByTestId('visit-tests-phase').props.children).toBe(
          'Go to the lab for your tests',
        );
        expect(screen.getByTestId('visit-location-name').props.children).toBe('Main Laboratory');
        expect(screen.queryByTestId('people-ahead-count')).toBeNull();

        // Arabic (RTL)
        await act(async () => {
          await setAppLanguage('ar');
        });
        expect(screen.getByTestId('visit-location-name').props.children).toBe('المعمل الرئيسي');
        expect(screen.getByText('التحاليل والأشعة')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it("keeps today's completed visit while the lab step is left, and moves on to the return trip", async () => {
      const labVisit = appointmentWith(appointmentId, 'COMPLETED', new Date().toISOString());
      const doneVisit = appointmentWith(
        '77777777-0000-0000-0000-000000000002',
        'COMPLETED',
        new Date().toISOString(),
        'Dr. Mona Fathy',
      );
      const nextWeek = appointmentWith(
        '77777777-0000-0000-0000-000000000003',
        'BOOKED',
        '2026-11-14T09:00:00Z',
      );
      const routes: Record<string, unknown> = {
        'GET /me/appointments?when=upcoming': [nextWeek],
        'GET /me/appointments?when=past': [labVisit, doneVisit],
        [`GET /appointments/${labVisit.id}/journey`]: journeyAt(
          labVisit.id,
          'TEST_ORDERED',
          'Go to the lab',
          labClinic,
        ),
        [`GET /appointments/${doneVisit.id}/journey`]: journeyAt(doneVisit.id, 'DONE', 'Nothing left', null),
        [`GET /appointments/${nextWeek.id}/journey`]: journeyAt(nextWeek.id, 'BOOKED', 'Come on the day'),
        'GET /me/results': [
          {
            testId: 'aaaa1111-1111-1111-1111-111111111111',
            appointmentId: labVisit.id,
            testName: 'CBC',
            orderedAt: labVisit.startsAt,
            status: 'WAITING_FOR_REVIEW',
          },
        ],
      };
      routeFetch(routes);

      await render(<VisitScreen />);

      // The unfinished visit opens first; the finished one isn't offered
      expect(await screen.findByTestId('visit-step-tests-current')).toBeTruthy();
      expect(screen.getByTestId('visit-location-name').props.children).toBe('Main Laboratory');
      await fireEvent.press(screen.getByTestId('visit-dropdown'));
      expect(screen.getByTestId(`visit-dropdown-option-${labVisit.id}`)).toBeTruthy();
      expect(screen.getByTestId(`visit-dropdown-option-${nextWeek.id}`)).toBeTruthy();
      expect(screen.queryByTestId(`visit-dropdown-option-${doneVisit.id}`)).toBeNull();
      await fireEvent.press(screen.getByTestId('visit-dropdown-close'));

      // Lab done: back to the doctor, still on step 4
      routes[`GET /appointments/${labVisit.id}/journey`] = journeyAt(
        labVisit.id,
        'RESULT_READY',
        'Go back to Dr. Kareem Adel',
      );
      await act(async () => {
        await screen.getByTestId('visit-scroll-view').props.refreshControl.props.onRefresh();
      });
      await waitFor(() =>
        expect(screen.getByTestId('visit-tests-phase').props.children).toBe(
          'Tests done: go back to your doctor',
        ),
      );
      expect(screen.getByTestId('visit-step-doctor-done')).toBeTruthy();
      expect(screen.getByTestId('visit-location-name').props.children).toBe(
        'Internal Medicine Clinic 1',
      );

      // Switching to next week's visit shows it as booked
      await fireEvent.press(screen.getByTestId('visit-dropdown'));
      await fireEvent.press(screen.getByTestId(`visit-dropdown-option-${nextWeek.id}`));
      expect(await screen.findByTestId('visit-step-booked-current')).toBeTruthy();
    });

    it('offers booking when there is no visit to follow', async () => {
      routeFetch({
        'GET /me/appointments?when=upcoming': [],
        'GET /me/appointments?when=past': [],
      });

      await render(<VisitScreen />);
      expect(await screen.findByText('You have no upcoming visits.')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('visit-go-book'));
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/book');
    });
  });

  it('shows the assistant as coming soon, with input off and the emergency number one tap away', async () => {
    setSession('live-token-abc', patientUser);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    await render(<AssistantScreen />);
    expect(await screen.findByTestId('assistant-greeting')).toBeTruthy();
    expect(screen.getByTestId('assistant-input').props.editable).toBe(false);
    expect(screen.getByTestId('assistant-send').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByText('Emergency? Call 123'));
    expect(openURL).toHaveBeenCalledWith('tel:123');
    // Nothing is ever sent to the backend
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await act(async () => {
      await setAppLanguage('ar');
    });
    expect(screen.getByText('حالة طارئة؟ اتصل بـ 123')).toBeTruthy();
    openURL.mockRestore();
  });

  describe('results and visit summary (KAN-16)', () => {
    const patient = {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'PATIENT' as const,
      name: 'Salma Hassan',
      phone: '+201000000006',
      roles: [],
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

      await fireEvent.press(screen.getByTestId('summary-visit'));
      await fireEvent.press(screen.getByTestId(`summary-visit-option-${visitB.id}`));
      await fireEvent.press(screen.getByTestId('summary-visit'));
      await fireEvent.press(screen.getByTestId(`summary-visit-option-${visitA.id}`));
      expect((await screen.findByTestId('visit-summary-text')).props.children).toBe(
        'Summary A again',
      );

      await act(async () => {
        answerFirst(jsonResponse(summaryFor(visitB, 'Summary B')));
      });
      expect(screen.getByTestId('visit-summary-text').props.children).toBe('Summary A again');
    });

    it('lists every past visit and only asks for a summary of a completed one', async () => {
      const cancelled: Appointment = { ...visitB, status: 'CANCELLED' };
      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse([cancelled, visitA]))
        .mockResolvedValueOnce(jsonResponse(summaryFor(visitA, 'Summary A')));

      await render(<ResultsScreen />);
      // The completed visit is picked first
      expect((await screen.findByTestId('visit-summary-text')).props.children).toBe('Summary A');

      await fireEvent.press(screen.getByTestId('summary-visit'));
      await fireEvent.press(screen.getByTestId(`summary-visit-option-${cancelled.id}`));
      expect(await screen.findByTestId('no-summary-text')).toBeTruthy();
      expect(screen.getByTestId('past-visit-status')).toBeTruthy();
      expect(screen.getByText('Cancelled')).toBeTruthy();
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
