import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { getAppLanguage, subscribeLanguage, type AppLanguage } from '../translations/i18n';

export default function RootLayout() {
  const [lang, setLang] = useState<AppLanguage>(getAppLanguage);

  useEffect(() => {
    return subscribeLanguage(setLang);
  }, []);

  return <Stack key={lang} screenOptions={{ headerShown: false }} />;
}
