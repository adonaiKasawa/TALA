import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Video, {
  type VideoRef,
  type VideoTrack,
  SelectedVideoTrackType,
  SelectedTrackType,
  TextTrackType,
} from 'react-native-video';
import { Icon } from '../components/Icon';
import { feedStyles as s } from './styles';
import type { Playback, Send } from './api';
const subtitleStyle = {
  paddingBottom: 135,
  fontSize: 16,
  subtitlesFollowVideo: true,
};
type Props = {
  id: string;
  active: boolean;
  saver: boolean;
  send: Send;
  initialPosition?: number;
  onDoubleTap?: () => void;
  onSample: (position: number, playing: boolean) => void;
  onEvent: (event: string) => void;
};
export function FeedPlayer({
  id,
  active,
  saver,
  send,
  initialPosition = 0,
  onDoubleTap,
  onSample,
  onEvent,
}: Props) {
  const ref = useRef<VideoRef>(null),
    position = useRef(initialPosition),
    buffering = useRef(true),
    duration = useRef(0),
    wasPlaying = useRef(false),
    progressWidth = useRef(1);
  const [data, setData] = useState<Playback | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [paused, setPaused] = useState(false),
    [boosting, setBoosting] = useState(false),
    [settings, setSettings] = useState(false),
    [muted, setMuted] = useState(false),
    [time, setTime] = useState(0);
  const [tracks, setTracks] = useState<VideoTrack[]>([]),
    [quality, setQuality] = useState<number | null>(null),
    [captionIndex, setCaptionIndex] = useState(-1),
    [textTracks, setTextTracks] = useState<
      { index: number; title?: string; language?: string }[]
    >([]);
  const isActive = useRef(active);
  const taps = useRef(0),
    tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressTap = useRef(false),
    touchOrigin = useRef({ x: 0, y: 0 });
  function cancelGesture() {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = null;
    taps.current = 0;
    suppressTap.current = true;
    setBoosting(false);
  }
  useEffect(() => {
    if (!active) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      taps.current = 0;
      setBoosting(false);
    }
    return () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
  }, [active]);
  function togglePause() {
    setPaused(value => !value);
    onSample(position.current, false);
    onEvent(paused ? 'play' : 'pause');
  }
  function tap() {
    if (suppressTap.current || !active) return;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    taps.current += 1;
    if (taps.current === 3) {
      taps.current = 0;
      setMuted(value => !value);
      return;
    }
    tapTimer.current = setTimeout(() => {
      const count = taps.current;
      taps.current = 0;
      tapTimer.current = null;
      if (count === 2) onDoubleTap?.();
      else if (count === 1) togglePause();
    }, 280);
  }
  useEffect(() => {
    isActive.current = active;
  }, [active]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      send<Playback>(`/videos/${id}/playback`)
        .then(r => {
          if (alive) {
            setData(r);
            setError('');
          }
        })
        .catch(e => {
          if (alive) setError(e.message);
        });
    load();
    const timer = setInterval(() => {
      if (isActive.current) load();
    }, 240000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, send]);
  function seek(value: number) {
    const next = Math.max(0, Math.min(duration.current, value));
    position.current = next;
    setTime(next);
    ref.current?.seek(next);
    onSample(next, false);
    onEvent('seek');
  }
  const qualities = tracks.filter(t => t.height && (!saver || t.height <= 480));
  const selected =
    quality === null || saver
      ? { type: SelectedVideoTrackType.AUTO }
      : { type: SelectedVideoTrackType.RESOLUTION, value: quality };
  const availableText = textTracks.length
    ? textTracks
    : data?.captions.map((t, index) => ({
        index,
        title: t.label,
        language: t.language,
      })) || [];
  const source = useMemo(
    () =>
      data
        ? {
            uri: data.url,
            bufferConfig: {
              // Media3 requires minBufferMs >= both startup thresholds.
              // Set all four values so SDK defaults cannot invalidate this.
              minBufferMs: saver ? 3000 : 5000,
              maxBufferMs: saver ? 5000 : 15000,
              bufferForPlaybackMs: 1000,
              bufferForPlaybackAfterRebufferMs: 2000,
              backBufferDurationMs: 0,
            },
            textTracks: data.captions.map(t => ({
              title: t.label,
              language: t.language as 'fr',
              type: TextTrackType.VTT,
              uri: t.url,
            })),
          }
        : undefined,
    [data, saver],
  );
  return (
    <View style={s.player}>
      {data && (
        <Video
          ref={ref}
          source={source}
          style={s.video}
          resizeMode="contain"
          subtitleStyle={subtitleStyle}
          paused={!active || (paused && !boosting)}
          rate={boosting ? 2 : 1}
          muted={muted}
          repeat
          playInBackground={false}
          playWhenInactive={false}
          maxBitRate={saver ? 800000 : 0}
          selectedVideoTrack={Platform.OS === 'android' ? selected : undefined}
          selectedTextTrack={
            captionIndex >= 0
              ? { type: SelectedTrackType.INDEX, value: captionIndex }
              : { type: SelectedTrackType.DISABLED }
          }
          progressUpdateInterval={500}
          preferredForwardBufferDuration={saver ? 5 : 15}
          onLoad={e => {
            duration.current = e.duration;
            setTracks(e.videoTracks);
            setTextTracks(e.textTracks);
            if (position.current > 0)
              ref.current?.seek(Math.min(position.current, e.duration - 0.1));
            setBusy(false);
          }}
          onTextTracks={e => setTextTracks(e.textTracks)}
          onVideoTracks={e => setTracks(e.videoTracks)}
          onBuffer={e => {
            buffering.current = e.isBuffering;
            setBusy(e.isBuffering);
          }}
          onProgress={e => {
            position.current = e.currentTime;
            setTime(e.currentTime);
            const playing =
              active && (!paused || boosting) && !buffering.current;
            onSample(e.currentTime, playing);
            if (playing && !wasPlaying.current) onEvent('play');
            wasPlaying.current = playing;
          }}
          onSeek={() => onEvent('seek')}
          onEnd={() => {
            onSample(duration.current, false);
            onEvent('complete');
            onSample(0, false);
            onEvent('replay');
          }}
          onError={() => setError('La lecture a été interrompue. Réessayez.')}
        />
      )}
      <Pressable
        testID="feed-gesture-surface"
        style={s.video}
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Reprendre la vidéo' : 'Mettre en pause'}
        accessibilityHint="Double appui : j’aime. Triple appui : son. Maintenir : vitesse deux fois."
        accessibilityActions={[
          { name: 'activate', label: 'Lecture ou pause' },
          { name: 'like', label: 'J’aime' },
          { name: 'mute', label: muted ? 'Activer le son' : 'Couper le son' },
        ]}
        onAccessibilityAction={e => {
          if (e.nativeEvent.actionName === 'like') onDoubleTap?.();
          else if (e.nativeEvent.actionName === 'mute') setMuted(v => !v);
          else togglePause();
        }}
        onPressIn={e => {
          suppressTap.current = false;
          touchOrigin.current = {
            x: e.nativeEvent.pageX,
            y: e.nativeEvent.pageY,
          };
        }}
        onTouchMove={e => {
          if (
            Math.abs(e.nativeEvent.pageX - touchOrigin.current.x) > 12 ||
            Math.abs(e.nativeEvent.pageY - touchOrigin.current.y) > 12
          )
            cancelGesture();
        }}
        onTouchCancel={cancelGesture}
        onLongPress={() => {
          cancelGesture();
          setBoosting(true);
        }}
        delayLongPress={400}
        onPressOut={() => setBoosting(false)}
        onPress={tap}
      />
      {paused && !boosting && (
        <View pointerEvents="none" style={s.gestureFeedback}>
          <Icon name="play" size={54} />
        </View>
      )}
      {boosting && (
        <Text pointerEvents="none" style={s.speedFeedback}>
          ▶▶ 2×
        </Text>
      )}
      {busy && !error && (
        <Text style={[s.text, s.overlay]} accessibilityLiveRegion="polite">
          Préparation de la vidéo…
        </Text>
      )}
      {!!error && (
        <View style={s.overlay}>
          <Text style={s.text} accessibilityRole="alert">
            {error}
          </Text>
          <Pressable
            style={s.button}
            onPress={() => {
              send<Playback>(`/videos/${id}/playback`)
                .then(r => {
                  setData(r);
                  setError('');
                })
                .catch(e => setError(e.message));
            }}
          >
            <Text style={s.buttonText}>Réessayer la lecture</Text>
          </Pressable>
        </View>
      )}
      <View style={s.playerControls} pointerEvents="box-none">
        <View style={s.settingsAnchor}>
          <Pressable
            style={s.settingsToggle}
            accessibilityRole="button"
            accessibilityLabel="Réglages de lecture"
            accessibilityState={{ expanded: settings }}
            onPress={() => setSettings(v => !v)}
          >
            <Icon name="settings" size={20} />
          </Pressable>
        </View>
        <Pressable
          style={s.progress}
          onLayout={e => {
            progressWidth.current = e.nativeEvent.layout.width;
          }}
          accessibilityRole="adjustable"
          accessibilityLabel="Position de lecture"
          accessibilityValue={{
            min: 0,
            max: Math.floor(duration.current),
            now: Math.floor(time),
          }}
          accessibilityActions={[
            { name: 'increment', label: 'Avancer de dix secondes' },
            { name: 'decrement', label: 'Reculer de dix secondes' },
          ]}
          onAccessibilityAction={e =>
            seek(time + (e.nativeEvent.actionName === 'increment' ? 10 : -10))
          }
          onPress={e =>
            seek(
              (e.nativeEvent.locationX / progressWidth.current) *
                duration.current,
            )
          }
        >
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                {
                  width: `${
                    duration.current ? (time / duration.current) * 100 : 0
                  }%`,
                },
              ]}
            />
          </View>
        </Pressable>
        <View style={[s.playbackSheet, !settings && s.collapsed]}>
          <Pressable style={s.button} onPress={() => seek(time - 10)}>
            <Text style={s.buttonText}>−10 s</Text>
          </Pressable>
          <Pressable style={s.button} onPress={() => seek(time + 10)}>
            <Text style={s.buttonText}>+10 s</Text>
          </Pressable>
          <Pressable
            style={s.button}
            disabled={
              Platform.OS !== 'android' ||
              saver ||
              data?.type === 'mp4' ||
              !qualities.length
            }
            onPress={() => {
              const values = [...new Set(qualities.map(t => t.height!))];
              const next = values[values.indexOf(quality || -1) + 1];
              setQuality(next ?? null);
            }}
          >
            <Text style={s.buttonText}>
              Qualité :{' '}
              {saver
                ? 'Économie auto'
                : quality
                ? quality + 'p'
                : data?.type === 'mp4'
                ? 'Source'
                : 'Auto'}
            </Text>
          </Pressable>
          <Pressable
            testID="feed-captions"
            style={s.button}
            onPress={() => {
              const values = availableText.map(t => t.index);
              setCaptionIndex(values[values.indexOf(captionIndex) + 1] ?? -1);
            }}
          >
            <Text style={s.buttonText}>
              Sous-titres :{' '}
              {captionIndex >= 0
                ? availableText.find(t => t.index === captionIndex)?.title ||
                  'activés'
                : 'désactivés'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
