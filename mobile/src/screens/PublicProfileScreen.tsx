import React, { useEffect, useState } from 'react';
import { Image, Linking, Text } from 'react-native';
import { Button, Screen, Section, styles } from '../components/ui';
import { config } from '../config';
import type { Profile } from '../types';
export function PublicProfileScreen({ username }: { username: string }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch(`${config().api}/api/v1/profiles/${encodeURIComponent(username)}`, {
      signal: AbortSignal.timeout(10000),
    })
      .then(async response => {
        if (!response.ok) throw new Error('Ce profil est indisponible.');
        return response.json();
      })
      .then(value => {
        if (active) setProfile(value);
      })
      .catch(failure => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [username]);
  return (
    <Screen
      title="Mon profil public"
      subtitle="Voici ce que les visiteurs peuvent voir."
    >
      {error && (
        <Text accessibilityRole="alert" style={[styles.notice, styles.error]}>
          {error}
        </Text>
      )}
      {profile ? (
        <Section title={profile.displayName}>
          {profile.avatarUrl && (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={styles.avatar}
              accessibilityLabel="Photo de profil"
            />
          )}
          <Text style={styles.small}>@{profile.username}</Text>
          {profile.isPrivate ? (
            <Text style={styles.text}>
              Ce profil est privé. La biographie et les liens sont masqués.
            </Text>
          ) : (
            <>
              <Text style={styles.text}>{profile.bio}</Text>
              {profile.links.map(link => (
                <Button
                  secondary
                  key={link.url}
                  title={link.label}
                  onPress={() => Linking.openURL(link.url)}
                />
              ))}
            </>
          )}
        </Section>
      ) : (
        !error && <Text style={styles.small}>Chargement…</Text>
      )}
    </Screen>
  );
}
