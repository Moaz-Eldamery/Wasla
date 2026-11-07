import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dropdown } from '../../components/Dropdown';
import { ScreenHeader } from '../../components/ScreenHeader';
import { VISIT_REFRESH_MS, VisitSteps, isActiveStage } from '../../components/VisitSteps';
import {
  ApiClientError,
  getAppointmentJourney,
  getQueuePosition,
  listMyAppointments,
  listMyResults,
  type Appointment,
  type Journey,
} from '../../lib/api';
import {
  formatCairoDateTime,
  getAppLanguage,
  getCairoDayKey,
  isRtlLanguage,
  pickLocalized,
  translateErrorCode,
  useTranslation,
} from '../../translations/i18n';

interface VisitDetails {
  appointmentId: string;
  journey: Journey;
  hasTests: boolean;
  peopleAhead: number | null;
}

/**
 * My Visit: the patient's upcoming visits, plus today's completed visits that still
 * have a lab step, shown as five steps with what to do and where to go.
 */
export default function VisitScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);

  const [visits, setVisits] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<VisitDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showError = useCallback((err: unknown) => {
    setErrorMessage(
      translateErrorCode(err instanceof ApiClientError ? err.code : 'INTERNAL'),
    );
  }, []);

  // Only the visit picked last may write the details, so a slow answer for a
  // visit the patient already left can't replace the current one.
  const latestDetailsRequest = useRef<string | null>(null);

  const loadDetails = useCallback(
    async (appointmentId: string, { silent = false } = {}) => {
      latestDetailsRequest.current = appointmentId;
      const isCurrent = () => latestDetailsRequest.current === appointmentId;
      if (!silent) setLoadingDetails(true);
      try {
        const [journey, results] = await Promise.all([
          getAppointmentJourney(appointmentId),
          listMyResults(),
        ]);
        const peopleAhead =
          journey.stage === 'CHECKED_IN'
            ? (await getQueuePosition(appointmentId)).peopleAhead
            : null;
        if (!isCurrent()) return;
        setDetails({
          appointmentId,
          journey,
          hasTests: results.some((r) => r.appointmentId === appointmentId),
          peopleAhead,
        });
        setErrorMessage(null);
      } catch (err) {
        if (isCurrent()) showError(err);
      } finally {
        if (isCurrent()) setLoadingDetails(false);
      }
    },
    [showError],
  );

  const loadVisits = useCallback(
    async (preferredId: string | null, isPullRefresh = false) => {
      setErrorMessage(null);
      if (isPullRefresh) setRefreshing(true);
      try {
        const [upcoming, past] = await Promise.all([
          listMyAppointments('upcoming'),
          listMyAppointments('past'),
        ]);

        // A visit the doctor completed still counts until the patient is done at the lab.
        const today = getCairoDayKey(new Date().toISOString());
        const completedToday = past.filter(
          (a) => a.status === 'COMPLETED' && getCairoDayKey(a.startsAt) === today,
        );
        const stages = await Promise.all(
          completedToday.map((a) =>
            getAppointmentJourney(a.id).then(
              (j) => j.stage,
              () => null,
            ),
          ),
        );
        const unfinished = completedToday.filter((_, i) => stages[i] && stages[i] !== 'DONE');

        const list = [...unfinished, ...upcoming];
        setVisits(list);

        const preferred =
          list.find((a) => a.id === preferredId) ??
          list.find((a) => a.status === 'CHECKED_IN' || a.status === 'IN_CONSULTATION') ??
          list[0] ??
          null;

        setSelectedId(preferred?.id ?? null);
        if (preferred) {
          await loadDetails(preferred.id, { silent: isPullRefresh });
        } else {
          latestDetailsRequest.current = null;
          setDetails(null);
        }
      } catch (err) {
        showError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadDetails, showError],
  );

  useEffect(() => {
    void loadVisits(null);
  }, [loadVisits]);

  const shownDetails = details && details.appointmentId === selectedId ? details : null;
  const isActive = shownDetails ? isActiveStage(shownDetails.journey.stage) : false;

  // While the patient is in the hospital and this screen is open, keep it current.
  useFocusEffect(
    useCallback(() => {
      if (!isActive || !selectedId) return undefined;
      const timer = setInterval(() => {
        void loadDetails(selectedId, { silent: true });
      }, VISIT_REFRESH_MS);
      return () => clearInterval(timer);
    }, [isActive, selectedId, loadDetails]),
  );

  const selectedVisit = visits.find((v) => v.id === selectedId) ?? null;

  return (
    <ScrollView
      testID="visit-scroll-view"
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16 },
        rtl ? styles.rtl : styles.ltr,
      ]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void loadVisits(selectedId, true)} />
      }
    >
      <ScreenHeader title={t('visit.screenTitle')} />

      {errorMessage ? (
        <View style={styles.errorBox} testID="visit-error">
          <Text style={[styles.errorText, rtl && styles.textRtl]}>{errorMessage}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator testID="visit-loading" />
      ) : visits.length === 0 ? (
        <View style={styles.card} testID="visit-empty">
          <Text style={[styles.emptyText, rtl && styles.textRtl]}>{t('visit.noVisits')}</Text>
          <Pressable
            accessibilityRole="button"
            testID="visit-go-book"
            onPress={() => router.push('/(tabs)/book')}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>{t('visit.bookVisitButton')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {visits.length > 1 ? (
            <Dropdown
              testID="visit-dropdown"
              label={t('visit.selectVisitLabel')}
              placeholder={t('visit.selectVisitLabel')}
              options={visits.map((v) => ({
                value: v.id,
                label: `${v.doctor.name} · ${formatCairoDateTime(v.startsAt, lang)}`,
                sublabel: pickLocalized(v.clinic.name, lang),
              }))}
              value={selectedId}
              onChange={(id) => {
                setSelectedId(id);
                setErrorMessage(null);
                void loadDetails(id);
              }}
            />
          ) : null}

          {selectedVisit ? (
            <View style={styles.card}>
              <Text style={[styles.visitDoctor, rtl && styles.textRtl]} testID="visit-doctor">
                {selectedVisit.doctor.name}
              </Text>
              <Text style={[styles.visitMeta, rtl && styles.textRtl]}>
                {formatCairoDateTime(selectedVisit.startsAt, lang)} ·{' '}
                {pickLocalized(selectedVisit.clinic.name, lang)}
              </Text>

              <View style={styles.divider} />

              {loadingDetails && !shownDetails ? (
                <ActivityIndicator testID="visit-details-loading" />
              ) : shownDetails ? (
                <>
                  <VisitSteps
                    journey={shownDetails.journey}
                    hasTests={shownDetails.hasTests}
                    peopleAhead={shownDetails.peopleAhead}
                  />
                  {shownDetails.journey.stage === 'DONE' ? (
                    <Pressable
                      accessibilityRole="button"
                      testID="visit-see-results"
                      onPress={() => router.push('/(tabs)/results')}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>{t('visit.seeResultsButton')}</Text>
                    </Pressable>
                  ) : null}
                  {isActive ? (
                    <Text style={[styles.hint, rtl && styles.textRtl]}>
                      {t('visit.autoRefreshHint')}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
    backgroundColor: '#F4F7FB',
  },
  ltr: { direction: 'ltr' },
  rtl: { direction: 'rtl' },
  textRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderColor: '#F5B5B5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyText: {
    fontSize: 15,
    color: '#475569',
    marginBottom: 12,
  },
  visitDoctor: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  visitMeta: {
    fontSize: 14,
    color: '#475569',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  primaryButton: {
    backgroundColor: '#0B5CAB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
});
