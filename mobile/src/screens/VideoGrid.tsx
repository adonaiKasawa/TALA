import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import { feedRequest, type Playback } from '../feed/api';
import { Button } from '../components/ui';
export type GridItem = {
  id: string;
  title: string;
  views?: number;
  kind?: string;
  status?: string;
};
export function VideoTile({
  item,
  signedIn,
  open,
}: {
  item: GridItem;
  signedIn: boolean;
  open: () => void;
}) {
  const [thumbnail, setThumbnail] = useState('');
  useEffect(() => {
    let alive = true;
    feedRequest<Playback>(signedIn, `/videos/${item.id}/playback`)
      .then(p => {
        if (alive) setThumbnail(p.thumbnail);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id, signedIn]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        item.title + ', ' + (item.views || 0) + ' vues suivies'
      }
      onPress={open}
      style={s.tile}
    >
      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <Text style={s.placeholder}>{item.title}</Text>
      )}
      <View style={s.caption}>
        <Text numberOfLines={1} style={s.white}>
          ▷ {(item.views || 0).toLocaleString('fr-FR')}
        </Text>
      </View>
    </Pressable>
  );
}
export function VideoGrid({
  items,
  signedIn,
}: {
  items: GridItem[];
  signedIn: boolean;
}) {
  const [selected, setSelected] = useState<GridItem | null>(null);
  const [visible, setVisible] = useState(12);
  return (
    <>
      <View style={s.grid}>
        {items.slice(0, visible).map(item => (
          <VideoTile
            key={item.id}
            item={item}
            signedIn={signedIn}
            open={() => setSelected(item)}
          />
        ))}
      </View>
      {items.length > visible && (
        <Button
          title="Afficher plus de vidéos"
          secondary
          onPress={() => setVisible(value => value + 12)}
        />
      )}
      {selected && (
        <VideoSheet
          item={selected}
          signedIn={signedIn}
          close={() => setSelected(null)}
        />
      )}
    </>
  );
}
export function VideoSheet({
  item,
  signedIn,
  close,
}: {
  item: GridItem;
  signedIn: boolean;
  close: () => void;
}) {
  const [playback, setPlayback] = useState<Playback | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    feedRequest<Playback>(signedIn, `/videos/${item.id}/playback`)
      .then(v => {
        if (alive) setPlayback(v);
      })
      .catch(e => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [item.id, signedIn]);
  return (
    <Modal presentationStyle="fullScreen" onRequestClose={close}>
      <SafeAreaView style={s.player}>
        <View style={s.header}>
          <Text numberOfLines={2} style={s.title}>
            {item.title}
          </Text>
          <Button title="Fermer" secondary onPress={close} />
        </View>
        {playback ? (
          <Video
            source={{ uri: playback.url }}
            style={s.flex}
            resizeMode="contain"
            controls
            repeat
            onError={() => setError('Cette vidéo ne peut pas être lue.')}
          />
        ) : null}
        {!!error && (
          <Text style={s.white} accessibilityRole="alert">
            {error}
          </Text>
        )}
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  tile: {
    width: '32.9%',
    aspectRatio: 0.7,
    backgroundColor: '#22252a',
    justifyContent: 'center',
  },
  placeholder: { color: '#aaa', padding: 8, fontSize: 11 },
  caption: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: '#0006',
  },
  white: { color: '#fff', fontSize: 12 },
  player: { flex: 1, backgroundColor: '#090a0b' },
  header: { flexDirection: 'row', padding: 16, alignItems: 'center', gap: 12 },
  title: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  flex: { flex: 1 },
});
