import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, type ColorValue } from 'react-native';
import { getSessionToken, subscribeAuth } from '../../lib/api';
import { useTranslation } from '../../translations/i18n';

function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 18, color }}>{symbol}</Text>;
}

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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0B5CAB',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="book"
        options={{
          title: t('booking.tabTitle'),
          tabBarIcon: ({ color }) => <TabIcon symbol="📅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="visit"
        options={{
          title: t('visit.tabTitle'),
          tabBarIcon: ({ color }) => <TabIcon symbol="🧭" color={color} />,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: t('results.tabTitle'),
          tabBarIcon: ({ color }) => <TabIcon symbol="📋" color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t('assistant.tabTitle'),
          tabBarIcon: ({ color }) => <TabIcon symbol="💬" color={color} />,
        }}
      />
    </Tabs>
  );
}
