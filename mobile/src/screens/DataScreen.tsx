import React, { useState } from 'react';
import { Share, Text } from 'react-native';
import {
  Action,
  Field,
  Screen,
  Section,
  confirm,
  styles,
} from '../components/ui';
import { clearSession, request } from '../services/session';
import type { Profile } from '../types';
export function DataScreen({
  profile,
  reload,
  closed,
}: {
  profile: Profile | null;
  reload: () => Promise<void>;
  closed: () => void;
}) {
  const [password, setPassword] = useState('');
  return (
    <Screen
      title="Mes données"
      subtitle="Vos informations et votre compte vous appartiennent."
    >
      <Section title="Exporter mes données">
        <Text style={styles.text}>
          Récupérez les informations de votre compte et de votre profil.
        </Text>
        <Action
          title="Exporter mes données"
          work={async () => {
            const identity = await request('/account/export', 'identity');
            await Share.share({
              title: 'Mes données TALA',
              message: JSON.stringify({ identity, profile }, null, 2),
            });
          }}
        />
      </Section>
      <Section title="Supprimer mon profil">
        <Text style={styles.small}>
          Votre profil public sera supprimé, mais votre compte restera
          accessible.
        </Text>
        <Action
          danger
          title="Supprimer mon profil public"
          work={async () => {
            if (
              !(await confirm(
                'Supprimer votre profil ?',
                'Votre profil et toutes vos vidéos seront supprimés définitivement.',
              ))
            )
              return false;
            await request('/me/profile', 'api', 'DELETE');
            await reload();
          }}
        />
      </Section>
      <Section title="Fermer mon compte">
        <Text style={styles.small}>
          Votre profil, vos vidéos et vos identifiants de connexion seront
          supprimés.
        </Text>
        <Field
          label="Mot de passe actuel, si vous en avez un"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Action
          danger
          title="Supprimer mon compte et mon profil"
          work={async () => {
            if (
              !(await confirm(
                'Fermer votre compte ?',
                'Votre profil, toutes vos vidéos puis votre compte de connexion seront supprimés définitivement.',
              ))
            )
              return false;
            await request('/account/reauthenticate', 'identity', 'POST', {
              password: password || undefined,
            });
            await request('/me/profile', 'api', 'DELETE');
            try {
              await request('/account/me', 'identity', 'DELETE', {
                password: password || undefined,
              });
            } catch {
              throw new Error(
                'Votre profil est supprimé. La fermeture du compte n’a pas abouti ; réessayez depuis cette page.',
              );
            }
            await clearSession();
            setPassword('');
            closed();
          }}
        />
      </Section>
    </Screen>
  );
}
