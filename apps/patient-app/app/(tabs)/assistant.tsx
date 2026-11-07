import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { getAppLanguage, isRtlLanguage, useTranslation } from '../../translations/i18n';

/** Egypt's ambulance number. */
const EMERGENCY_NUMBER = '123';

/**
 * Placeholder for the patient's AI assistant (the symptom checker in business.md).
 * Nothing is typed or sent yet: the input stays disabled until the AI is wired in.
 */
export default function AssistantScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRtlLanguage(getAppLanguage());

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }, rtl ? styles.rtl : styles.ltr]}>
      <View style={styles.padded}>
        <ScreenHeader title={t('assistant.screenTitle')} />

        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('assistant.emergencyHint')}
          testID="assistant-emergency"
          onPress={() => void Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}
          style={[styles.emergency, rtl ? styles.rowReverse : styles.row]}
        >
          <Text style={styles.emergencyIcon}>⚠</Text>
          <Text style={[styles.emergencyText, rtl && styles.textRtl]}>
            {t('assistant.emergencyBanner', { number: EMERGENCY_NUMBER })}
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.chat} contentContainerStyle={styles.padded}>
        <View
          style={[styles.bubble, rtl ? styles.bubbleRtl : styles.bubbleLtr]}
          testID="assistant-greeting"
        >
          <Text style={[styles.bubbleName, rtl && styles.textRtl]}>{t('assistant.name')}</Text>
          <Text style={[styles.bubbleText, rtl && styles.textRtl]}>{t('assistant.greeting')}</Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.inputBar,
          { paddingBottom: 12 },
          rtl ? styles.rowReverse : styles.row,
        ]}
      >
        <TextInput
          testID="assistant-input"
          editable={false}
          placeholder={t('assistant.inputPlaceholder')}
          placeholderTextColor="#94A3B8"
          accessibilityState={{ disabled: true }}
          style={[styles.input, rtl && styles.textRtl]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assistant.sendButton')}
          accessibilityState={{ disabled: true }}
          testID="assistant-send"
          disabled
          style={styles.sendButton}
        >
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  padded: {
    paddingHorizontal: 16,
  },
  ltr: { direction: 'ltr' },
  rtl: { direction: 'rtl' },
  row: { flexDirection: 'row' },
  rowReverse: { flexDirection: 'row-reverse' },
  textRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emergency: {
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  emergencyIcon: {
    fontSize: 18,
    color: '#B91C1C',
  },
  emergencyText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#B91C1C',
  },
  chat: {
    flex: 1,
    marginTop: 16,
  },
  bubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bubbleLtr: {
    alignSelf: 'flex-start',
    borderTopLeftRadius: 4,
  },
  bubbleRtl: {
    alignSelf: 'flex-end',
    borderTopRightRadius: 4,
  },
  bubbleName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0B5CAB',
    marginBottom: 4,
  },
  bubbleText: {
    fontSize: 15,
    color: '#1E293B',
    lineHeight: 21,
  },
  inputBar: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    color: '#94A3B8',
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CBD5E1',
  },
  sendText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
});
