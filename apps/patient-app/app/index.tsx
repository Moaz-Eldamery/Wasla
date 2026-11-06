import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { getSessionToken, subscribeAuth } from '../lib/api';
import '../translations/i18n';

export default function Index() {
  const [token, setToken] = useState<string | null>(getSessionToken);

  useEffect(() => {
    return subscribeAuth(() => {
      setToken(getSessionToken());
    });
  }, []);

  if (token) {
    return <Redirect href="/(tabs)/book" />;
  }
  return <Redirect href="/(auth)/login" />;
}
