import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  Switch,
  Text,
  View,
  type ListViewToken,
} from 'react-native';
import { Icon } from '../components/Icon';
import BlobUtil from 'react-native-blob-util';
import {
  feedRequest,
  type FeedItem,
  type FeedPage,
  type Send,
} from '../feed/api';
import { FeedCard } from '../feed/FeedCard';
import { Library, Creator } from '../feed/Library';
import { feedStyles as s } from '../feed/styles';
import { Button, styles } from '../components/ui';
const settingsPath = BlobUtil.fs.dirs.DocumentDir + '/tala-player.json';
export function FeedScreen({ signedIn }: { signedIn: boolean }) {
  const [kind, setKind] = useState('short'),
    [mode, setMode] = useState('latest'),
    [creatorFilter, setCreatorFilter] = useState(''),
    [tag, setTag] = useState(''),
    [video, setVideo] = useState(''),
    [position, setPosition] = useState(0);
  const [items, setItems] = useState<FeedItem[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [index, setIndex] = useState(-1),
    [height, setHeight] = useState(600),
    [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [saver, setSaver] = useState(false),
    [panel, setPanel] = useState<'history' | 'controls' | null>(null),
    [creator, setCreator] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState(false);
  const list = useRef<FlatList<FeedItem>>(null),
    loadingRef = useRef(false),
    generation = useRef(0);
  const send: Send = useCallback(
    (path, method, body) => feedRequest(signedIn, path, method, body),
    [signedIn],
  );
  const query = `kind=${kind}&mode=${mode}${
    creatorFilter ? '&creator=' + creatorFilter : ''
  }${tag ? '&tag=' + encodeURIComponent(tag) : ''}${
    video ? '&video=' + video : ''
  }`;
  const load = useCallback(
    async (after?: string) => {
      if (after && loadingRef.current) return;
      const current = after ? generation.current : ++generation.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const page = await send<FeedPage>(
          '/feed?' +
            query +
            (after ? '&cursor=' + encodeURIComponent(after) : ''),
        );
        if (current !== generation.current) return;
        setItems(old =>
          after
            ? [...old, ...page.items.filter(v => !old.some(x => x.id === v.id))]
            : page.items,
        );
        setCursor(page.nextCursor);
        setError('');
        if (!after) {
          // A replacement page is scrolled to its first item. FlatList does
          // not emit viewability again when the visible keys are unchanged.
          setIndex(page.items.length ? 0 : -1);
          list.current?.scrollToOffset({ offset: 0, animated: false });
        }
      } catch (e) {
        if (current === generation.current) setError((e as Error).message);
      } finally {
        if (current === generation.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [query, send],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    BlobUtil.fs
      .readFile(settingsPath, 'utf8')
      .then(raw => {
        const settings = JSON.parse(raw);
        setSaver(settings.saver === true);
      })
      .catch(() => {});
    const sub = AppState.addEventListener('change', state =>
      setForeground(state === 'active'),
    );
    return () => sub.remove();
  }, []);
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
      const first = viewableItems.find(v => v.isViewable);
      setIndex(first?.index ?? -1);
    },
  ).current;
  function tab(title: string, action: () => void, selected = false) {
    return (
      <Pressable
        style={[s.tab, selected && s.selected]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={action}
      >
        <Text style={[s.tabText, selected && s.selectedText]}>{title}</Text>
      </Pressable>
    );
  }
  function reset() {
    setCreatorFilter('');
    setTag('');
    setVideo('');
    setPosition(0);
  }
  return (
    <View style={s.flex}>
      <View style={s.toolbar}>
        <View style={s.feedTabs}>
          {tab(
            'Découvrir',
            () => {
              reset();
              setMode('latest');
            },
            mode === 'latest',
          )}
          {tab(
            'Abonnements',
            () => {
              reset();
              setMode('following');
            },
            mode === 'following',
          )}
          {tab(
            'Favoris',
            () => {
              reset();
              setMode('saved');
            },
            mode === 'saved',
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Options du fil"
            accessibilityState={{ expanded: preferences }}
            onPress={() => setPreferences(v => !v)}
            style={s.optionsButton}
          >
            <Icon name="settings" size={20} />
          </Pressable>
        </View>
        {preferences && (
          <View style={s.preferenceSheet}>
            <View style={s.row}>
              {tab('Historique', () => setPanel('history'))}
              {tab('Contrôles', () => setPanel('controls'))}
            </View>
            <View style={s.row}>
              {tab(
                'Shorts',
                () => {
                  setVideo('');
                  setKind('short');
                },
                kind === 'short',
              )}
              {tab(
                'Longues',
                () => {
                  setVideo('');
                  setKind('long');
                },
                kind === 'long',
              )}
              <Switch
                accessibilityLabel="Économie de données"
                value={saver}
                trackColor={{ false: '#45464a', true: '#b97734' }}
                thumbColor="#ffc64b"
                onValueChange={value => {
                  setSaver(value);
                  BlobUtil.fs
                    .writeFile(
                      settingsPath,
                      JSON.stringify({ saver: value }),
                      'utf8',
                    )
                    .catch(() => {});
                }}
              />
              <Text style={s.tabText}>Économie de données</Text>
            </View>
          </View>
        )}
        {!!(creatorFilter || tag || video) && (
          <View style={s.row}>
            <Text style={styles.small}>
              {creatorFilter
                ? '@' + creatorFilter
                : tag
                ? '#' + tag
                : 'Reprise de lecture'}
            </Text>
            {tab('Tout le fil', reset)}
          </View>
        )}
      </View>
      <View
        style={s.flex}
        onLayout={e => setHeight(Math.max(1, e.nativeEvent.layout.height))}
      >
        <FlatList
          ref={list}
          data={items}
          keyExtractor={item => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          getItemLayout={(_, i) => ({
            length: height,
            offset: height * i,
            index: i,
          })}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 75,
            minimumViewTime: 250,
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          extraData={{ index, height, saver, foreground, panel, creator }}
          renderItem={({ item, index: i }) => (
            <FeedCard
              item={item}
              active={i === index && foreground && !panel && !creator}
              preload={i === index + 1}
              height={height}
              saver={saver}
              signedIn={signedIn}
              send={send}
              initialPosition={video === item.id ? position : 0}
              removed={() => setItems(old => old.filter(v => v.id !== item.id))}
              creator={setCreator}
              tag={value => {
                reset();
                setTag(value);
              }}
            />
          )}
          onEndReachedThreshold={0.7}
          onEndReached={() => {
            if (cursor && !loading && !error) load(cursor);
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={styles.title}>
                {loading
                  ? 'Ouverture du fil…'
                  : error
                  ? 'Fil indisponible'
                  : 'Les premières histoires arrivent'}
              </Text>
              <Text
                accessibilityRole={error ? 'alert' : undefined}
                style={styles.text}
              >
                {error || 'Aucune vidéo publiée ne correspond à ce fil.'}
              </Text>
              <Button title="Réessayer" onPress={() => load()} />
            </View>
          }
          ListFooterComponent={
            items.length > 0 ? (
              <View style={s.empty}>
                {!!error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                )}
                <Button
                  secondary
                  title={
                    loading
                      ? 'Chargement…'
                      : cursor
                      ? 'Charger la suite'
                      : 'Actualiser le fil'
                  }
                  onPress={() => load(cursor || undefined)}
                />
              </View>
            ) : undefined
          }
        />
      </View>
      {!!panel && (
        <Library
          mode={panel}
          send={send}
          close={() => setPanel(null)}
          resume={(id, format, seconds) => {
            reset();
            setMode('latest');
            setVideo(id);
            setKind(format);
            setPosition(seconds);
            setPanel(null);
          }}
        />
      )}
      {!!creator && (
        <Creator
          username={creator}
          send={send}
          close={() => setCreator('')}
          videos={format => {
            reset();
            setCreatorFilter(creator);
            setKind(format);
            setMode('latest');
            setCreator('');
          }}
        />
      )}
    </View>
  );
}
