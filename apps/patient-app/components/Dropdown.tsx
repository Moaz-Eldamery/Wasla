import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppLanguage, isRtlLanguage, useTranslation } from '../translations/i18n';

export interface DropdownOption {
  value: string;
  label: string;
  /** A second, smaller line under the label (for example the clinic of a time slot). */
  sublabel?: string;
}

interface DropdownProps {
  label: string;
  placeholder: string;
  options: DropdownOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Shown in place of the field when there is nothing to choose. */
  emptyText?: string;
  /** The field gets this ID; each option gets `${testID}-option-${value}`. */
  testID: string;
}

/**
 * A form field that opens a bottom sheet listing the options. Built here rather
 * than taken from a library so it looks the same on iOS and Android and follows
 * the app's right-to-left layout in Arabic.
 */
export function Dropdown({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  emptyText,
  testID,
}: DropdownProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRtlLanguage(getAppLanguage());
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;
  const isEmpty = !loading && !disabled && options.length === 0;
  const inactive = disabled || loading || options.length === 0;

  const choose = (option: DropdownOption) => {
    setOpen(false);
    if (option.value !== value) onChange(option.value);
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, rtl && styles.textRtl]}>{label}</Text>
      {isEmpty && emptyText ? (
        <Text style={[styles.emptyText, rtl && styles.textRtl]} testID={`${testID}-empty`}>
          {emptyText}
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
          accessibilityState={{ disabled: inactive, expanded: open }}
          testID={testID}
          disabled={inactive}
          onPress={() => setOpen(true)}
          style={[styles.control, rtl ? styles.rowReverse : styles.row, inactive && styles.controlDisabled]}
        >
          <View style={styles.controlText}>
            <Text
              style={[styles.value, !selected && styles.placeholder, rtl && styles.textRtl]}
              numberOfLines={1}
            >
              {selected?.label ?? placeholder}
            </Text>
            {selected?.sublabel ? (
              <Text style={[styles.sublabel, rtl && styles.textRtl]} numberOfLines={1}>
                {selected.sublabel}
              </Text>
            ) : null}
          </View>
          {loading ? (
            <ActivityIndicator size="small" testID={`${testID}-loading`} />
          ) : (
            <Text style={styles.chevron}>▾</Text>
          )}
        </Pressable>
      )}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => setOpen(false)}
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + 12 }, rtl ? styles.rtl : styles.ltr]}
          testID={`${testID}-sheet`}
        >
          <View style={[styles.sheetHeader, rtl ? styles.rowReverse : styles.row]}>
            <Text style={[styles.sheetTitle, rtl && styles.textRtl]}>{label}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              testID={`${testID}-close`}
            >
              <Text style={styles.closeText}>{t('common.close')}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.optionList}>
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  testID={`${testID}-option-${option.value}`}
                  onPress={() => choose(option)}
                  style={[styles.option, isSelected && styles.optionSelected, rtl ? styles.rowReverse : styles.row]}
                >
                  <View style={styles.controlText}>
                    <Text
                      style={[styles.optionLabel, isSelected && styles.optionLabelSelected, rtl && styles.textRtl]}
                    >
                      {option.label}
                    </Text>
                    {option.sublabel ? (
                      <Text style={[styles.sublabel, rtl && styles.textRtl]}>{option.sublabel}</Text>
                    ) : null}
                  </View>
                  {isSelected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  ltr: { direction: 'ltr' },
  rtl: { direction: 'rtl' },
  row: { flexDirection: 'row' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  control: {
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  controlDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  controlText: {
    flex: 1,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  placeholder: {
    fontWeight: '400',
    color: '#94A3B8',
  },
  sublabel: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  chevron: {
    fontSize: 16,
    color: '#64748B',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    paddingVertical: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  sheetHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0B5CAB',
  },
  optionList: {
    flexGrow: 0,
  },
  option: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  optionSelected: {
    backgroundColor: '#EBF5FF',
  },
  optionLabel: {
    fontSize: 16,
    color: '#1E293B',
  },
  optionLabelSelected: {
    fontWeight: '700',
    color: '#0B5CAB',
  },
  check: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0B5CAB',
  },
});
