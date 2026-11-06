import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiClientError, login, setPendingVerification } from '../../lib/api';
import {
  getAppLanguage,
  isRtlLanguage,
  toggleAppLanguage,
  translateErrorCode,
  useTranslation,
} from '../../translations/i18n';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMessage(null);
    const trimmedPhone = phone.trim();
    if (!trimmedPhone || !password) {
      setErrorMessage(translateErrorCode('VALIDATION_FAILED'));
      return;
    }

    setSubmitting(true);
    try {
      await login({ phone: trimmedPhone, password });
      router.replace('/(tabs)/book');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(translateErrorCode(err.code));
        if (err.code === 'PHONE_NOT_VERIFIED') {
          setPendingVerification(trimmedPhone, null);
        }
      } else {
        setErrorMessage(translateErrorCode('INTERNAL'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, rtl ? styles.rtl : styles.ltr]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.topBar, rtl ? styles.rowReverse : styles.row]}>
        <Text style={styles.brand}>{t('appName')}</Text>
        <Pressable
          accessibilityRole="button"
          testID="language-toggle-button"
          onPress={() => void toggleAppLanguage()}
          style={styles.langButton}
        >
          <Text style={styles.langButtonText}>{t('common.languageToggle')}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={[styles.title, rtl && styles.textRtl]}>{t('auth.loginTitle')}</Text>
        <Text style={[styles.subtitle, rtl && styles.textRtl]}>{t('auth.loginSubtitle')}</Text>

        {errorMessage ? (
          <View style={styles.errorBox} testID="login-error">
            <Text style={[styles.errorText, rtl && styles.textRtl]}>{errorMessage}</Text>
          </View>
        ) : null}

        <Text style={[styles.label, rtl && styles.textRtl]}>{t('auth.phoneLabel')}</Text>
        <TextInput
          testID="login-phone-input"
          value={phone}
          onChangeText={setPhone}
          placeholder={t('auth.phonePlaceholder')}
          keyboardType="phone-pad"
          autoCapitalize="none"
          style={[styles.input, rtl && styles.textRtl]}
        />

        <Text style={[styles.label, rtl && styles.textRtl]}>{t('auth.passwordLabel')}</Text>
        <TextInput
          testID="login-password-input"
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordPlaceholder')}
          secureTextEntry
          autoCapitalize="none"
          style={[styles.input, rtl && styles.textRtl]}
        />

        <Pressable
          accessibilityRole="button"
          testID="login-submit-button"
          onPress={() => void handleLogin()}
          disabled={submitting}
          style={[styles.primaryButton, submitting && styles.disabledButton]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('auth.loginButton')}</Text>
          )}
        </Pressable>

        <View style={[styles.footerRow, rtl ? styles.rowReverse : styles.row]}>
          <Text style={styles.footerText}>{t('auth.noAccountPrompt')}</Text>
          <Pressable
            accessibilityRole="button"
            testID="go-to-sign-up-button"
            onPress={() => router.push('/(auth)/sign-up')}
          >
            <Text style={styles.linkText}>{t('auth.createAccountLink')}</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          testID="go-to-verify-button"
          onPress={() => {
            if (phone.trim()) {
              setPendingVerification(phone.trim(), null);
            }
            router.push('/(auth)/verify-code');
          }}
          style={styles.secondaryLink}
        >
          <Text style={styles.linkText}>{t('auth.goToVerifyLink')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#F4F7FB',
    justifyContent: 'center',
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
  topBar: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  brand: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0B5CAB',
  },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#E3EEF9',
    borderRadius: 8,
  },
  langButtonText: {
    color: '#0B5CAB',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A2530',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#5A6878',
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderColor: '#F5B5B5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3A4B',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#FFFFFF',
    color: '#1A2530',
  },
  primaryButton: {
    backgroundColor: '#0B5CAB',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerRow: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  footerText: {
    color: '#5A6878',
    fontSize: 14,
  },
  linkText: {
    color: '#0B5CAB',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryLink: {
    alignItems: 'center',
    marginTop: 10,
  },
});
