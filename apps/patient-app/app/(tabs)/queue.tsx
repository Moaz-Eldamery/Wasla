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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiClientError,
  getQueuePosition,
  listMyAppointments,
  type Appointment,
  type QueuePosition,
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

export default function QueueScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState<QueuePosition | null>(null);
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

  const loadPositionFor = useCallback(
    async (appointmentId: string) => {
      try {
        const pos = await getQueuePosition(appointmentId);
        setQueuePosition(pos);
      } catch (err) {
        handleApiError(err);
      }
    },
    [handleApiError],
  );

  const loadQueueData = useCallback(
    async (currentSelectedId: string | null, isPullRefresh = false) => {
      setErrorMessage(null);
      if (isPullRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const upcoming = await listMyAppointments('upcoming');
        setAppointments(upcoming);
        const preferred =
          upcoming.find((a) => a.id === currentSelectedId) ??
          upcoming.find((a) => a.status === 'CHECKED_IN' || a.status === 'IN_CONSULTATION') ??
          upcoming[0] ??
          null;

        if (preferred) {
          setSelectedId(preferred.id);
          await loadPositionFor(preferred.id);
        } else {
          setSelectedId(null);
          setQueuePosition(null);
        }
      } catch (err) {
        handleApiError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleApiError, loadPositionFor],
  );

  useEffect(() => {
    void loadQueueData(null, false);
  }, [loadQueueData]);

  const handleSelectAppointment = async (appointment: Appointment) => {
    setErrorMessage(null);
    setSelectedId(appointment.id);
    setLoading(true);
    try {
      await loadPositionFor(appointment.id);
    } finally {
      setLoading(false);
    }
  };

  const selectedAppointment = appointments.find((a) => a.id === selectedId) ?? null;

  return (
    <ScrollView
      testID="queue-scroll-view"
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16 },
        rtl ? styles.rtl : styles.ltr,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadQueueData(selectedId, true)}
        />
      }
    >
      <View style={[styles.header, rtl ? styles.rowReverse : styles.row]}>
        <Text style={[styles.screenTitle, rtl && styles.textRtl]}>{t('queue.screenTitle')}</Text>
        <View style={[styles.headerActions, rtl ? styles.rowReverse : styles.row]}>
          <Pressable
            accessibilityRole="button"
            testID="queue-refresh-button"
            onPress={() => void loadQueueData(selectedId, true)}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshButtonText}>{t('queue.refreshButton')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="queue-language-toggle"
            onPress={() => void toggleAppLanguage()}
            style={styles.langButton}
          >
            <Text style={styles.langButtonText}>{t('common.languageToggle')}</Text>
          </Pressable>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBox} testID="queue-error">
          <Text style={[styles.errorText, rtl && styles.textRtl]}>{errorMessage}</Text>
        </View>
      ) : null}

      {loading && appointments.length === 0 ? (
        <ActivityIndicator testID="queue-loading" />
      ) : appointments.length === 0 ? (
        <View style={styles.card}>
          <Text style={[styles.emptyText, rtl && styles.textRtl]}>
            {t('queue.noActiveVisits')}
          </Text>
        </View>
      ) : (
        <>
          {appointments.length > 1 ? (
            <View style={styles.card}>
              <Text style={[styles.sectionLabel, rtl && styles.textRtl]}>
                {t('queue.selectVisitLabel')}
              </Text>
              <View style={styles.visitList}>
                {appointments.map((appt) => {
                  const active = appt.id === selectedId;
                  return (
                    <Pressable
                      key={appt.id}
                      accessibilityRole="button"
                      testID={`queue-visit-${appt.id}`}
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
                        {appt.doctor.name} · {pickLocalized(appt.clinic.name, lang)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {selectedAppointment && queuePosition ? (
            <View style={styles.card} testID="queue-position-card">
              <View style={[styles.statusHeader, rtl ? styles.rowReverse : styles.row]}>
                <Text style={[styles.doctorName, rtl && styles.textRtl]}>
                  {selectedAppointment.doctor.name}
                </Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {t(`status.${queuePosition.status}`)}
                  </Text>
                </View>
              </View>

              <Text style={[styles.clinicName, rtl && styles.textRtl]}>
                {pickLocalized(selectedAppointment.clinic.name, lang)} ·{' '}
                {formatCairoDateTime(selectedAppointment.startsAt, lang)}
              </Text>

              {queuePosition.status === 'CHECKED_IN' && queuePosition.peopleAhead !== null ? (
                <View style={styles.counterBox}>
                  <Text style={[styles.counterLabel, rtl && styles.textRtl]}>
                    {t('queue.peopleAheadLabel')}
                  </Text>
                  <Text style={styles.counterNumber} testID="people-ahead-count">
                    {queuePosition.peopleAhead}
                  </Text>
                  {queuePosition.peopleAhead === 0 ? (
                    <Text style={[styles.nextText, rtl && styles.textRtl]}>
                      {t('queue.youAreNext')}
                    </Text>
                  ) : null}
                </View>
              ) : queuePosition.status === 'IN_CONSULTATION' ? (
                <View style={styles.infoBox}>
                  <Text style={[styles.infoText, rtl && styles.textRtl]}>
                    {t('queue.inConsultationNow')}
                  </Text>
                </View>
              ) : (
                <View style={styles.infoBox}>
                  <Text style={[styles.infoText, rtl && styles.textRtl]}>
                    {t('queue.notInQueueYet')}
                  </Text>
                </View>
              )}

              <Text style={[styles.hintText, rtl && styles.textRtl]}>
                {t('queue.pullToRefreshHint')}
              </Text>
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
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
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
  statusHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  doctorName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#0369A1',
    fontSize: 12,
    fontWeight: '600',
  },
  clinicName: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 16,
  },
  counterBox: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  counterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 6,
  },
  counterNumber: {
    fontSize: 48,
    fontWeight: '800',
    color: '#0B5CAB',
  },
  nextText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#027A48',
  },
  infoBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  infoText: {
    fontSize: 14,
    color: '#334155',
  },
  hintText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
  },
});
