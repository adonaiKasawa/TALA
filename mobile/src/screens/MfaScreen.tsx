import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import {
  Action,
  Field,
  Screen,
  Section,
  confirm,
  styles,
} from '../components/ui';
import { request } from '../services/session';
import type { Receipt } from './SecurityScreen';
export function MfaScreen({
  enabled,
  receipt,
}: {
  enabled: boolean;
  receipt: (data: Receipt) => void;
}) {
  const [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const fields = (
    <>
      <Field
        label="Mot de passe actuel, si vous en avez un"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />
      <Field
        label="Code de vérification ou de secours"
        value={code}
        onChangeText={setCode}
        autoComplete="one-time-code"
        maxLength={64}
      />
    </>
  );
  return (
    <Screen
      title="Double vérification"
      subtitle="Un code temporaire protège votre compte en plus du mot de passe."
    >
      {!enabled ? (
        <>
          <Section title="Préparer votre application">
            <Field
              label="Mot de passe actuel, si vous en avez un"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Action
              title="Préparer la double vérification"
              work={async () => {
                setSetup(
                  (await request('/account/mfa/enroll', 'identity', 'POST', {
                    password: password || undefined,
                  })) as { secret: string; uri: string },
                );
              }}
            />
          </Section>
          {setup && (
            <Section title="Ajouter TALA dans votre application">
              <Text style={styles.text}>
                Ouvrez votre application d’authentification ou choisissez «
                Saisir une clé » avec la clé ci-dessous.
              </Text>
              <Text selectable style={styles.code}>
                {setup.secret}
              </Text>
              <Action
                title="Ouvrir mon application d’authentification"
                work={async () => {
                  try { await Linking.openURL(setup.uri); }
                  catch { throw new Error('Ouvrez votre application d’authentification et saisissez la clé affichée ci-dessus.'); }
                }}
              />
              <Field
                label="Code de votre application"
                value={code}
                onChangeText={setCode}
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
              />
              <Action
                title="Activer la double vérification"
                work={async () => {
                  const result = (await request(
                    '/account/mfa/confirm',
                    'identity',
                    'POST',
                    { code },
                  )) as { recoveryCodes: string[] };
                  setSetup(null);
                  setPassword('');
                  setCode('');
                  receipt({
                    title: 'Votre double vérification est activée',
                    codes: result.recoveryCodes,
                  });
                }}
              />
            </Section>
          )}
        </>
      ) : (
        <Section title="Double vérification activée">
          {fields}
          <Action
            title="Renouveler mes codes de secours"
            work={async () => {
              const result = (await request(
                '/account/mfa/recovery-codes',
                'identity',
                'POST',
                { password: password || undefined, code },
              )) as { recoveryCodes: string[] };
              receipt({
                title: 'Vos nouveaux codes de secours',
                codes: result.recoveryCodes,
              });
            }}
          />
          <View style={styles.divider}>
            <Action
              danger
              title="Désactiver la double vérification"
              work={async () => {
                if (
                  !(await confirm(
                    'Désactiver la protection ?',
                    'Votre compte ne demandera plus de code supplémentaire.',
                  ))
                )
                  return false;
                await request('/account/mfa/disable', 'identity', 'POST', {
                  password: password || undefined,
                  code,
                });
                receipt({ title: 'Votre double vérification est désactivée' });
              }}
            />
          </View>
        </Section>
      )}
    </Screen>
  );
}
