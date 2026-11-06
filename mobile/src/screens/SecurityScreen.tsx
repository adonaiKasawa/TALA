import React, { useState } from 'react';
import { Text } from 'react-native';
import {
  Action,
  Button,
  Field,
  Screen,
  Section,
  styles,
} from '../components/ui';
import { request } from '../services/session';
import type { Identity } from '../types';
export type Receipt = { title: string; codes?: string[] };
export function SecurityScreen({
  identity,
  navigate,
  receipt,
}: {
  identity: Identity;
  navigate: (screen: string) => void;
  receipt: (data: Receipt) => void;
}) {
  const [current, setCurrent] = useState(''),
    [password, setPassword] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  return (
    <Screen
      title="Paramètres du compte"
      subtitle="Vos accès et vos informations restent sous votre contrôle."
    >
      <Section title="Votre compte">
        <Text style={styles.text}>{identity.email}</Text>
        <Text style={styles.small}>
          {identity.emailVerified
            ? 'Adresse email vérifiée'
            : 'Vérification en attente'}
        </Text>
        <Text style={styles.text}>
          Double vérification :{' '}
          {identity.mfaEnabled ? 'activée' : 'non activée'}
        </Text>
      </Section>
      <Button
        secondary
        title={
          passwordOpen
            ? 'Masquer le changement de mot de passe'
            : 'Mot de passe'
        }
        onPress={() => setPasswordOpen(v => !v)}
      />
      {passwordOpen && (
        <Section title="Changer le mot de passe">
          <Field
            label="Mot de passe actuel, si vous en avez un"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoComplete="current-password"
          />
          <Field
            label="Nouveau mot de passe (12 caractères minimum)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            maxLength={128}
          />
          <Action
            title="Changer le mot de passe"
            work={async () => {
              if (password.length < 12)
                throw new Error(
                  'Choisissez un mot de passe d’au moins 12 caractères.',
                );
              await request('/account/password/change', 'identity', 'POST', {
                currentPassword: current || undefined,
                password,
              });
              setCurrent('');
              setPassword('');
              receipt({ title: 'Votre mot de passe a été changé' });
            }}
          />
        </Section>
      )}
      <Section title="Protéger mes accès">
        <Button
          secondary
          title="Double vérification et codes de secours"
          onPress={() => navigate('mfa')}
        />
        <Button
          secondary
          title="Sessions et applications autorisées"
          onPress={() => navigate('sessions')}
        />
        <Button
          secondary
          title="Comptes externes associés"
          onPress={() => navigate('connections')}
        />
      </Section>
      <Section title="Gérer mes données">
        <Button
          secondary
          title="Mes données et suppression"
          onPress={() => navigate('data')}
        />
      </Section>
    </Screen>
  );
}
