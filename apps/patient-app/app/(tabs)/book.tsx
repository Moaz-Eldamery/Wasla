import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiClientError,
  bookAppointment,
  getCurrentUser,
  listDepartmentDoctors,
  listDepartments,
  listDoctorFreeSlots,
  listMyAppointments,
  logout,
  type Appointment,
  type Department,
  type Doctor,
  type Slot,
} from '../../lib/api';
import {
  formatCairoDateTime,
  formatCairoShortDay,
  getAppLanguage,
  getCairoDayKey,
  isRtlLanguage,
  pickLocalized,
  toggleAppLanguage,
  translateErrorCode,
  useTranslation,
} from '../../translations/i18n';

export default function BookScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);
  const user = getCurrentUser();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDayKey, setSelectedDayKey] = useState<string>('ALL');

  const [appointmentsTab, setAppointmentsTab] = useState<'upcoming' | 'past'>('upcoming');
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleApiError = useCallback((err: unknown) => {
    if (err instanceof ApiClientError) {
      setErrorMessage(translateErrorCode(err.code));
    } else {
      setErrorMessage(translateErrorCode('INTERNAL'));
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    setLoadingDepartments(true);
    try {
      const data = await listDepartments('CLINICAL');
      setDepartments(data);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoadingDepartments(false);
    }
  }, [handleApiError]);

  const loadAppointments = useCallback(
    async (when: 'upcoming' | 'past') => {
      setLoadingAppointments(true);
      try {
        const data = await listMyAppointments(when);
        setAppointments(data);
      } catch (err) {
        handleApiError(err);
      } finally {
        setLoadingAppointments(false);
      }
    },
    [handleApiError],
  );

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    void loadAppointments(appointmentsTab);
  }, [appointmentsTab, loadAppointments]);

  const handleSelectDepartment = async (department: Department) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedDepartment(department);
    setSelectedDoctor(null);
    setSlots([]);
    setLoadingDoctors(true);
    try {
      const data = await listDepartmentDoctors(department.id);
      setDoctors(data);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const handleSelectDoctor = async (doctor: Doctor) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedDoctor(doctor);
    setSelectedDayKey('ALL');
    setLoadingSlots(true);
    try {
      const data = await listDoctorFreeSlots(doctor.id);
      setSlots(data);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleBookSlot = async (slot: Slot) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBookingSlotId(slot.id);
    try {
      await bookAppointment(slot.id);
      setSuccessMessage(t('booking.bookingSuccess'));
      if (selectedDoctor) {
        const updatedSlots = await listDoctorFreeSlots(selectedDoctor.id);
        setSlots(updatedSlots);
      }
      setAppointmentsTab('upcoming');
      await loadAppointments('upcoming');
    } catch (err) {
      handleApiError(err);
    } finally {
      setBookingSlotId(null);
    }
  };

  // The days that still have free slots, in slot order, each with its display label.
  const slotDays = useMemo(() => {
    const days = new Map<string, string>();
    for (const slot of slots) {
      const key = getCairoDayKey(slot.startsAt);
      if (!days.has(key)) days.set(key, formatCairoShortDay(slot.startsAt, lang));
    }
    return days;
  }, [slots, lang]);
  // Falls back to all days when the chosen day has no free slots left (for example
  // after booking its last slot), so the list never goes empty with slots remaining.
  const activeDayKey = slotDays.has(selectedDayKey) ? selectedDayKey : 'ALL';
  const visibleSlots =
    activeDayKey === 'ALL'
      ? slots
      : slots.filter((slot) => getCairoDayKey(slot.startsAt) === activeDayKey);

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16 },
        rtl ? styles.rtl : styles.ltr,
      ]}
    >
      <View style={[styles.header, rtl ? styles.rowReverse : styles.row]}>
        <View>
          <Text style={[styles.brand, rtl && styles.textRtl]}>{t('appName')}</Text>
          {user ? (
            <Text style={[styles.userName, rtl && styles.textRtl]} testID="logged-in-user-name">
              {user.name}
            </Text>
          ) : null}
        </View>
        <View style={[styles.headerActions, rtl ? styles.rowReverse : styles.row]}>
          <Pressable
            accessibilityRole="button"
            testID="language-toggle-button"
            onPress={() => void toggleAppLanguage()}
            style={styles.langButton}
          >
            <Text style={styles.langButtonText}>{t('common.languageToggle')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="logout-button"
            onPress={() => void handleLogout()}
            style={styles.logoutButton}
          >
            <Text style={styles.logoutButtonText}>{t('common.logout')}</Text>
          </Pressable>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBox} testID="booking-error">
          <Text style={[styles.errorText, rtl && styles.textRtl]}>{errorMessage}</Text>
        </View>
      ) : null}

      {successMessage ? (
        <View style={styles.successBox} testID="booking-success">
          <Text style={[styles.successText, rtl && styles.textRtl]}>{successMessage}</Text>
        </View>
      ) : null}

      {/* Booking section: Department -> Doctor -> Free Slots */}
      <View style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, rtl && styles.textRtl]}>
          {t('booking.browseSectionTitle')}
        </Text>

        {/* Step 1: Departments */}
        <View style={styles.stepBlock}>
          <View style={[styles.stepHeader, rtl ? styles.rowReverse : styles.row]}>
            <Text style={[styles.stepTitle, rtl && styles.textRtl]}>
              {t('booking.stepDepartments')}
            </Text>
            {selectedDepartment ? (
              <Pressable
                accessibilityRole="button"
                testID="reset-department-button"
                onPress={() => {
                  setSelectedDepartment(null);
                  setSelectedDoctor(null);
                  setDoctors([]);
                  setSlots([]);
                }}
              >
                <Text style={styles.linkText}>{t('booking.changeDepartment')}</Text>
              </Pressable>
            ) : null}
          </View>

          {loadingDepartments ? (
            <ActivityIndicator testID="departments-loading" />
          ) : departments.length === 0 ? (
            <Text style={[styles.emptyText, rtl && styles.textRtl]}>
              {t('booking.noDepartments')}
            </Text>
          ) : (
            <View style={styles.listContainer}>
              {departments.map((dept) => {
                const isSelected = selectedDepartment?.id === dept.id;
                return (
                  <Pressable
                    key={dept.id}
                    accessibilityRole="button"
                    testID={`department-item-${dept.id}`}
                    onPress={() => void handleSelectDepartment(dept)}
                    style={[styles.choiceItem, isSelected && styles.choiceItemSelected]}
                  >
                    <Text
                      style={[
                        styles.choiceTitle,
                        isSelected && styles.choiceTitleSelected,
                        rtl && styles.textRtl,
                      ]}
                    >
                      {pickLocalized(dept.name, lang)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Step 2: Doctors */}
        {selectedDepartment ? (
          <View style={styles.stepBlock}>
            <View style={[styles.stepHeader, rtl ? styles.rowReverse : styles.row]}>
              <Text style={[styles.stepTitle, rtl && styles.textRtl]}>
                {t('booking.stepDoctors')}
              </Text>
              {selectedDoctor ? (
                <Pressable
                  accessibilityRole="button"
                  testID="reset-doctor-button"
                  onPress={() => {
                    setSelectedDoctor(null);
                    setSlots([]);
                  }}
                >
                  <Text style={styles.linkText}>{t('booking.changeDoctor')}</Text>
                </Pressable>
              ) : null}
            </View>

            {loadingDoctors ? (
              <ActivityIndicator testID="doctors-loading" />
            ) : doctors.length === 0 ? (
              <Text style={[styles.emptyText, rtl && styles.textRtl]}>
                {t('booking.noDoctors')}
              </Text>
            ) : (
              <View style={styles.listContainer}>
                {doctors.map((doc) => {
                  const isSelected = selectedDoctor?.id === doc.id;
                  return (
                    <Pressable
                      key={doc.id}
                      accessibilityRole="button"
                      testID={`doctor-item-${doc.id}`}
                      onPress={() => void handleSelectDoctor(doc)}
                      style={[styles.choiceItem, isSelected && styles.choiceItemSelected]}
                    >
                      <Text
                        style={[
                          styles.choiceTitle,
                          isSelected && styles.choiceTitleSelected,
                          rtl && styles.textRtl,
                        ]}
                      >
                        {doc.name}
                      </Text>
                      {doc.clinics.length > 0 ? (
                        <Text style={[styles.choiceSubtitle, rtl && styles.textRtl]}>
                          {doc.clinics.map((c) => pickLocalized(c.name, lang)).join(' · ')}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {/* Step 3: Free slots */}
        {selectedDoctor ? (
          <View style={styles.stepBlock}>
            <Text style={[styles.stepTitle, rtl && styles.textRtl]}>{t('booking.stepSlots')}</Text>
            {loadingSlots ? (
              <ActivityIndicator testID="slots-loading" />
            ) : slots.length === 0 ? (
              <Text style={[styles.emptyText, rtl && styles.textRtl]}>{t('booking.noSlots')}</Text>
            ) : (
              <>
                {slotDays.size > 1 ? (
                  <View style={[styles.dayFilterRow, rtl ? styles.rowReverse : styles.row]}>
                    <Pressable
                      accessibilityRole="button"
                      testID="slot-day-ALL"
                      onPress={() => setSelectedDayKey('ALL')}
                      style={[
                        styles.dayPill,
                        activeDayKey === 'ALL' && styles.dayPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayPillText,
                          activeDayKey === 'ALL' && styles.dayPillTextActive,
                        ]}
                      >
                        {t('booking.allDaysFilter')}
                      </Text>
                    </Pressable>
                    {[...slotDays.entries()].map(([dayKey, label]) => (
                      <Pressable
                        key={dayKey}
                        accessibilityRole="button"
                        testID={`slot-day-${dayKey}`}
                        onPress={() => setSelectedDayKey(dayKey)}
                        style={[
                          styles.dayPill,
                          activeDayKey === dayKey && styles.dayPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayPillText,
                            activeDayKey === dayKey && styles.dayPillTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.listContainer}>
                  {visibleSlots.map((slot) => {
                    const isBooking = bookingSlotId === slot.id;
                    return (
                      <View
                        key={slot.id}
                        testID={`slot-item-${slot.id}`}
                        style={[styles.slotCard, rtl ? styles.rowReverse : styles.row]}
                      >
                        <View style={styles.slotDetails}>
                          <Text style={[styles.slotTime, rtl && styles.textRtl]}>
                            {formatCairoDateTime(slot.startsAt, lang)}
                          </Text>
                          <Text style={[styles.slotClinic, rtl && styles.textRtl]}>
                            {pickLocalized(slot.clinic.name, lang)} ({t('common.building')}{' '}
                            {slot.clinic.building}, {t('common.floor')} {slot.clinic.floor})
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          testID={`book-slot-${slot.id}`}
                          disabled={bookingSlotId !== null}
                          onPress={() => void handleBookSlot(slot)}
                          style={[
                            styles.bookButton,
                            bookingSlotId !== null && styles.disabledButton,
                          ]}
                        >
                          {isBooking ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Text style={styles.bookButtonText}>
                              {t('booking.bookSlotButton')}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        ) : null}
      </View>

      {/* My Appointments section */}
      <View style={styles.sectionCard}>
        <Text style={[styles.sectionTitle, rtl && styles.textRtl]}>
          {t('booking.myAppointmentsSectionTitle')}
        </Text>

        <View style={[styles.tabsRow, rtl ? styles.rowReverse : styles.row]}>
          <Pressable
            accessibilityRole="button"
            testID="appointments-upcoming-tab"
            onPress={() => setAppointmentsTab('upcoming')}
            style={[
              styles.tabButton,
              appointmentsTab === 'upcoming' && styles.tabButtonActive,
            ]}
          >
            <Text
              style={[
                styles.tabButtonText,
                appointmentsTab === 'upcoming' && styles.tabButtonTextActive,
              ]}
            >
              {t('booking.upcomingTab')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            testID="appointments-past-tab"
            onPress={() => setAppointmentsTab('past')}
            style={[styles.tabButton, appointmentsTab === 'past' && styles.tabButtonActive]}
          >
            <Text
              style={[
                styles.tabButtonText,
                appointmentsTab === 'past' && styles.tabButtonTextActive,
              ]}
            >
              {t('booking.pastTab')}
            </Text>
          </Pressable>
        </View>

        {loadingAppointments ? (
          <ActivityIndicator testID="appointments-loading" />
        ) : appointments.length === 0 ? (
          <Text style={[styles.emptyText, rtl && styles.textRtl]} testID="no-appointments-text">
            {appointmentsTab === 'upcoming'
              ? t('booking.noUpcomingAppointments')
              : t('booking.noPastAppointments')}
          </Text>
        ) : (
          <View style={styles.listContainer}>
            {appointments.map((appt) => (
              <View key={appt.id} testID={`appointment-card-${appt.id}`} style={styles.apptCard}>
                <View style={[styles.apptHeader, rtl ? styles.rowReverse : styles.row]}>
                  <Text style={[styles.apptDoctor, rtl && styles.textRtl]}>{appt.doctor.name}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{t(`status.${appt.status}`)}</Text>
                  </View>
                </View>
                <Text style={[styles.apptLine, rtl && styles.textRtl]}>
                  {t('booking.clinicLabel')}: {pickLocalized(appt.clinic.name, lang)}
                </Text>
                <Text style={[styles.apptLine, rtl && styles.textRtl]}>
                  {t('booking.timeLabel')}: {formatCairoDateTime(appt.startsAt, lang)}
                </Text>
                <Text style={[styles.apptDirections, rtl && styles.textRtl]}>
                  {pickLocalized(appt.clinic.directions, lang)}
                </Text>
              </View>
            ))}
          </View>
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
  dayFilterRow: {
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  dayPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  dayPillActive: {
    borderColor: '#0B5CAB',
    backgroundColor: '#0B5CAB',
  },
  dayPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dayPillTextActive: {
    color: '#FFFFFF',
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
  brand: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0B5CAB',
  },
  userName: {
    fontSize: 14,
    color: '#475569',
    marginTop: 2,
  },
  headerActions: {
    alignItems: 'center',
    gap: 8,
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
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#B91C1C',
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
  successBox: {
    backgroundColor: '#ECFDF3',
    borderColor: '#A6F4C5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  successText: {
    color: '#027A48',
    fontSize: 14,
    fontWeight: '600',
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
  stepBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  stepHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  linkText: {
    color: '#0B5CAB',
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: {
    gap: 8,
  },
  choiceItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  choiceItemSelected: {
    borderColor: '#0B5CAB',
    backgroundColor: '#EBF5FF',
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
  },
  choiceTitleSelected: {
    color: '#0B5CAB',
  },
  choiceSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  slotCard: {
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  slotDetails: {
    flex: 1,
  },
  slotTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  slotClinic: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  bookButton: {
    backgroundColor: '#0B5CAB',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  tabsRow: {
    gap: 8,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  tabButtonActive: {
    borderColor: '#0B5CAB',
    backgroundColor: '#0B5CAB',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    paddingVertical: 8,
  },
  apptCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  apptHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  apptDoctor: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
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
  apptLine: {
    fontSize: 13,
    color: '#334155',
    marginTop: 2,
  },
  apptDirections: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
});
