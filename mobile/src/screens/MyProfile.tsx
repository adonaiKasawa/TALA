import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { request } from '../services/session';
import { Button } from '../components/ui';
import { ProfileScreen } from './ProfileScreen';
import { VideoGrid, type GridItem } from './VideoGrid';
import type { Profile } from '../types';
type Library = {
  items: GridItem[];
  stats: {
    videos: number;
    reposts: number;
    favorites: number;
    followers: number;
    following: number;
  };
};
export function MyProfile({
  profile,
  reload,
  account,
  preview,
  library,
}: {
  profile: Profile | null;
  reload: () => Promise<void>;
  account: () => void;
  preview: () => void;
  library: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [tab, setTab] = useState<'videos' | 'reposts' | 'favorites'>('videos'),
    [data, setData] = useState<Library | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!profile) return;
    setLoading(true);
    setData(null);
    request('/me/library?tab=' + tab)
      .then(value => {
        if (alive) {
          setData(value as Library);
          setError('');
        }
      })
      .catch(e => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, profile]);
  if (!profile || editing)
    return (
      <View style={s.flex}>
        {profile && (
          <Button
            title="Retour au profil"
            secondary
            onPress={() => setEditing(false)}
          />
        )}
        <ProfileScreen
          profile={profile}
          reload={async () => {
            await reload();
            setEditing(false);
          }}
          preview={preview}
        />
      </View>
    );
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.top}>
        <Text style={s.username}>@{profile.username}</Text>
        <Button secondary title="Compte" onPress={account} />
      </View>
      <View style={s.identity}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={s.avatar} />
        ) : (
          <View style={s.avatar}>
            <Text style={s.initial}>{profile.displayName[0]}</Text>
          </View>
        )}
        <Text style={s.name}>{profile.displayName}</Text>
        <Text style={s.bio}>{profile.bio}</Text>
      </View>
      <View style={s.stats}>
        {[
          ['Abonnements', data?.stats.following],
          ['Abonnés', data?.stats.followers],
          ['Republications', data?.stats.reposts],
        ].map(([label, count]) => (
          <View key={label} style={s.stat}>
            <Text style={s.count}>{count ?? '—'}</Text>
            <Text style={s.muted}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={s.actions}>
        <Button
          secondary
          title="Modifier le profil"
          onPress={() => setEditing(true)}
        />
        <Button secondary title="Mes brouillons" onPress={library} />
      </View>
      <View style={s.tabs}>
        {(['videos', 'reposts', 'favorites'] as const).map(value => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[s.tab, tab === value && s.selected]}
          >
            <Text style={s.label}>
              {
                {
                  videos: 'Vidéos',
                  reposts: 'Republications',
                  favorites: 'Favoris',
                }[value]
              }{' '}
              {data && tab === value ? ' ' + data.stats[value] : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'favorites' && (
        <Text style={s.muted}>Vos favoris restent privés.</Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {loading ? (
        <Text style={s.muted}>Chargement…</Text>
      ) : data?.items.length ? (
        <>
          <VideoGrid items={data.items} signedIn />
          <Text style={s.footnote}>Vues enregistrées par TALA.</Text>
        </>
      ) : (
        <Text style={s.empty}>
          {
            {
              videos: 'Vos vidéos apparaîtront ici.',
              reposts: 'Vos republications apparaîtront ici.',
              favorites:
                'Enregistrez vos vidéos préférées pour les retrouver ici.',
            }[tab]
          }
        </Text>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingBottom: 32, gap: 20 },
  top: {
    paddingHorizontal: 20,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  username: { color: '#fff', fontWeight: '700', fontSize: 20 },
  identity: { alignItems: 'center', paddingHorizontal: 24, gap: 10 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#30271c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontSize: 36, color: '#ffc64b' },
  name: { fontSize: 24, fontWeight: '800', color: '#fff' },
  bio: { color: '#ccc', textAlign: 'center', lineHeight: 20 },
  stats: { flexDirection: 'row', justifyContent: 'space-evenly' },
  stat: { alignItems: 'center', gap: 4 },
  count: { fontSize: 20, fontWeight: '700', color: '#fff' },
  muted: { color: '#a4a4a8', fontSize: 12, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#303236',
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  selected: { borderBottomColor: '#ffc64b' },
  label: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { color: '#a4a4a8', textAlign: 'center', padding: 40, lineHeight: 22 },
  error: { color: '#ff9db2', padding: 16 },
  footnote: { color: '#888', fontSize: 10, textAlign: 'center' },
});
