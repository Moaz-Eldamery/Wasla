import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
import {
  ApiClientError,
  downloadTestResult,
  getVisitSummary,
  listMyAppointments,
  listMyResults,
  type Appointment,
  type DownloadedResultFile,
  type PatientResult,
  type VisitSummary,
} from '../../lib/api';
import {
  formatCairoDateTime,
  getAppLanguage,
  isRtlLanguage,
  pickLocalized,
  translateErrorCode,
  useTranslation,
} from '../../translations/i18n';

export default function ResultsScreen() {
  const { t } = useTranslation();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);
  const insets = useSafeAreaInsets();

  const [results, setResults] = useState<PatientResult[]>([]);
  const [pastVisits, setPastVisits] = useState<Appointment[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [visitSummary, setVisitSummary] = useState<VisitSummary | null>(null);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [downloadingTestId, setDownloadingTestId] = useState<string | null>(null);
  const [downloadedFiles, setDownloadedFiles] = useState<
    Record<string, DownloadedResultFile>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleApiError = useCallback((err: unknown) => {
    if (err instanceof ApiClientError) {
      setErrorMessage(translateErrorCode(err.code));
    } else {
      setErrorMessage(translateErrorCode('INTERNAL'));
    }
  }, []);

  // Only the most recently requested visit may write the summary, so a slow
  // response for a visit the patient already left can't replace the current one.
  const latestSummaryRequest = useRef<string | null>(null);

  const loadSummaryFor = useCallback(
    async (appointmentId: string) => {
      latestSummaryRequest.current = appointmentId;
      const isCurrent = () => latestSummaryRequest.current === appointmentId;
      setLoadingSummary(true);
      setSummaryUnavailable(false);
      setVisitSummary(null);
      try {
        const summary = await getVisitSummary(appointmentId);
        if (isCurrent()) setVisitSummary(summary);
      } catch (err) {
        if (!isCurrent()) return;
        if (err instanceof ApiClientError && err.code === 'NOT_YET_AVAILABLE') {
          setSummaryUnavailable(true);
        } else {
          handleApiError(err);
        }
      } finally {
        if (isCurrent()) setLoadingSummary(false);
      }
    },
    [handleApiError],
  );

  /** Picks a past visit; only a completed visit can have a summary. */
  const selectVisit = useCallback(
    async (visit: Appointment | null) => {
      setSelectedVisitId(visit?.id ?? null);
      if (visit?.status === 'COMPLETED') {
        await loadSummaryFor(visit.id);
      } else {
        latestSummaryRequest.current = null;
        setVisitSummary(null);
        setSummaryUnavailable(false);
        setLoadingSummary(false);
      }
    },
    [loadSummaryFor],
  );

  const loadAll = useCallback(
    async (currentVisitId: string | null, isPullRefresh = false) => {
      setErrorMessage(null);
      if (isPullRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [myResults, pastAppointments] = await Promise.all([
          listMyResults(),
          listMyAppointments('past'),
        ]);
        setResults(myResults);

        setPastVisits(pastAppointments);

        const preferredVisit =
          pastAppointments.find((a) => a.id === currentVisitId) ??
          pastAppointments.find((a) => a.status === 'COMPLETED') ??
          pastAppointments[0] ??
          null;
        await selectVisit(preferredVisit);
      } catch (err) {
        handleApiError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleApiError, selectVisit],
  );

  useEffect(() => {
    void loadAll(null, false);
  }, [loadAll]);

  const handleSelectVisit = async (visitId: string) => {
    setErrorMessage(null);
    await selectVisit(pastVisits.find((v) => v.id === visitId) ?? null);
  };

  const selectedVisit = pastVisits.find((v) => v.id === selectedVisitId) ?? null;

  /** Downloads the file once (into the app's private cache), then reuses the saved copy. */
  const ensureDownloaded = async (result: PatientResult): Promise<DownloadedResultFile> => {
    const saved = downloadedFiles[result.testId];
    if (saved && new File(saved.uri).exists) return saved;
    const downloaded = await downloadTestResult(result.testId);
    setDownloadedFiles((prev) => ({ ...prev, [result.testId]: downloaded }));
    return downloaded;
  };

  const runFileAction = async (
    result: PatientResult,
    action: (file: DownloadedResultFile) => Promise<void>,
  ) => {
    if (result.status !== 'RELEASED') return;
    setErrorMessage(null);
    setDownloadingTestId(result.testId);
    try {
      await action(await ensureDownloaded(result));
    } catch (err) {
      if (err instanceof ApiClientError) {
        handleApiError(err);
      } else {
        setErrorMessage(t('results.openFailed'));
      }
    } finally {
      setDownloadingTestId(null);
    }
  };

  const shareFile = async (result: PatientResult, file: DownloadedResultFile) => {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device');
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: file.contentType,
      dialogTitle: result.testName,
    });
  };

  /** Opens the result in the phone's viewer (Quick Look / the default PDF or image app). */
  const handleOpenResult = (result: PatientResult) =>
    runFileAction(result, async (file) => {
      const local = new File(file.uri);
      if (await local.canPreview({ mimeType: file.contentType })) {
        await local.preview({ title: result.testName, mimeType: file.contentType });
      } else {
        // No viewer installed: let the patient pick an app that can open it.
        await shareFile(result, file);
      }
    });

  const handleShareResult = (result: PatientResult) =>
    runFileAction(result, (file) => shareFile(result, file));

  return (
    <ScrollView
      testID="results-scroll-view"
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16 },
        rtl ? styles.rtl : styles.ltr,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadAll(selectedVisitId, true)}
        />
      }
    >
      <ScreenHeader title={t('results.screenTitle')} />

      {errorMessage ? (
        <View style={styles.errorBox} testID="results-error">
          <Text style={[styles.errorText, rtl && styles.textRtl]}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Section 1: Test Results */}
      <View style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, rtl && styles.textRtl]}>
          {t('results.testResultsSectionTitle')}
        </Text>

        {loading && results.length === 0 ? (
          <ActivityIndicator testID="results-loading" />
        ) : results.length === 0 ? (
          <Text style={[styles.emptyText, rtl && styles.textRtl]} testID="no-results-text">
            {t('results.noResults')}
          </Text>
        ) : (
          <View style={styles.listContainer}>
            {results.map((item) => {
              const isReleased = item.status === 'RELEASED';
              const isDownloading = downloadingTestId === item.testId;
              const downloaded = downloadedFiles[item.testId];
              const fileName = item.file?.fileName ?? `${item.testName}.pdf`;

              return (
                <View
                  key={item.testId}
                  testID={`result-card-${item.testId}`}
                  style={styles.resultCard}
                >
                  <View style={[styles.resultHeader, rtl ? styles.rowReverse : styles.row]}>
                    <Text style={[styles.testName, rtl && styles.textRtl]}>
                      {item.testName}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        isReleased ? styles.badgeReleased : styles.badgeWaiting,
                      ]}
                      testID={`result-status-${item.testId}`}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          isReleased ? styles.badgeTextReleased : styles.badgeTextWaiting,
                        ]}
                      >
                        {isReleased
                          ? t('results.releasedBadge')
                          : t('results.waitingForReviewBadge')}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.metaLine, rtl && styles.textRtl]}>
                    {t('results.orderedAtLabel')}: {formatCairoDateTime(item.orderedAt, lang)}
                  </Text>

                  {!isReleased ? (
                    <Text
                      style={[styles.waitingNote, rtl && styles.textRtl]}
                      testID={`waiting-note-${item.testId}`}
                    >
                      {t('results.waitingForReviewNote')}
                    </Text>
                  ) : (
                    <>
                      {item.releasedAt ? (
                        <Text style={[styles.metaLine, rtl && styles.textRtl]}>
                          {t('results.releasedAtLabel')}:{' '}
                          {formatCairoDateTime(item.releasedAt, lang)}
                        </Text>
                      ) : null}

                      {item.file ? (
                        <Text style={[styles.metaLine, rtl && styles.textRtl]}>
                          {t('results.fileLabel')}: {item.file.fileName} (
                          {Math.max(1, Math.round(item.file.sizeBytes / 1024))} KB)
                        </Text>
                      ) : null}

                      <View style={[styles.fileActions, rtl ? styles.rowReverse : styles.row]}>
                        <Pressable
                          accessibilityRole="button"
                          testID={`download-result-${item.testId}`}
                          disabled={isDownloading}
                          onPress={() => void handleOpenResult(item)}
                          style={[styles.downloadButton, isDownloading && styles.disabledButton]}
                        >
                          {isDownloading ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Text style={styles.downloadButtonText}>
                              {t('results.downloadButton')}
                            </Text>
                          )}
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          testID={`share-result-${item.testId}`}
                          disabled={isDownloading}
                          onPress={() => void handleShareResult(item)}
                          style={[styles.shareButton, isDownloading && styles.disabledButton]}
                        >
                          <Text style={styles.shareButtonText}>
                            {t('results.shareResultButton')}
                          </Text>
                        </Pressable>
                      </View>

                      {downloaded ? (
                        <Text
                          style={[styles.downloadedText, rtl && styles.textRtl]}
                          testID={`downloaded-result-${item.testId}`}
                        >
                          {t('results.downloadedBanner', { fileName })}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Section 2: Past visits and their summaries */}
      <View style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, rtl && styles.textRtl]}>
          {t('results.pastVisitsSectionTitle')}
        </Text>

        {loading && pastVisits.length === 0 ? (
          <ActivityIndicator testID="summaries-loading" />
        ) : pastVisits.length === 0 ? (
          <Text style={[styles.emptyText, rtl && styles.textRtl]} testID="no-past-visits-text">
            {t('results.noPastVisits')}
          </Text>
        ) : (
          <>
            {pastVisits.length > 1 ? (
              <Dropdown
                testID="summary-visit"
                label={t('results.selectVisitLabel')}
                placeholder={t('results.selectVisitLabel')}
                options={pastVisits.map((visit) => ({
                  value: visit.id,
                  label: `${visit.doctor.name} · ${formatCairoDateTime(visit.startsAt, lang)}`,
                  sublabel: `${pickLocalized(visit.clinic.name, lang)} · ${t(`status.${visit.status}`)}`,
                }))}
                value={selectedVisitId}
                onChange={(id) => void handleSelectVisit(id)}
              />
            ) : null}

            {selectedVisit ? (
              <View style={[styles.visitHeader, rtl ? styles.rowReverse : styles.row]}>
                <View style={styles.visitHeaderText}>
                  <Text style={[styles.summaryDoctor, rtl && styles.textRtl]}>
                    {selectedVisit.doctor.name}
                  </Text>
                  <Text style={[styles.metaLine, rtl && styles.textRtl]}>
                    {formatCairoDateTime(selectedVisit.startsAt, lang)} ·{' '}
                    {pickLocalized(selectedVisit.clinic.name, lang)}
                  </Text>
                </View>
                <View style={styles.statusBadge} testID="past-visit-status">
                  <Text style={styles.statusBadgeText}>{t(`status.${selectedVisit.status}`)}</Text>
                </View>
              </View>
            ) : null}

            {selectedVisit && selectedVisit.status !== 'COMPLETED' ? (
              <Text style={[styles.emptyText, rtl && styles.textRtl]} testID="no-summary-text">
                {t('results.noSummaryForVisit')}
              </Text>
            ) : loadingSummary ? (
              <ActivityIndicator testID="visit-summary-loading" />
            ) : visitSummary ? (
              <View style={styles.summaryCard} testID="visit-summary-card">
                <Text style={[styles.metaLine, rtl && styles.textRtl]}>
                  {t('results.summaryCompletedAtLabel')}:{' '}
                  {formatCairoDateTime(visitSummary.completedAt, lang)}
                </Text>
                <Text style={[styles.summaryHeading, rtl && styles.textRtl]}>
                  {t('results.summaryHeading')}
                </Text>
                <Text
                  style={[styles.summaryBody, rtl && styles.textRtl]}
                  testID="visit-summary-text"
                >
                  {visitSummary.summary}
                </Text>
              </View>
            ) : summaryUnavailable ? (
              <Text
                style={[styles.emptyText, rtl && styles.textRtl]}
                testID="summary-not-available-text"
              >
                {t('results.summaryNotYetAvailable')}
              </Text>
            ) : null}
          </>
        )}
      </View>
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
  fileActions: {
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  shareButton: {
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0B5CAB',
    backgroundColor: '#FFFFFF',
  },
  shareButtonText: {
    color: '#0B5CAB',
    fontSize: 14,
    fontWeight: '600',
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
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  listContainer: {
    gap: 10,
  },
  resultCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  resultHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  testName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeWaiting: {
    backgroundColor: '#FEF3C7',
  },
  badgeReleased: {
    backgroundColor: '#DCFCE7',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextWaiting: {
    color: '#92400E',
  },
  badgeTextReleased: {
    color: '#166534',
  },
  metaLine: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  waitingNote: {
    fontSize: 13,
    color: '#92400E',
    marginTop: 8,
  },
  downloadButton: {
    backgroundColor: '#0B5CAB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadedText: {
    marginTop: 8,
    color: '#027A48',
    fontSize: 13,
    fontWeight: '600',
  },
  visitHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  visitHeaderText: {
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#0369A1',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
  },
  summaryDoctor: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B5CAB',
    marginTop: 10,
    marginBottom: 4,
  },
  summaryBody: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    paddingVertical: 6,
  },
});
