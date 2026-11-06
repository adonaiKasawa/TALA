import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { eventId, type FeedItem, type Send } from './api';
import { FeedPlayer } from './FeedPlayer';
import { SocialActions } from './SocialActions';
import { feedStyles as s } from './styles';
import { WatchTracker } from './watch-tracker';
import { useVideoSocial } from './useVideoSocial';
export function FeedCard({
  item,
  active,
  preload,
  height,
  saver,
  signedIn,
  send,
  initialPosition,
  creator,
  tag,
}: {
  item: FeedItem;
  active: boolean;
  preload: boolean;
  height: number;
  saver: boolean;
  signedIn: boolean;
  send: Send;
  initialPosition?: number;
  removed: () => void;
  creator: (name: string) => void;
  tag: (value: string) => void;
}) {
  const tracker = useRef<WatchTracker | null>(null),
    [panel, setPanel] = useState(false),
    [audio, setAudio] = useState(false);
  const social = useVideoSocial(item, send, active);
  useEffect(() => {
    if (!active || !signedIn || panel) return;
    let alive = true,
      session: WatchTracker | undefined;
    const id = eventId();
    send('/watch/impressions', 'POST', {
      id,
      videoId: item.id,
      surface: item.kind,
    })
      .then(() => {
        if (!alive) return;
        session = new WatchTracker(body => send('/watch/' + id, 'PUT', body));
        tracker.current = session;
      })
      .catch(() => {});
    return () => {
      alive = false;
      session?.finish();
      tracker.current = null;
    };
  }, [active, signedIn, panel, item.id, item.kind, send]);
  return (
    <View style={[s.card, { height }]} accessibilityLabel={item.title}>
      {active || (preload && !saver) ? (
        <FeedPlayer
          id={item.id}
          active={active && !panel}
          saver={saver}
          send={send}
          initialPosition={initialPosition}
          onDoubleTap={() => social.like()}
          onSample={(seconds, playing) =>
            tracker.current?.sample(seconds, playing)
          }
          onEvent={event => tracker.current?.emit(event)}
        />
      ) : (
        <View style={s.player} />
      )}
      <View style={s.caption}>
        <Pressable
          accessibilityRole="button"
          onPress={() => creator(item.creator.username)}
        >
          <Text style={s.title}>@{item.creator.username}</Text>
        </Pressable>
        <Text style={s.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={s.text} numberOfLines={2}>
          {item.description}
        </Text>
        <ScrollView
          horizontal
          style={s.tagScroll}
          contentContainerStyle={s.tags}
          accessibilityLabel="Hashtags et mentions"
        >
          {item.hashtags.map(value => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => tag(value)}
            >
              <Text style={s.text}>#{value}</Text>
            </Pressable>
          ))}
          {Array.from(
            new Set(
              Array.from(
                item.description.matchAll(/@([a-zA-Z0-9_]{3,30})/g),
                m => m[1],
              ),
            ),
          )
            .slice(0, 10)
            .map(name => (
              <Pressable
                key={name}
                accessibilityRole="button"
                onPress={() => creator(name)}
              >
                <Text style={s.text}>@{name}</Text>
              </Pressable>
            ))}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={() => setAudio(v => !v)}>
          <Text style={s.text}>♫ Son original · @{item.audio.creator}</Text>
        </Pressable>
        {audio && (
          <Text style={s.text}>
            Audio de cette vidéo, attribué à @{item.audio.creator}.
          </Text>
        )}
      </View>
      {active && (
        <SocialActions
          item={item}
          send={send}
          social={social}
          creator={() => creator(item.creator.username)}
          panelChanged={setPanel}
        />
      )}
    </View>
  );
}
