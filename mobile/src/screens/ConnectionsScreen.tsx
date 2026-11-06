import React, { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import {
  Action,
  Field,
  Screen,
  Section,
  confirm,
  styles,
} from '../components/ui';
import { config } from '../config';
import { request } from '../services/session';
export function ConnectionsScreen() {
  const [providers, setProviders] = useState<string[]>([]),
    [linked, setLinked] = useState<string[]>([]),
    [password, setPassword] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(config().issuer + '/federation/providers').then(response =>
        response.json(),
      ),
      request('/account/identities', 'identity'),
    ])
      .then(([p, l]) => {
        if (active) {
          setProviders(Array.isArray(p) ? p.map(item => item.id) : []);
          setLinked((l as { provider: string }[]).map(item => item.provider));
        }
      })
      .catch(failure => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const entries = [...new Set([...providers, ...linked])];
  return (
    <Screen
      title="Comptes associés"
      subtitle="Ajoutez un moyen de connexion externe à votre compte TALA."
    >
      {error && (
        <Text accessibilityRole="alert" style={[styles.notice, styles.error]}>
          {error}
        </Text>
      )}
      <Section title="Mes moyens de connexion">
        {!entries.length && (
          <Text style={styles.small}>
            Aucun fournisseur externe n’est disponible pour le moment.
          </Text>
        )}
        {entries.length > 0 && (
          <Field
            label="Mot de passe actuel, si vous en avez un"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        )}
        {entries.map(provider => (
          <View key={provider} style={styles.divider}>
            <Text style={styles.text}>
              {provider === 'google'
                ? 'Google'
                : provider === 'apple'
                ? 'Apple'
                : provider}
            </Text>
            <Action
              title={
                linked.includes(provider)
                  ? 'Dissocier ce compte'
                  : 'Associer ce compte'
              }
              work={async () => {
                if (linked.includes(provider)) {
                  if (
                    !(await confirm(
                      'Dissocier ce compte ?',
                      'Conservez un autre moyen de vous connecter.',
                    ))
                  )
                    return false;
                  await request(
                    `/account/identities/${provider}`,
                    'identity',
                    'DELETE',
                    { password: password || undefined },
                  );
                  setLinked(linked.filter(item => item !== provider));
                } else {
                  const result = (await request(
                    `/account/identities/${provider}/link`,
                    'identity',
                    'POST',
                    { password: password || undefined, browser: true },
                  )) as { authorizationUrl: string };
                  if (
                    !result.authorizationUrl.startsWith(config().issuer + '/')
                  )
                    throw new Error('Association indisponible.');
                  await Linking.openURL(result.authorizationUrl);
                }
              }}
            />
          </View>
        ))}
      </Section>
    </Screen>
  );
}
