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
import {
  ApiClientError,
  getPendingVerification,
  resendVerificationCode,
  verifyPhone,
} from '../../lib/api';
import {
  getAppLanguage,
  isRtlLanguage,
  toggleAppLanguage,
  translateErrorCode,
  useTranslation,
} from '../../translations/i18n';

export default function VerifyCodeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const lang = getAppLanguage();
  const rtl = isRtlLanguage(lang);

  const pending = getPendingVerification();
  const [phone, setPhone] = useState(pending.phone ?? '');
  const [code, setCode] = useState(pending.simulatedCode ?? '');
  const [simulatedCode, setSimulatedCode] = useState<string | null>(pending.simulatedCode);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleVerify = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    const trimmedPhone = phone.trim();
    const trimmedCode = code.trim();

    if (!/^\+201[0-9]{9}$/.test(trimmedPhone) || !/^[0-9]{6}$/.test(trimmedCode)) {
      setErrorMessage(translateErrorCode('VALIDATION_FAILED'));
      return;
    }

    setSubmitting(true);
    try {
      await verifyPhone({ phone: trimmedPhone, code: trimmedCode });
      setInfoMessage(t('auth.phoneVerifiedSuccess'));
      router.replace('/(auth)/login');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(translateErrorCode(err.code));
      } else {
        setErrorMessage(translateErrorCode('INTERNAL'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    const trimmedPhone = phone.trim();
    if (!/^\+201[0-9]{9}$/.test(trimmedPhone)) {
      setErrorMessage(translateErrorCode('VALIDATION_FAILED'));
      return;
    }

    setResending(true);
    try {
      const response = await resendVerificationCode(trimmedPhone);
      if (response.simulatedCode) {
        setSimulatedCode(response.simulatedCode);
        setCode(response.simulatedCode);
      }
      setInfoMessage(t('auth.codeResent'));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(translateErrorCode(err.code));
      } else {
        setErrorMessage(translateErrorCode('INTERNAL'));
      }
    } finally {
      setResending(false);
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
        <Text style={[styles.title, rtl && styles.textRtl]}>{t('auth.verifyTitle')}</Text>
        <Text style={[styles.subtitle, rtl && styles.textRtl]}>{t('auth.verifySubtitle')}</Text>

        {simulatedCode ? (
          <View style={styles.simulatedBox} testID="simulated-code-banner">
            <Text style={[styles.simulatedText, rtl && styles.textRtl]}>
              {t('auth.simulatedCodeHint', { code: simulatedCode })}
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBox} testID="verify-error">
            <Text style={[styles.errorText, rtl && styles.textRtl]}>{errorMessage}</Text>
          </View>
        ) : null}

        {infoMessage ? (
          <View style={styles.infoBox} testID="verify-info">
            <Text style={[styles.infoText, rtl && styles.textRtl]}>{infoMessage}</Text>
          </View>
        ) : null}

        <Text style={[styles.label, rtl && styles.textRtl]}>{t('auth.phoneLabel')}</Text>
        <TextInput
          testID="verify-phone-input"
          value={phone}
          onChangeText={setPhone}
          placeholder={t('auth.phonePlaceholder')}
          keyboardType="phone-pad"
          autoCapitalize="none"
          style={[styles.input, rtl && styles.textRtl]}
        />

        <Text style={[styles.label, rtl && styles.textRtl]}>{t('auth.codeLabel')}</Text>
        <TextInput
          testID="verify-code-input"
          value={code}
          onChangeText={setCode}
          placeholder={t('auth.codePlaceholder')}
          keyboardType="number-pad"
          maxLength={6}
          style={[styles.input, rtl && styles.textRtl]}
        />

        <Pressable
          accessibilityRole="button"
          testID="verify-submit-button"
          onPress={() => void handleVerify()}
          disabled={submitting}
          style={[styles.primaryButton, submitting && styles.disabledButton]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('auth.verifyButton')}</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          testID="resend-code-button"
          onPress={() => void handleResend()}
          disabled={resending}
          style={[styles.secondaryButton, resending && styles.disabledButton]}
        >
          <Text style={styles.secondaryButtonText}>{t('auth.resendCodeButton')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          testID="back-to-login-button"
          onPress={() => router.replace('/(auth)/login')}
          style={styles.backLink}
        >
          <Text style={styles.linkText}>{t('auth.loginLink')}</Text>
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
  simulatedBox: {
    backgroundColor: '#EBF5FF',
    borderColor: '#93C5FD',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  simulatedText: {
    color: '#1E40AF',
    fontWeight: '600',
    fontSize: 14,
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
  infoBox: {
    backgroundColor: '#ECFDF3',
    borderColor: '#A6F4C5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  infoText: {
    color: '#027A48',
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
  secondaryButton: {
    backgroundColor: '#E3EEF9',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#0B5CAB',
    fontSize: 15,
    fontWeight: '600',
  },
  backLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    color: '#0B5CAB',
    fontSize: 14,
    fontWeight: '600',
  },
});
