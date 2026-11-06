import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  type Recorder,
} from 'react-native-vision-camera';
import { ArtworkView } from './ArtworkView';
import { emptyArtwork, type Artwork } from './artwork';
import { Toast } from '../components/Toast';
import { useTransientMessage } from '../components/useTransientMessage';
export function CaptureScreen({
  close,
  gallery,
  captured,
}: {
  close: () => void;
  gallery: () => Promise<unknown>;
  captured: (path: string, effect: Artwork['effect']) => Promise<void>;
}) {
  const permission = useCameraPermission(),
    microphone = useMicrophonePermission();
  const [side, setSide] = useState<'front' | 'back'>('back'),
    [effect, setEffect] = useState<Artwork['effect']>('none'),
    [active, setActive] = useState(AppState.currentState === 'active'),
    [recording, setRecording] = useState(false),
    [pending, setPending] = useState(false),
    [handoff, setHandoff] = useState(false),
    [ready, setReady] = useState(false),
    [seconds, setSeconds] = useState(0),
    [area, setArea] = useState({ width: 1, height: 1 });
  const device = useCameraDevice(side),
    output = useVideoOutput({
      enableAudio: microphone.hasPermission,
      fileType: 'mp4',
    }),
    recorder = useRef<Recorder | null>(null),
    alive = useRef(true),
    requested = useRef(false),
    finishing = useRef(false);
  const [notice, show, dismiss] = useTransientMessage(6000);
  useEffect(() => {
    if (!requested.current) {
      requested.current = true;
      (async () => {
        try {
          let allowed = permission.hasPermission;
          if (!allowed && permission.canRequestPermission)
            allowed = await permission.requestPermission();
          if (
            alive.current &&
            allowed &&
            !microphone.hasPermission &&
            microphone.canRequestPermission
          )
            await microphone.requestPermission();
        } catch {
          show('Autorisez la caméra dans les réglages du téléphone.');
        }
      })();
    }
  }, [permission, microphone, show]);
  useEffect(() => {
    alive.current = true;
    const event = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state !== 'active' && recorder.current) {
        finishing.current = true;
        recorder.current.cancelRecording().catch(() => {});
        recorder.current = null;
        setRecording(false);
        setPending(false);
        show('Enregistrement interrompu. Vous pouvez recommencer.');
      }
    });
    return () => {
      alive.current = false;
      event.remove();
      recorder.current?.cancelRecording().catch(() => {});
    };
  }, [show]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds(v => v + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      if (recording) {
        await recorder.current?.stopRecording();
        return;
      }
      if (!ready) throw new Error('La caméra se prépare.');
      finishing.current = false;
      setSeconds(0);
      const current = await output.createRecorder({
        maxDuration: 180,
        maxFileSize: 500 * 1024 * 1024,
      });
      if (!alive.current) {
        await current.cancelRecording();
        return;
      }
      recorder.current = current;
      await current.startRecording(
        path => {
          if (!alive.current || finishing.current) return;
          recorder.current = null;
          setRecording(false);
          setHandoff(true);
          captured(path, effect).catch(() => {
            if (alive.current) {
              show('Impossible de préparer la prise. Réessayez.');
              setPending(false);
              setHandoff(false);
            }
          });
        },
        () => {
          if (alive.current) {
            recorder.current = null;
            setRecording(false);
            setPending(false);
            show('La prise de vue a été interrompue. Réessayez.');
          }
        },
      );
      if (alive.current) {
        setRecording(true);
        setPending(false);
      }
    } catch (error) {
      if (alive.current) {
        setPending(false);
        show(error instanceof Error ? error.message : 'Caméra indisponible.');
      }
    }
  }
  async function openGallery() {
    if (recording || pending) return;
    setPending(true);
    setHandoff(true);
    let moved = false;
    try {
      moved = (await gallery()) === true;
    } catch (error) {
      show(
        error instanceof Error
          ? error.message
          : 'Impossible d’ouvrir la galerie.',
      );
    } finally {
      if (alive.current && !moved) {
        setPending(false);
        setHandoff(false);
      }
    }
  }
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="fullScreen"
      animationType="slide"
      onRequestClose={() => {
        if (!recording && !pending) close();
      }}
    >
      <View style={s.root} onLayout={e => setArea(e.nativeEvent.layout)}>
        {permission.hasPermission && device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            outputs={[output]}
            isActive={active && !handoff}
            resizeMode="contain"
            implementationMode="compatible"
            enableNativeZoomGesture
            onStarted={() => setReady(true)}
            onStopped={() => setReady(false)}
            onError={() => {
              setReady(false);
              show(
                'Caméra indisponible. Vous pouvez importer depuis la galerie.',
              );
            }}
          />
        ) : (
          <View style={s.permission}>
            <Text style={s.title}>
              {permission.hasPermission
                ? 'Aucune caméra disponible'
                : 'Autoriser la caméra'}
            </Text>
            <Text style={s.copy}>
              Filmez votre prochain moment, ou choisissez une vidéo dans la
              galerie.
            </Text>
            {!permission.hasPermission && (
              <Pressable style={s.pill} onPress={() => Linking.openSettings()}>
                <Text style={s.white}>Ouvrir les réglages</Text>
              </Pressable>
            )}
          </View>
        )}
        <ArtworkView
          pointerEvents="none"
          art={{ ...emptyArtwork(), effect }}
          width={area.width}
          height={area.height}
        />
        <SafeAreaView style={s.chrome} pointerEvents="box-none">
          <View style={s.top}>
            <Pressable
              accessibilityLabel="Fermer la caméra"
              disabled={recording || pending}
              onPress={close}
              style={s.control}
            >
              <Text style={s.glyph}>×</Text>
            </Pressable>
            <Text style={s.white}>
              {recording ? '● ' + seconds + ' s' : 'Créer'}
            </Text>
            <Pressable
              accessibilityLabel="Changer de caméra"
              disabled={recording || pending}
              onPress={() => {
                setReady(false);
                setSide(v => (v === 'back' ? 'front' : 'back'));
              }}
              style={s.control}
            >
              <Text style={s.glyph}>↻</Text>
            </Pressable>
          </View>
          <View style={s.bottom}>
            <View style={s.effects}>
              {(['none', 'warm', 'cool', 'vignette'] as const).map(value => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={
                    'Effet ' +
                    {
                      none: 'Normal',
                      warm: 'Soleil',
                      cool: 'Azur',
                      vignette: 'Cinéma',
                    }[value]
                  }
                  disabled={recording || pending}
                  accessibilityState={{ selected: effect === value }}
                  onPress={() => setEffect(value)}
                  style={[s.pill, effect === value && s.selected]}
                >
                  <Text style={s.white}>
                    {
                      {
                        none: 'Normal',
                        warm: 'Soleil',
                        cool: 'Azur',
                        vignette: 'Cinéma',
                      }[value]
                    }
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.hint}>
              {recording
                ? 'Touchez pour terminer'
                : microphone.hasPermission
                  ? 'Vidéo · jusqu’à 3 min'
                  : 'Vidéo sans son · micro non autorisé'}
            </Text>
            <View style={s.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ouvrir la galerie"
                disabled={recording || pending}
                onPress={() => openGallery()}
                style={s.control}
              >
                <Text style={s.glyph}>▧</Text>
                <Text style={s.white}>Galerie</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  recording
                    ? 'Terminer l’enregistrement'
                    : 'Enregistrer une vidéo'
                }
                disabled={pending || !ready}
                onPress={() => toggle()}
                style={[s.shutter, (pending || !ready) && s.disabled]}
              >
                <View style={recording ? s.stop : s.record} />
              </Pressable>
              <View style={s.spacer} />
            </View>
          </View>
        </SafeAreaView>
        <Toast message={notice} dismiss={dismiss} />
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090a0b' },
  chrome: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  white: { color: '#fff', fontSize: 13, fontWeight: '600' },
  glyph: { fontSize: 32, color: '#fff' },
  control: {
    minWidth: 64,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { padding: 20, gap: 20, backgroundColor: '#090a0b99' },
  effects: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#22252a',
    borderWidth: 1,
    borderColor: '#555',
  },
  selected: { borderColor: '#ffc64b', backgroundColor: '#654a21' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  record: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#de4b2c',
  },
  stop: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#de4b2c' },
  disabled: { opacity: 0.45 },
  spacer: { width: 64 },
  hint: { color: '#fff', textAlign: 'center', fontSize: 13 },
  permission: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 20,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  copy: { color: '#bbb', textAlign: 'center', lineHeight: 22 },
});
