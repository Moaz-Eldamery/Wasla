import { StyleSheet, Text, View } from 'react-native';
import type { Journey, JourneyStageCode } from '../lib/api';
import { getAppLanguage, isRtlLanguage, pickLocalized, useTranslation } from '../translations/i18n';

export type StepKey = 'booked' | 'checkedIn' | 'doctor' | 'tests' | 'done';
export type StepState = 'done' | 'current' | 'upcoming' | 'optional' | 'skipped';

/** Where step 4 stands while it is the current step. */
export type TestsPhase = 'atLab' | 'backToDoctor';

export interface VisitStepsModel {
  steps: { key: StepKey; state: StepState }[];
  testsPhase: TestsPhase | null;
}

const STEP_ORDER: StepKey[] = ['booked', 'checkedIn', 'doctor', 'tests', 'done'];

/**
 * Turns the backend's journey stage into the five fixed steps the patient sees.
 * `hasTests` says whether any test was ordered for this visit: it tells "with the
 * doctor before tests" (step 3) apart from "back with the doctor after the lab"
 * (still step 4, so progress never moves backwards).
 */
export function getVisitSteps(stage: JourneyStageCode, hasTests: boolean): VisitStepsModel {
  let current: StepKey;
  let testsPhase: TestsPhase | null = null;
  switch (stage) {
    case 'BOOKED':
      current = 'booked';
      break;
    case 'CHECKED_IN':
      current = 'checkedIn';
      break;
    case 'WITH_DOCTOR':
      current = hasTests ? 'tests' : 'doctor';
      testsPhase = hasTests ? 'backToDoctor' : null;
      break;
    case 'TEST_ORDERED':
      current = 'tests';
      testsPhase = 'atLab';
      break;
    case 'RESULT_READY':
      current = 'tests';
      testsPhase = 'backToDoctor';
      break;
    case 'DONE':
    default:
      current = 'done';
      break;
  }

  const currentIndex = STEP_ORDER.indexOf(current);
  const steps = STEP_ORDER.map((key, index) => {
    let state: StepState;
    if (index === currentIndex) {
      state = current === 'done' ? 'done' : 'current';
    } else if (index < currentIndex) {
      state = key === 'tests' && !hasTests ? 'skipped' : 'done';
    } else {
      state = key === 'tests' && !hasTests ? 'optional' : 'upcoming';
    }
    return { key, state };
  });
  return { steps, testsPhase };
}

/** How often My Visit refreshes an active visit while it is open (until live updates, KAN-27). */
export const VISIT_REFRESH_MS = 30_000;

/** True while the patient is in the hospital and the visit can still move on its own. */
export function isActiveStage(stage: JourneyStageCode): boolean {
  return stage !== 'BOOKED' && stage !== 'DONE';
}

interface VisitStepsProps {
  journey: Journey;
  hasTests: boolean;
  /** People ahead in the doctor's line; only shown on the "Checked in" step. */
  peopleAhead: number | null;
}

/** The visit as numbered steps, with the current one opened up: what to do and where to go. */
export function VisitSteps({ journey, hasTests, peopleAhead }: VisitStepsProps) {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);
  const { steps, testsPhase } = getVisitSteps(journey.stage, hasTests);

  return (
    <View testID="visit-steps">
      {steps.map(({ key, state }, index) => {
        const isCurrent = state === 'current';
        const isLast = index === steps.length - 1;
        return (
          <View
            key={key}
            testID={`visit-step-${key}`}
            accessibilityLabel={`${index + 1}. ${t(`visit.steps.${key}`)}: ${t(`visit.stepState.${state}`)}`}
            style={[styles.stepRow, rtl ? styles.rowReverse : styles.row]}
          >
            <View style={styles.rail}>
              <View
                style={[
                  styles.marker,
                  state === 'done' && styles.markerDone,
                  isCurrent && styles.markerCurrent,
                  (state === 'optional' || state === 'skipped') && styles.markerMuted,
                ]}
                testID={`visit-step-${key}-${state}`}
              >
                <Text
                  style={[
                    styles.markerText,
                    (state === 'done' || isCurrent) && styles.markerTextOn,
                  ]}
                >
                  {state === 'done' ? '✓' : state === 'skipped' ? '–' : String(index + 1)}
                </Text>
              </View>
              {!isLast ? (
                <View style={[styles.line, state === 'done' && styles.lineDone]} />
              ) : null}
            </View>

            <View style={[styles.stepBody, isCurrent && styles.stepBodyCurrent]}>
              <Text
                style={[
                  styles.stepTitle,
                  isCurrent && styles.stepTitleCurrent,
                  (state === 'optional' || state === 'skipped') && styles.stepTitleMuted,
                  rtl && styles.textRtl,
                ]}
              >
                {t(`visit.steps.${key}`)}
              </Text>

              {key === 'tests' && state === 'optional' ? (
                <Text style={[styles.note, rtl && styles.textRtl]}>{t('visit.testsOptionalNote')}</Text>
              ) : null}
              {key === 'tests' && state === 'skipped' ? (
                <Text style={[styles.note, rtl && styles.textRtl]}>{t('visit.testsSkippedNote')}</Text>
              ) : null}

              {isCurrent ? (
                <View style={styles.detail} testID="visit-current-step">
                  {key === 'tests' && testsPhase ? (
                    <Text
                      style={[styles.phase, rtl && styles.textRtl]}
                      testID="visit-tests-phase"
                    >
                      {t(`visit.testsPhase.${testsPhase}`)}
                    </Text>
                  ) : null}

                  {key === 'checkedIn' && peopleAhead !== null ? (
                    <View style={styles.queueBox} testID="visit-queue">
                      <Text style={styles.queueNumber} testID="people-ahead-count">
                        {peopleAhead}
                      </Text>
                      <Text style={[styles.queueLabel, rtl && styles.textRtl]}>
                        {peopleAhead === 0 ? t('visit.youAreNext') : t('visit.peopleAheadLabel')}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={[styles.sectionLabel, rtl && styles.textRtl]}>
                    {t('visit.whatToDoLabel')}
                  </Text>
                  <Text style={[styles.nextStep, rtl && styles.textRtl]} testID="visit-next-step">
                    {pickLocalized(journey.nextStep, lang)}
                  </Text>

                  {journey.location ? (
                    <View style={styles.locationBox} testID="visit-location">
                      <Text style={[styles.sectionLabel, rtl && styles.textRtl]}>
                        {t('visit.whereToGoLabel')}
                      </Text>
                      <Text
                        style={[styles.locationName, rtl && styles.textRtl]}
                        testID="visit-location-name"
                      >
                        {pickLocalized(journey.location.name, lang)}
                      </Text>
                      <Text style={[styles.locationMeta, rtl && styles.textRtl]}>
                        {t('common.building')} {journey.location.building} · {t('common.floor')}{' '}
                        {journey.location.floor}
                      </Text>
                      <Text style={[styles.directions, rtl && styles.textRtl]}>
                        {pickLocalized(journey.location.directions, lang)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  stepRow: {
    gap: 12,
  },
  rail: {
    alignItems: 'center',
    width: 32,
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDone: {
    borderColor: '#16A34A',
    backgroundColor: '#16A34A',
  },
  markerCurrent: {
    borderColor: '#0B5CAB',
    backgroundColor: '#0B5CAB',
  },
  markerMuted: {
    borderStyle: 'dashed',
  },
  markerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  markerTextOn: {
    color: '#FFFFFF',
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 16,
    backgroundColor: '#E2E8F0',
  },
  lineDone: {
    backgroundColor: '#16A34A',
  },
  stepBody: {
    flex: 1,
    paddingTop: 5,
    paddingBottom: 18,
  },
  stepBodyCurrent: {
    paddingBottom: 22,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  stepTitleCurrent: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0B5CAB',
  },
  stepTitleMuted: {
    color: '#94A3B8',
  },
  note: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  detail: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F0F7FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 4,
  },
  phase: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  queueBox: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  queueNumber: {
    fontSize: 40,
    fontWeight: '800',
    color: '#0B5CAB',
  },
  queueLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  nextStep: {
    fontSize: 16,
    color: '#0F172A',
    lineHeight: 22,
  },
  locationBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
  },
  locationName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  locationMeta: {
    fontSize: 14,
    color: '#334155',
    marginTop: 2,
  },
  directions: {
    fontSize: 14,
    color: '#475569',
    marginTop: 2,
  },
});
