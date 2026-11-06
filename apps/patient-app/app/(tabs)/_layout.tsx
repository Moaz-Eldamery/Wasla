import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { getSessionToken, subscribeAuth } from '../../lib/api';
import { useTranslation } from '../../translations/i18n';

export default function TabsLayout() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(getSessionToken);

  useEffect(() => {
    return subscribeAuth(() => {
      setToken(getSessionToken());
    });
  }, []);

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="book"
        options={{
          title: t('booking.tabTitle'),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: t('queue.tabTitle'),
        }}
      />
      <Tabs.Screen
        name="journey"
        options={{
          title: t('journey.tabTitle'),
        }}
      />
    </Tabs>
  );
}
