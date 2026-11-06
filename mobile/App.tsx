import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName } from './src/components/Icon';
import { palette } from './src/components/theme';
import { Action, Button, Screen, Section, styles } from './src/components/ui';
import {
  clearSession,
  ClientError,
  request,
  restore,
  signIn,
  signOut,
} from './src/services/session';

import { MyProfile } from './src/screens/MyProfile';
import { SearchScreen } from './src/screens/SearchScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { SecurityScreen, type Receipt } from './src/screens/SecurityScreen';
import { MfaScreen } from './src/screens/MfaScreen';
import { SessionsScreen } from './src/screens/SessionsScreen';
import { ConnectionsScreen } from './src/screens/ConnectionsScreen';
import { DataScreen } from './src/screens/DataScreen';
import { PublicProfileScreen } from './src/screens/PublicProfileScreen';
import { VideosScreen } from './src/screens/VideosScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { ToastProvider } from './src/components/Toast';
import type { Identity, Profile, ViewState } from './src/types';

export default function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </SafeAreaProvider>
  );
}
function AppContent() {
  const [view, setView] = useState<ViewState | null>(null),
    [loading, setLoading] = useState(true),
    [notice, setError] = useState(''),
    [screen, setScreen] = useState('feed'),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const load = useCallback(async () => {
    if (!(await restore())) {
      setView(null);
      return;
    }
    const identity = (await request('/account/me', 'identity')) as Identity;
    let profile: Profile | null = null;
    try {
      profile = (await request('/me/profile')) as Profile;
    } catch (error) {
      if (!(error instanceof ClientError) || error.status !== 404) throw error;
    }
    setView({ identity, profile });
    setError('');
  }, []);
  useEffect(() => {
    load()
      .catch(async error => {
        setError(error.message);
        if (error instanceof ClientError && error.status === 401)
          await clearSession();
      })
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    const event = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'feed') {
        setScreen('feed');
        return true;
      }
      return false;
    });
    return () => event.remove();
  }, [screen]);
  useEffect(() => {
    const event = Linking.addEventListener('url', data => {
      if (data.url === 'tala-app://account/linked') {
        setScreen('connections');
        load().catch(error => setError(error.message));
      }
    });
    return () => event.remove();
  }, [load]);
  function showReceipt(data: Receipt) {
    setReceipt(data);
    setScreen('receipt');
  }
  async function login(register = false) {
    await signIn(register);
    setReceipt(null);
    await load();
    setScreen('feed');
  }
  async function logout() {
    try {
      await signOut();
    } finally {
      setView(null);
      setScreen('feed');
      setReceipt(null);
    }
  }
  let content;
  if (loading)
    content = (
      <Screen title="Votre espace TALA">
        <Text style={styles.subtitle} accessibilityLiveRegion="polite">
          Ouverture de votre espace…
        </Text>
      </Screen>
    );
  else if (screen === 'feed') content = <FeedScreen signedIn={!!view} />;
  else if (screen === 'search') content = <SearchScreen signedIn={!!view} />;
  else if (!view)
    content = (
      <Screen
        title="Des regards. Des liens. Des histoires."
        subtitle="Les voix qui vous ressemblent. Les histoires qui vous rapprochent. Votre prochain regard commence ici."
      >
        {notice && (
          <Text accessibilityRole="alert" style={[styles.notice, styles.error]}>
            {notice}
          </Text>
        )}
        <View style={styles.welcomeActions}>
          <Text style={styles.welcomeSignature}>CHAQUE REGARD COMPTE.</Text>
          <Action title="Se connecter" work={() => login()} />
          <Action title="Créer un compte" work={() => login(true)} />
          <Button
            secondary
            title="Découvrir les vidéos"
            onPress={() => setScreen('feed')}
          />
          <Text style={styles.small}>
            Votre compte est le même sur le web et sur mobile.
          </Text>
        </View>
      </Screen>
    );
  else if (screen === 'receipt' && receipt)
    content = (
      <Screen
        title={receipt.title}
        subtitle="Vos anciennes connexions ont été fermées. Reconnectez-vous pour continuer."
      >
        {receipt.codes && (
          <Section title="Vos codes de secours">
            <Text style={styles.text}>
              Conservez ces codes dans un endroit sûr. Un code ne peut être
              utilisé qu’une fois.
            </Text>
            {receipt.codes.map(code => (
              <Text selectable key={code} style={styles.code}>
                {code}
              </Text>
            ))}
          </Section>
        )}
        <Action
          title={
            receipt.codes
              ? 'J’ai conservé mes codes, me reconnecter'
              : 'Me reconnecter'
          }
          work={() => login()}
        />
      </Screen>
    );
  else if (screen === 'videos')
    content = <VideosScreen onDone={() => setScreen('feed')} />;
  else if (screen === 'messages') content = <MessagesScreen />;
  else if (screen === 'library')
    content = (
      <VideosScreen initialMode="library" onDone={() => setScreen('profile')} />
    );
  else if (screen === 'security')
    content = (
      <SecurityScreen
        identity={view.identity}
        navigate={setScreen}
        receipt={showReceipt}
      />
    );
  else if (screen === 'mfa')
    content = (
      <MfaScreen enabled={view.identity.mfaEnabled} receipt={showReceipt} />
    );
  else if (screen === 'sessions')
    content = <SessionsScreen receipt={showReceipt} />;
  else if (screen === 'connections')
    content = <ConnectionsScreen key={view.identity.id + screen} />;
  else if (screen === 'data')
    content = (
      <DataScreen
        profile={view.profile}
        reload={load}
        closed={() => {
          setView(null);
          setError('Votre compte et votre profil ont été supprimés.');
        }}
      />
    );
  else if (screen === 'public' && view.profile)
    content = <PublicProfileScreen username={view.profile.username} />;
  else
    content = (
      <MyProfile
        key={view.profile?.id || 'new'}
        profile={view.profile}
        reload={load}
        preview={() => setScreen('public')}
        account={() => setScreen('security')}
        library={() => setScreen('library')}
      />
    );
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!['feed', 'videos', 'profile', 'search', 'messages'].includes(
          screen,
        ) && (
          <View style={[styles.row, styles.topbar]}>
            <View style={styles.brandRow} accessible accessibilityLabel="TALA">
              <Image
                source={require('./src/assets/tala-mark.png')}
                style={styles.brandMark}
                accessibilityIgnoresInvertColors
              />
              <Text style={styles.brand}>TALA</Text>
            </View>
            {view && (
              <>
                <Button
                  title="Profil"
                  secondary
                  onPress={() => setScreen('profile')}
                />
                <Action title="Déconnexion" secondary work={logout} />
              </>
            )}
          </View>
        )}
        {content}
        {screen !== 'receipt' && screen !== 'videos' && (
          <View
            style={styles.bottomNav}
            accessibilityLabel="Navigation principale"
          >
            {(
              [
                ['feed', 'Accueil', 'home'],
                ['search', 'Recherche', 'search'],
                ['videos', 'Créer', 'plus'],
                ['messages', 'Messages', 'messages'],
                ['profile', 'Profil', 'user'],
              ] as const
            ).map(([target, label, icon]) => (
              <Pressable
                key={target}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: screen === target }}
                onPress={() =>
                  setScreen(
                    !view && !['feed', 'search'].includes(target)
                      ? 'profile'
                      : target,
                  )
                }
                style={[
                  styles.navItem,
                  target === 'videos' && styles.createNav,
                ]}
              >
                <Icon
                  name={icon as IconName}
                  tone={
                    target === 'videos'
                      ? 'dark'
                      : screen === target
                        ? 'accent'
                        : 'light'
                  }
                  size={24}
                />
                {target !== 'videos' && (
                  <Text
                    style={[
                      styles.navLabel,
                      screen === target && { color: palette.accent },
                    ]}
                  >
                    {label}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
