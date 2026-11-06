import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Action, Screen, Section, confirm, styles } from '../components/ui';
import { request } from '../services/session';
import type { Receipt } from './SecurityScreen';
type Row = {
  id: string;
  clientId?: string;
  current?: boolean;
  expiresAt: string;
};
export function SessionsScreen({
  receipt,
}: {
  receipt: (data: Receipt) => void;
}) {
  const [sessions, setSessions] = useState<Row[]>([]),
    [grants, setGrants] = useState<Row[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const result = await Promise.all([
      request('/account/sessions', 'identity'),
      request('/account/grants', 'identity'),
    ]);
    setSessions(result[0] as Row[]);
    setGrants(result[1] as Row[]);
  }, []);
  useEffect(() => {
    load()
      .catch(failure => setError(failure.message))
      .finally(() => setLoading(false));
  }, [load]);
  return (
    <Screen
      title="Mes connexions"
      subtitle="Retirez les connexions et les accès que vous ne souhaitez plus conserver."
    >
      {loading && <Text style={styles.small}>Chargement…</Text>}
      {error && (
        <Text accessibilityRole="alert" style={[styles.notice, styles.error]}>
          {error}
        </Text>
      )}
      <Section title="Sessions ouvertes">
        {!loading && !sessions.length && (
          <Text style={styles.small}>Aucune session à afficher.</Text>
        )}
        {sessions.map((row, index) => (
          <View key={row.id} style={styles.divider}>
            <Text style={styles.text}>
              {row.current ? 'Cette connexion' : `Session ${index + 1}`}
            </Text>
            <Text style={styles.small}>
              Expire le {new Date(row.expiresAt).toLocaleString('fr')}
            </Text>
            <Action
              title="Déconnecter cette session"
              work={async () => {
                if (
                  !(await confirm(
                    'Déconnecter cette session ?',
                    'Ses accès seront retirés immédiatement.',
                  ))
                )
                  return false;
                await request(
                  `/account/sessions/${encodeURIComponent(row.id)}`,
                  'identity',
                  'DELETE',
                  {},
                );
                if (row.current)
                  receipt({ title: 'Votre session a été fermée' });
                else await load();
              }}
            />
          </View>
        ))}
      </Section>
      <Section title="Applications autorisées">
        {!grants.length && (
          <Text style={styles.small}>Aucune autorisation à afficher.</Text>
        )}
        {grants.map(row => (
          <View key={row.id} style={styles.divider}>
            <Text style={styles.text}>
              {row.clientId || 'Application TALA'}
            </Text>
            <Action
              title="Retirer cette autorisation"
              work={async () => {
                if (
                  !(await confirm(
                    'Retirer cet accès ?',
                    'Vous devrez peut-être vous reconnecter.',
                  ))
                )
                  return false;
                await request(
                  `/account/grants/${encodeURIComponent(row.id)}`,
                  'identity',
                  'DELETE',
                  {},
                );
                receipt({ title: 'L’autorisation a été retirée' });
              }}
            />
          </View>
        ))}
      </Section>
      <Action
        danger
        title="Déconnecter tous mes appareils"
        work={async () => {
          if (
            !(await confirm(
              'Tout déconnecter ?',
              'Vous serez aussi déconnecté de cet appareil.',
            ))
          )
            return false;
          await request('/account/sessions/revoke-all', 'identity', 'POST', {});
          receipt({ title: 'Toutes vos sessions ont été fermées' });
        }}
      />
    </Screen>
  );
}
