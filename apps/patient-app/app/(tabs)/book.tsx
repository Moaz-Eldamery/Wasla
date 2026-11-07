import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dropdown, type DropdownOption } from '../../components/Dropdown';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  ApiClientError,
  bookAppointment,
  getCurrentUser,
  listDepartmentDoctors,
  listDepartments,
  listDoctorFreeSlots,
  type Department,
  type Doctor,
  type Slot,
} from '../../lib/api';
import {
  formatCairoShortDay,
  formatCairoTime,
  getAppLanguage,
  getCairoDayKey,
  isRtlLanguage,
  pickLocalized,
  translateErrorCode,
  useTranslation,
} from '../../translations/i18n';

/** Booking: Department → Doctor → Day → Time, then one Book button. */
export default function BookScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);
  const user = getCurrentUser();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);

  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const showError = useCallback((err: unknown) => {
    setErrorMessage(
      translateErrorCode(err instanceof ApiClientError ? err.code : 'INTERNAL'),
    );
  }, []);

  // Only the latest pick may fill the next list, so a slow answer for a
  // department or doctor the patient already changed can't replace it.
  const latestDepartment = useRef<string | null>(null);
  const latestDoctor = useRef<string | null>(null);

  const loadSlots = useCallback(
    async (id: string) => {
      latestDoctor.current = id;
      setLoadingSlots(true);
      try {
        const data = await listDoctorFreeSlots(id);
        if (latestDoctor.current === id) setSlots(data);
      } catch (err) {
        if (latestDoctor.current === id) showError(err);
      } finally {
        if (latestDoctor.current === id) setLoadingSlots(false);
      }
    },
    [showError],
  );

  const selectDoctor = useCallback(
    (id: string) => {
      setDoctorId(id);
      setDayKey(null);
      setSlotId(null);
      setSlots([]);
      void loadSlots(id);
    },
    [loadSlots],
  );

  const selectDepartment = useCallback(
    async (id: string) => {
      latestDepartment.current = id;
      latestDoctor.current = null;
      setDepartmentId(id);
      setDoctorId(null);
      setDoctors([]);
      setDayKey(null);
      setSlotId(null);
      setSlots([]);
      setLoadingSlots(false);
      setLoadingDoctors(true);
      const isCurrent = () => latestDepartment.current === id;
      try {
        const data = await listDepartmentDoctors(id);
        if (!isCurrent()) return;
        setDoctors(data);
        // Only one doctor: nothing to choose, so pick them.
        if (data.length === 1) selectDoctor(data[0].id);
      } catch (err) {
        if (isCurrent()) showError(err);
      } finally {
        if (isCurrent()) setLoadingDoctors(false);
      }
    },
    [selectDoctor, showError],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingDepartments(true);
      try {
        const data = await listDepartments('CLINICAL');
        if (cancelled) return;
        setDepartments(data);
        if (data.length === 1) void selectDepartment(data[0].id);
      } catch (err) {
        if (!cancelled) showError(err);
      } finally {
        if (!cancelled) setLoadingDepartments(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectDepartment, showError]);

  // The days that still have free slots, in slot order.
  const dayOptions = useMemo<DropdownOption[]>(() => {
    const days = new Map<string, string>();
    for (const slot of slots) {
      const key = getCairoDayKey(slot.startsAt);
      if (!days.has(key)) days.set(key, formatCairoShortDay(slot.startsAt, lang));
    }
    return [...days.entries()].map(([value, label]) => ({ value, label }));
  }, [slots, lang]);

  // A chosen day or time that has since been taken drops back to "not chosen".
  // A list with a single entry is chosen for the patient.
  const activeDayKey =
    dayOptions.find((d) => d.value === dayKey)?.value ??
    (dayOptions.length === 1 ? dayOptions[0].value : null);

  const daySlots = useMemo(
    () => (activeDayKey ? slots.filter((s) => getCairoDayKey(s.startsAt) === activeDayKey) : []),
    [slots, activeDayKey],
  );
  const timeOptions = useMemo<DropdownOption[]>(
    () =>
      daySlots.map((slot) => ({
        value: slot.id,
        label: `${formatCairoTime(slot.startsAt, lang)} – ${formatCairoTime(slot.endsAt, lang)}`,
        sublabel: pickLocalized(slot.clinic.name, lang),
      })),
    [daySlots, lang],
  );
  const selectedSlot =
    daySlots.find((s) => s.id === slotId) ?? (daySlots.length === 1 ? daySlots[0] : null);

  const clearMessages = () => {
    setErrorMessage(null);
    setBooked(false);
  };

  const handleBook = async () => {
    if (!selectedSlot || !doctorId) return;
    clearMessages();
    setBooking(true);
    try {
      await bookAppointment(selectedSlot.id);
      setBooked(true);
      setDayKey(null);
      setSlotId(null);
    } catch (err) {
      showError(err);
      setSlotId(null);
    } finally {
      setBooking(false);
    }
    // Booked or taken by someone else: either way the free slots changed.
    await loadSlots(doctorId);
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16 },
        rtl ? styles.rtl : styles.ltr,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        title={t('booking.screenTitle')}
        subtitle={user ? t('booking.greeting', { name: user.name }) : undefined}
      />

      {errorMessage ? (
        <View style={styles.errorBox} testID="booking-error">
          <Text style={[styles.errorText, rtl && styles.textRtl]}>{errorMessage}</Text>
        </View>
      ) : null}

      {booked ? (
        <View style={styles.successBox} testID="booking-success">
          <Text style={[styles.successText, rtl && styles.textRtl]}>
            {t('booking.bookingSuccess')}
          </Text>
          <Pressable
            accessibilityRole="link"
            testID="booking-see-visit"
            onPress={() => router.push('/(tabs)/visit')}
          >
            <Text style={[styles.successLink, rtl && styles.textRtl]}>
              {t('booking.seeInMyVisit')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        {loadingDepartments ? (
          <ActivityIndicator testID="departments-loading" />
        ) : (
          <>
            <Dropdown
              testID="department-dropdown"
              label={t('booking.departmentLabel')}
              placeholder={t('booking.departmentPlaceholder')}
              emptyText={t('booking.noDepartments')}
              options={departments.map((d) => ({ value: d.id, label: pickLocalized(d.name, lang) }))}
              value={departmentId}
              onChange={(id) => {
                clearMessages();
                void selectDepartment(id);
              }}
            />
            <Dropdown
              testID="doctor-dropdown"
              label={t('booking.doctorLabel')}
              placeholder={t('booking.doctorPlaceholder')}
              emptyText={departmentId ? t('booking.noDoctors') : undefined}
              disabled={!departmentId}
              loading={loadingDoctors}
              options={doctors.map((d) => ({
                value: d.id,
                label: d.name,
                sublabel: d.clinics.map((c) => pickLocalized(c.name, lang)).join(' · ') || undefined,
              }))}
              value={doctorId}
              onChange={(id) => {
                clearMessages();
                selectDoctor(id);
              }}
            />
            <Dropdown
              testID="day-dropdown"
              label={t('booking.dayLabel')}
              placeholder={t('booking.dayPlaceholder')}
              emptyText={doctorId ? t('booking.noSlots') : undefined}
              disabled={!doctorId}
              loading={loadingSlots}
              options={dayOptions}
              value={activeDayKey}
              onChange={(key) => {
                clearMessages();
                setDayKey(key);
                setSlotId(null);
              }}
            />
            <Dropdown
              testID="time-dropdown"
              label={t('booking.timeLabel')}
              placeholder={t('booking.timePlaceholder')}
              disabled={!activeDayKey}
              options={timeOptions}
              value={selectedSlot?.id ?? null}
              onChange={(id) => {
                clearMessages();
                setSlotId(id);
              }}
            />

            {selectedSlot ? (
              <View style={styles.slotInfo} testID="selected-slot-info">
                <Text style={[styles.slotInfoTitle, rtl && styles.textRtl]}>
                  {pickLocalized(selectedSlot.clinic.name, lang)}
                </Text>
                <Text style={[styles.slotInfoLine, rtl && styles.textRtl]}>
                  {t('common.building')} {selectedSlot.clinic.building} · {t('common.floor')}{' '}
                  {selectedSlot.clinic.floor}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !selectedSlot || booking }}
              testID="book-button"
              disabled={!selectedSlot || booking}
              onPress={() => void handleBook()}
              style={[styles.bookButton, (!selectedSlot || booking) && styles.bookButtonDisabled]}
            >
              {booking ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.bookButtonText}>{t('booking.bookButton')}</Text>
              )}
            </Pressable>
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
  successBox: {
    backgroundColor: '#ECFDF3',
    borderColor: '#A6F4C5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  successText: {
    color: '#027A48',
    fontSize: 15,
    fontWeight: '600',
  },
  successLink: {
    color: '#0B5CAB',
    fontSize: 15,
    fontWeight: '700',
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
  slotInfo: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F0F7FF',
    marginBottom: 14,
  },
  slotInfoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  slotInfoLine: {
    fontSize: 14,
    color: '#475569',
    marginTop: 2,
  },
  bookButton: {
    backgroundColor: '#0B5CAB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bookButtonDisabled: {
    opacity: 0.45,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
