import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { logout } from '../lib/api';
import { getAppLanguage, isRtlLanguage, toggleAppLanguage, useTranslation } from '../translations/i18n';

interface ScreenHeaderProps {
  title: string;
  /** A smaller line under the title, for example the patient's name. */
  subtitle?: string;
}

/** The header every tab shares: the screen title, the language switch and logout. */
export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const rtl = isRtlLanguage(getAppLanguage());

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View style={[styles.header, rtl ? styles.rowReverse : styles.row]}>
      <View style={styles.titleBlock}>
        <Text style={[styles.title, rtl && styles.textRtl]} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, rtl && styles.textRtl]} testID="screen-header-subtitle">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.actions, rtl ? styles.rowReverse : styles.row]}>
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
  );
}

const styles = StyleSheet.create({
  header: {
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  row: { flexDirection: 'row' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  titleBlock: {
    flexShrink: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0B5CAB',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginTop: 2,
  },
  actions: {
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
});
