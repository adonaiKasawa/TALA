import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action, Button, confirm, styles } from '../components/ui';
import type { Send } from './api';
import { feedStyles as s } from './styles';
import { ToastProvider } from '../components/Toast';
type Row = {
  videoId?: string;
  title?: string;
  kind: string;
  positionMs?: number;
  username?: string;
  displayName?: string;
};
export function Library({
  mode,
  send,
  close,
  resume,
}: {
  mode: 'history' | 'controls';
  send: Send;
  close: () => void;
  resume: (id: string, kind: string, position: number) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState('');
  const path = mode === 'history' ? '/me/history' : '/me/creator-controls';
  const load = useCallback(async () => {
    const r = await send<{ items: Row[] }>(path);
    setRows(r.items);
    setError('');
  }, [send, path]);
  useEffect(() => {
    load().catch(e => setError(e.message));
  }, [load]);
  return (
    <Modal animationType="slide" onRequestClose={close}>
      <ToastProvider>
        <SafeAreaView style={s.flex}>
          <ScrollView style={s.modal}>
            <Text style={styles.title}>
              {mode === 'history'
                ? 'Votre historique'
                : 'Contrôles des créateurs'}
            </Text>
            <Button title="Fermer" onPress={close} />
            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {!rows.length && (
              <Text style={styles.text}>Aucun élément à afficher.</Text>
            )}
            {rows.map((r, i) => (
              <View key={r.videoId || r.username! + i} style={s.comment}>
                {mode === 'history' ? (
                  <Button
                    secondary
                    title={`${r.title} — Reprendre à ${Math.floor(
                      (r.positionMs || 0) / 1000,
                    )} s`}
                    onPress={() =>
                      resume(r.videoId!, r.kind, (r.positionMs || 0) / 1000)
                    }
                  />
                ) : (
                  <>
                    <Text style={styles.text}>
                      @{r.username} ·{' '}
                      {
                        (
                          {
                            block: 'Bloqué',
                            mute: 'Masqué',
                            restrict: 'Restreint',
                            not_interested: 'Pas intéressé — ' + r.title,
                          } as Record<string, string>
                        )[r.kind]
                      }
                    </Text>
                    <Action
                      title="Retirer ce contrôle"
                      work={async () => {
                        await send(
                          r.kind === 'not_interested'
                            ? `/videos/${r.videoId}/reactions/not_interested`
                            : `/creators/${r.username}/relations/${r.kind}`,
                          'DELETE',
                        );
                        await load();
                      }}
                    />
                  </>
                )}
              </View>
            ))}
            {mode === 'history' && (
              <>
                <Text style={styles.small}>
                  Historique privé conservé 90 jours.
                </Text>
                <Action
                  title="Effacer l’historique"
                  work={async () => {
                    if (
                      await confirm(
                        'Effacer l’historique ?',
                        'Vos positions de lecture seront supprimées.',
                      )
                    ) {
                      await send('/me/history', 'DELETE');
                      await load();
                    }
                  }}
                />
              </>
            )}
            {!!error && <Action title="Réessayer" work={load} />}
          </ScrollView>
        </SafeAreaView>
      </ToastProvider>
    </Modal>
  );
}
export function Creator({
  username,
  send,
  close,
  videos,
}: {
  username: string;
  send: Send;
  close: () => void;
  videos: (kind: string) => void;
}) {
  const [profile, setProfile] = useState<{
      displayName: string;
      username: string;
      bio?: string;
      isPrivate: boolean;
    } | null>(null),
    [rows, setRows] = useState<{ username: string; displayName: string }[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    send<typeof profile>(`/profiles/${username}`)
      .then(r => {
        if (alive) setProfile(r);
      })
      .catch(e => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [send, username]);
  return (
    <Modal animationType="slide" onRequestClose={close}>
      <ToastProvider>
        <SafeAreaView style={s.flex}>
          <ScrollView style={s.modal}>
            <Button title="Fermer le profil" onPress={close} />
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {profile && (
              <>
                <Text style={styles.title}>{profile.displayName}</Text>
                <Text style={styles.text}>@{profile.username}</Text>
                <Text style={styles.text}>
                  {profile.isPrivate ? 'Profil privé.' : profile.bio}
                </Text>
                {!profile.isPrivate && (
                  <>
                    <Button
                      title="Shorts du créateur"
                      onPress={() => videos('short')}
                    />
                    <Button
                      title="Vidéos longues du créateur"
                      onPress={() => videos('long')}
                    />
                    {(['followers', 'following'] as const).map(kind => (
                      <Action
                        key={kind}
                        title={
                          kind === 'followers'
                            ? 'Voir les abonnés'
                            : 'Voir les abonnements'
                        }
                        work={async () => {
                          const r = await send<{ items: typeof rows }>(
                            `/creators/${username}/${kind}`,
                          );
                          setRows(r.items);
                        }}
                      />
                    ))}
                    {rows.map(r => (
                      <Text key={r.username} style={styles.text}>
                        @{r.username} · {r.displayName}
                      </Text>
                    ))}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </ToastProvider>
    </Modal>
  );
}
