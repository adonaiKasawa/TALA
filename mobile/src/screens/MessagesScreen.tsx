import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { request } from '../services/session';
import { Action, Button } from '../components/ui';
type Message = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
};
type Thread = {
  id: string;
  peer: { username: string; displayName: string };
  last: Message | null;
  unread: number;
};
type Page = {
  me: string;
  peer: Thread['peer'];
  items: Message[];
  nextCursor: string | null;
};
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : 8 + (r % 4)).toString(16);
  });
export function MessagesScreen() {
  const [threads, setThreads] = useState<Thread[]>([]),
    [selected, setSelected] = useState(''),
    [username, setUsername] = useState(''),
    [page, setPage] = useState<Page | null>(null),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const pending = useRef<{ clientId: string; text: string } | null>(null),
    generation = useRef(0);
  const activeThread = useRef(selected),
    olderLoaded = useRef(false);
  activeThread.current = selected;
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      if (selected) {
        const value = (await request(
          `/conversations/${selected}/messages`,
        )) as Page;
        if (version !== generation.current) return;
        setPage(current =>
          current && olderLoaded.current
            ? {
                ...value,
                nextCursor: current.nextCursor,
                items: [
                  ...current.items.filter(
                    old => !value.items.some(v => v.id === old.id),
                  ),
                  ...value.items,
                ],
              }
            : value,
        );
        await request(`/conversations/${selected}/read`, 'api', 'PUT');
      } else {
        const value = (await request('/me/conversations')) as {
          items: Thread[];
        };
        if (version !== generation.current) return;
        setThreads(value.items);
      }
      setError('');
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [selected]);
  useEffect(() => {
    setPage(null);
    olderLoaded.current = false;
    setLoading(true);
    setText('');
    pending.current = null;
    load();
    const timer = setInterval(() => load(), 5000);
    return () => {
      invalidate();
      clearInterval(timer);
    };
  }, [load, invalidate]);
  async function open() {
    const value = (await request('/me/conversations', 'api', 'POST', {
      username: username.trim().replace(/^@/, ''),
    })) as { id: string };
    setUsername('');
    setSelected(value.id);
  }
  async function send() {
    if (!text.trim()) return false;
    const outgoing =
      pending.current?.text === text.trim()
        ? pending.current
        : { clientId: uuid(), text: text.trim() };
    pending.current = outgoing;
    await request(
      `/conversations/${selected}/messages`,
      'api',
      'POST',
      outgoing,
    );
    if (activeThread.current !== selected) return;
    pending.current = null;
    setText('');
    await load();
  }
  return (
    <View style={s.flex}>
      <View style={s.header}>
        {selected && (
          <Button secondary title="Retour" onPress={() => setSelected('')} />
        )}
        <Text style={s.title}>{page?.peer.displayName || 'Messages'}</Text>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {selected ? (
        <>
          <FlatList
            data={page?.items || []}
            keyExtractor={v => v.id}
            contentContainerStyle={s.list}
            ListHeaderComponent={
              page?.nextCursor ? (
                <Action
                  secondary
                  title="Messages précédents"
                  work={async () => {
                    const older = (await request(
                      `/conversations/${selected}/messages?before=${page.nextCursor}`,
                    )) as Page;
                    if (activeThread.current !== selected) return;
                    olderLoaded.current = true;
                    setPage(current =>
                      current
                        ? {
                            ...current,
                            nextCursor: older.nextCursor,
                            items: [
                              ...older.items,
                              ...current.items.filter(
                                v => !older.items.some(o => o.id === v.id),
                              ),
                            ],
                          }
                        : current,
                    );
                  }}
                />
              ) : undefined
            }
            ListEmptyComponent={
              <Text style={s.empty}>
                {loading ? 'Chargement…' : 'Commencez la conversation.'}
              </Text>
            }
            renderItem={({ item }) => (
              <View
                style={[s.bubble, item.senderId === page?.me ? s.own : s.peer]}
              >
                <Text style={s.message}>{item.text}</Text>
                <Text style={s.time}>
                  {new Date(item.createdAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            )}
          />
          <View style={s.composer}>
            <TextInput
              accessibilityLabel="Votre message"
              placeholder="Votre message…"
              placeholderTextColor="#888"
              style={s.input}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
            />
            <Action title="Envoyer" work={send} />
          </View>
        </>
      ) : (
        <>
          <View style={s.newThread}>
            <TextInput
              accessibilityLabel="Pseudonyme du destinataire"
              placeholder="Écrire à @pseudonyme"
              placeholderTextColor="#888"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              style={s.input}
            />
            <Action title="Ouvrir" work={open} />
          </View>
          <FlatList
            data={threads}
            keyExtractor={v => v.id}
            ListEmptyComponent={
              <Text style={s.empty}>
                {loading
                  ? 'Chargement…'
                  : 'Vos conversations privées apparaîtront ici.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                style={s.thread}
                onPress={() => setSelected(item.id)}
              >
                <View style={s.initial}>
                  <Text style={s.initialText}>{item.peer.displayName[0]}</Text>
                </View>
                <View style={s.flex}>
                  <Text style={s.person}>{item.peer.displayName}</Text>
                  <Text numberOfLines={1} style={s.preview}>
                    {item.last?.text || 'Nouvelle conversation'}
                  </Text>
                </View>
                {item.unread > 0 && <Text style={s.badge}>{item.unread}</Text>}
              </Pressable>
            )}
          />
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', flex: 1 },
  error: { color: '#ff9db2', padding: 16 },
  newThread: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    backgroundColor: '#242629',
    borderRadius: 14,
    padding: 14,
    maxHeight: 120,
  },
  empty: { color: '#aaa', textAlign: 'center', padding: 40, lineHeight: 22 },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#242629',
  },
  initial: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#30271c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: { color: '#ffc64b', fontSize: 22, fontWeight: '700' },
  person: { color: '#fff', fontSize: 16, fontWeight: '700' },
  preview: { color: '#aaa', marginTop: 6 },
  badge: {
    color: '#0e1012',
    backgroundColor: '#ffc64b',
    padding: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  list: { padding: 16, gap: 12 },
  bubble: { maxWidth: '85%', padding: 14, borderRadius: 18, gap: 6 },
  own: { alignSelf: 'flex-end', backgroundColor: '#554022' },
  peer: { alignSelf: 'flex-start', backgroundColor: '#242629' },
  message: { color: '#fff', fontSize: 16, lineHeight: 22 },
  time: { color: '#bbb', fontSize: 10, alignSelf: 'flex-end' },
  composer: {
    padding: 12,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#303236',
  },
});
