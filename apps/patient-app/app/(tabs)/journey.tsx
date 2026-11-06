import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ApiClientError,
  getAppointmentJourney,
  listMyAppointments,
  type Appointment,
  type Journey,
} from '../../lib/api';
import {
  formatCairoDateTime,
  getAppLanguage,
  isRtlLanguage,
  pickLocalized,
  toggleAppLanguage,
  translateErrorCode,
  useTranslation,
} from '../../translations/i18n';

export default function JourneyScreen() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleApiError = useCallback((err: unknown) => {
    if (err instanceof ApiClientError) {
      setErrorMessage(translateErrorCode(err.code));
    } else {
      setErrorMessage(translateErrorCode('INTERNAL'));
    }
  }, []);

  const loadJourneyFor = useCallback(
    async (appointmentId: string) => {
      try {
        const data = await getAppointmentJourney(appointmentId);
        setJourney(data);
      } catch (err) {
        handleApiError(err);
      }
    },
    [handleApiError],
  );

  const loadJourneyData = useCallback(
    async (currentSelectedId: string | null, isPullRefresh = false) => {
      setErrorMessage(null);
      if (isPullRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const upcoming = await listMyAppointments('upcoming');
        let list = upcoming;
        if (list.length === 0) {
          list = await listMyAppointments('past');
        }
        setAppointments(list);

        const preferred =
          list.find((a) => a.id === currentSelectedId) ??
          list.find((a) => a.status === 'IN_CONSULTATION' || a.status === 'CHECKED_IN') ??
          list[0] ??
          null;

        if (preferred) {
          setSelectedId(preferred.id);
          await loadJourneyFor(preferred.id);
        } else {
          setSelectedId(null);
          setJourney(null);
        }
      } catch (err) {
        handleApiError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleApiError, loadJourneyFor],
  );

  useEffect(() => {
    void loadJourneyData(null, false);
  }, [loadJourneyData]);

  const handleSelectAppointment = async (appointment: Appointment) => {
    setErrorMessage(null);
    setSelectedId(appointment.id);
    setLoading(true);
    try {
      await loadJourneyFor(appointment.id);
    } finally {
      setLoading(false);
    }
  };

  const selectedAppointment = appointments.find((a) => a.id === selectedId) ?? null;

  return (
    <ScrollView
      testID="journey-scroll-view"
      contentContainerStyle={[styles.container, rtl ? styles.rtl : styles.ltr]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadJourneyData(selectedId, true)}
        />
      }
    >
      <View style={[styles.header, rtl ? styles.rowReverse : styles.row]}>
        <Text style={[styles.screenTitle, rtl && styles.textRtl]}>
          {t('journey.screenTitle')}
        </Text>
        <View style={[styles.headerActions, rtl ? styles.rowReverse : styles.row]}>
          <Pressable
            accessibilityRole="button"
            testID="journey-refresh-button"
            onPress={() => void loadJourneyData(selectedId, true)}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshButtonText}>{t('journey.refreshButton')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="journey-language-toggle"
            onPress={() => void toggleAppLanguage()}
            style={styles.langButton}
          >
            <Text style={styles.langButtonText}>{t('common.languageToggle')}</Text>
          </Pressable>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBox} testID="journey-error">
          <Text style={[styles.errorText, rtl && styles.textRtl]}>{errorMessage}</Text>
        </View>
      ) : null}

      {loading && appointments.length === 0 ? (
        <ActivityIndicator testID="journey-loading" />
      ) : appointments.length === 0 ? (
        <View style={styles.card}>
          <Text style={[styles.emptyText, rtl && styles.textRtl]}>{t('journey.noVisits')}</Text>
        </View>
      ) : (
        <>
          {appointments.length > 1 ? (
            <View style={styles.card}>
              <Text style={[styles.sectionLabel, rtl && styles.textRtl]}>
                {t('journey.selectVisitLabel')}
              </Text>
              <View style={styles.visitList}>
                {appointments.map((appt) => {
                  const active = appt.id === selectedId;
                  return (
                    <Pressable
                      key={appt.id}
                      accessibilityRole="button"
                      testID={`journey-visit-${appt.id}`}
                      onPress={() => void handleSelectAppointment(appt)}
                      style={[styles.visitChip, active && styles.visitChipActive]}
                    >
                      <Text
                        style={[
                          styles.visitChipText,
                          active && styles.visitChipTextActive,
                          rtl && styles.textRtl,
                        ]}
                      >
                        {appt.doctor.name} · {formatCairoDateTime(appt.startsAt, lang)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {selectedAppointment && journey ? (
            <View style={styles.card} testID="journey-card">
              <Text style={[styles.sectionLabel, rtl && styles.textRtl]}>
                {t('journey.currentStageLabel')}
              </Text>
              <Text style={[styles.stageTitle, rtl && styles.textRtl]} testID="journey-stage-title">
                {pickLocalized(journey.title, lang)}
              </Text>

              <View style={styles.stepBox}>
                <Text style={[styles.sectionLabel, rtl && styles.textRtl]}>
                  {t('journey.nextStepLabel')}
                </Text>
                <Text style={[styles.nextStepText, rtl && styles.textRtl]} testID="journey-next-step">
                  {pickLocalized(journey.nextStep, lang)}
                </Text>
              </View>

              <View style={styles.locationBox}>
                <Text style={[styles.sectionLabel, rtl && styles.textRtl]}>
                  {t('journey.whereToGoLabel')}
                </Text>
                {journey.location ? (
                  <>
                    <Text
                      style={[styles.locationName, rtl && styles.textRtl]}
                      testID="journey-location-name"
                    >
                      {pickLocalized(journey.location.name, lang)}
                    </Text>
                    <Text style={[styles.locationMeta, rtl && styles.textRtl]}>
                      {t('common.building')} {journey.location.building} · {t('common.floor')}{' '}
                      {journey.location.floor}
                    </Text>
                    <Text
                      style={[styles.directionsText, rtl && styles.textRtl]}
                      testID="journey-location-directions"
                    >
                      {t('journey.directionsLabel')}:{' '}
                      {pickLocalized(journey.location.directions, lang)}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.noLocationText, rtl && styles.textRtl]}>
                    {t('journey.noLocationNeeded')}
                  </Text>
                )}
              </View>
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
    padding: 16,
    backgroundColor: '#F4F7FB',
  },
  ltr: {
    direction: 'ltr',
  },
  rtl: {
    direction: 'rtl',
  },
  row: {
    flexDirection: 'row',
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  textRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  header: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0B5CAB',
  },
  headerActions: {
    alignItems: 'center',
    gap: 8,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0B5CAB',
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E3EEF9',
    borderRadius: 8,
  },
  langButtonText: {
    color: '#0B5CAB',
    fontWeight: '600',
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderColor: '#F5B5B5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  visitList: {
    gap: 8,
  },
  visitChip: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  visitChipActive: {
    borderColor: '#0B5CAB',
    backgroundColor: '#EBF5FF',
  },
  visitChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  visitChipTextActive: {
    color: '#0B5CAB',
  },
  stageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0B5CAB',
    marginBottom: 16,
  },
  stepBox: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  nextStepText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  locationBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  locationMeta: {
    fontSize: 14,
    color: '#334155',
    marginTop: 4,
  },
  directionsText: {
    fontSize: 13,
    color: '#475569',
    marginTop: 6,
  },
  noLocationText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
  },
});
