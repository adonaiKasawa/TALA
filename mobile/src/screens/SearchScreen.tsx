import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { feedRequest } from '../feed/api';
import { Creator } from '../feed/Library';
import { VideoGrid, type GridItem } from './VideoGrid';
type Results = {
  creators: { username: string; displayName: string }[];
  videos: GridItem[];
  hashtags: string[];
};
export function SearchScreen({ signedIn }: { signedIn: boolean }) {
  const [query, setQuery] = useState(''),
    [result, setResult] = useState<Results | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [creator, setCreator] = useState('');
  useEffect(() => {
    let alive = true;
    setResult(null);
    setError('');
    if (query.trim().length < 2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      feedRequest<Results>(
        signedIn,
        '/search?q=' + encodeURIComponent(query.trim()),
      )
        .then(data => {
          if (alive) setResult(data);
        })
        .catch(e => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, signedIn]);
  return (
    <View style={s.flex}>
      <Text style={s.title}>Rechercher</Text>
      <TextInput
        accessibilityLabel="Rechercher des vidéos, créateurs et hashtags"
        placeholder="Créateurs, vidéos, #hashtags"
        placeholderTextColor="#888"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        style={s.input}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {!!error && (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {loading && <Text style={s.muted}>Recherche…</Text>}
        {query.trim().length < 2 && (
          <Text style={s.empty}>Une idée, un créateur, une découverte.</Text>
        )}
        {result && (
          <>
            {result.creators.length > 0 && (
              <Text style={s.heading}>Créateurs</Text>
            )}
            {result.creators.map(p => (
              <Pressable
                accessibilityRole="button"
                key={p.username}
                style={s.person}
                onPress={() => setCreator(p.username)}
              >
                <Text style={s.white}>{p.displayName}</Text>
                <Text style={s.muted}>@{p.username}</Text>
              </Pressable>
            ))}
            {result.hashtags.length > 0 && (
              <Text style={s.tags}>
                {result.hashtags.map(v => '#' + v).join('   ')}
              </Text>
            )}
            {result.videos.length > 0 && <Text style={s.heading}>Vidéos</Text>}
            <VideoGrid items={result.videos} signedIn={signedIn} />
            {!result.creators.length &&
              !result.videos.length &&
              !result.hashtags.length && (
                <Text style={s.empty}>
                  Aucun résultat. Essayez un autre mot.
                </Text>
              )}
          </>
        )}
      </ScrollView>
      {!!creator && (
        <Creator
          username={creator}
          send={(path, method, body) =>
            feedRequest(signedIn, path, method, body)
          }
          close={() => setCreator('')}
          videos={async kind => {
            const username = creator;
            setCreator('');
            try {
              const page = await feedRequest<{ items: GridItem[] }>(
                signedIn,
                '/feed?kind=' +
                  kind +
                  '&creator=' +
                  encodeURIComponent(username),
              );
              setResult({ videos: page.items, creators: [], hashtags: [] });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 28, color: '#fff', fontWeight: '800', padding: 20 },
  input: {
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: '#242629',
    borderRadius: 14,
    color: '#fff',
    fontSize: 16,
  },
  content: { paddingVertical: 20, gap: 12 },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    paddingHorizontal: 20,
  },
  person: { paddingHorizontal: 20, paddingVertical: 12, gap: 4 },
  white: { color: '#fff', fontSize: 16 },
  muted: { color: '#aaa', paddingHorizontal: 20 },
  empty: { padding: 32, textAlign: 'center', color: '#aaa' },
  error: { color: '#ff9db2', padding: 20 },
  tags: { color: '#ffc64b', paddingHorizontal: 20 },
});
