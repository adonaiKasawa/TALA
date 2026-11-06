import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Video, { type VideoRef } from 'react-native-video';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { Toast } from '../components/Toast';
import { useTransientMessage } from '../components/useTransientMessage';
import { ArtworkView, textLayerStyle } from './ArtworkView';
import {
  clamp,
  emptyArtwork,
  fitFrame,
  hasArtwork,
  type Artwork,
  type TextLayer,
} from './artwork';
import { TrimControl } from './TrimControl';
import { clipDuration, timeLabel, type ClipEdit } from './editing';
export type Composition = {
  edit: ClipEdit;
  cover: number;
  duration: number;
  art: Artwork;
  overlay?: string;
};
type Tool =
  'text' | 'stickers' | 'draw' | 'effects' | 'trim' | 'speed' | 'cover' | null;
const colors = [
  '#ffffff',
  '#111111',
  '#ffc64b',
  '#de4b2c',
  '#9b83ff',
  '#67c6f4',
];
const titles = {
  text: 'Votre texte',
  stickers: 'Stickers',
  draw: 'Dessiner',
  effects: 'Effets',
  trim: 'Choisir votre extrait',
  speed: 'Vitesse',
  cover: 'Image de couverture',
};
export function ClipComposer({
  uri,
  initial,
  done,
  cancel,
}: {
  uri: string;
  initial?: Composition;
  done: (result: Composition) => void;
  cancel: (result: Composition) => void;
}) {
  const [edit, setEdit] = useState<ClipEdit>(
    initial?.edit || { start: 0, end: 0, speed: 1, muted: false },
  );
  const [art, setArt] = useState<Artwork>(initial?.art || emptyArtwork()),
    [duration, setDuration] = useState(initial?.duration || 0),
    [cover, setCover] = useState(initial?.cover || 0);
  const [area, setArea] = useState({ width: 1, height: 1 }),
    [source, setSource] = useState({ width: 9, height: 16 }),
    [tool, setTool] = useState<Tool>(null),
    [paused, setPaused] = useState(false),
    [cursor, setCursor] = useState(0),
    [capturing, setCapturing] = useState(false);
  const [color, setColor] = useState('#ffffff'),
    [brush, setBrush] = useState(0.014),
    [text, setText] = useState(''),
    [textId, setTextId] = useState<string | null>(null),
    [textSize, setTextSize] = useState(0.06),
    [background, setBackground] = useState<TextLayer['background']>('none');
  const [notice, showNotice, dismiss] = useTransientMessage(6000);
  const player = useRef<VideoRef>(null),
    canvas = useRef<React.ComponentRef<typeof View>>(null),
    hitbox = useRef<React.ComponentRef<typeof View>>(null),
    origin = useRef({ x: 0, y: 0 }),
    strokeId = useRef<string | null>(null),
    sequence = useRef(Date.now());
  const frame = fitFrame(area.width, area.height, source.width, source.height);
  const videoSource = useMemo(() => ({ uri }), [uri]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const result = (): Composition => ({ edit, art, duration, cover });
  function selectTool(value: Tool) {
    Keyboard.dismiss();
    if (value === 'text') {
      setText('');
      setTextId(null);
      setBackground('none');
    }
    setTool(current => (current === value ? null : value));
  }
  function addText() {
    if (!text.trim()) {
      setTool(null);
      return;
    }
    if (!textId && art.texts.length >= 8) {
      showNotice('Vous pouvez ajouter jusqu’à huit textes ou stickers.');
      return;
    }
    const layer: TextLayer = {
      id: textId || 'text-' + ++sequence.current,
      text: text.trim().slice(0, 200),
      x: 0.12,
      y: 0.42,
      size: textSize,
      color,
      background,
    };
    setArt(old => ({
      ...old,
      texts: textId
        ? old.texts.map(existing =>
            existing.id === textId
              ? { ...layer, x: existing.x, y: existing.y }
              : existing,
          )
        : [...old.texts, layer],
    }));
    setTool(null);
    Keyboard.dismiss();
  }
  function editText(layer: TextLayer) {
    setTextId(layer.id);
    setText(layer.text);
    setTextSize(layer.size);
    setColor(layer.color);
    setBackground(layer.background);
    setTool('text');
  }
  function point(pageX: number, pageY: number) {
    return {
      x: clamp((pageX - origin.current.x) / frame.width),
      y: clamp((pageY - origin.current.y) / frame.height),
    };
  }
  function begin(e: GestureResponderEvent) {
    if (art.strokes.length >= 40) {
      showNotice('Quarante traits maximum. Annulez un trait pour continuer.');
      return;
    }
    const { pageX, pageY } = e.nativeEvent;
    hitbox.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
      const id = 'stroke-' + ++sequence.current;
      strokeId.current = id;
      const p = point(pageX, pageY);
      setArt(old => ({
        ...old,
        strokes: [
          ...old.strokes,
          {
            id,
            color,
            width: brush,
            points: [p, { x: Math.min(1, p.x + 0.0001), y: p.y }],
          },
        ],
      }));
    });
  }
  function draw(e: GestureResponderEvent) {
    const id = strokeId.current;
    if (!id) return;
    const p = point(e.nativeEvent.pageX, e.nativeEvent.pageY);
    setArt(old => ({
      ...old,
      strokes: old.strokes.map(stroke => {
        if (stroke.id !== id || stroke.points.length >= 300) return stroke;
        const last = stroke.points.at(-1)!;
        if (Math.hypot(last.x - p.x, last.y - p.y) < 0.002) return stroke;
        return { ...stroke, points: [...stroke.points, p] };
      }),
    }));
  }
  function trim(start: number, end: number) {
    setEdit(old => ({ ...old, start, end }));
    setCover(value => clamp(value, start, end - 0.05));
    setCursor(start);
    player.current?.seek(start);
  }
  async function next() {
    if (!duration || capturing) return;
    setCapturing(true);
    Keyboard.dismiss();
    try {
      let overlay: string | undefined;
      if (hasArtwork(art)) {
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (!alive.current) return;
        const scale = Math.min(
          PixelRatio.get(),
          1920 / Math.max(frame.width, frame.height),
        );
        overlay = await captureRef(canvas, {
          format: 'png',
          result: 'tmpfile',
          width: Math.max(16, Math.round(frame.width * scale)),
          height: Math.max(16, Math.round(frame.height * scale)),
        });
      }
      if (!alive.current) {
        if (overlay) releaseCapture(overlay);
        return;
      }
      done({ ...result(), overlay });
    } catch {
      if (alive.current)
        showNotice('Le montage n’a pas pu être préparé. Réessayez.');
    } finally {
      if (alive.current) setCapturing(false);
    }
  }
  function cancelEditor() {
    alive.current = false;
    Keyboard.dismiss();
    cancel(result());
  }
  const closePanel = () => {
    Keyboard.dismiss();
    setTool(null);
  };
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="slide"
      onRequestClose={() => (tool ? closePanel() : cancelEditor())}
    >
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.header}>
            <Pressable
              style={s.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Fermer le montage"
              onPress={cancelEditor}
            >
              <Text style={s.close}>×</Text>
            </Pressable>
            <Text style={s.headerTitle}>Votre regard.</Text>
            <Text style={s.time}>{timeLabel(clipDuration(edit))}</Text>
          </View>
          <View
            testID="composer-stage"
            style={s.stage}
            onLayout={e =>
              setArea({
                width: Math.max(1, e.nativeEvent.layout.width),
                height: Math.max(1, e.nativeEvent.layout.height),
              })
            }
          >
            <Video
              ref={player}
              source={videoSource}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              paused={paused || capturing}
              rate={edit.speed}
              muted={edit.muted}
              onLoad={value => {
                if (!Number.isFinite(value.duration) || value.duration < 0.25) {
                  showNotice('Cette vidéo ne peut pas être montée.');
                  return;
                }
                setDuration(value.duration);
                setEdit(old =>
                  old.end ? old : { ...old, end: value.duration },
                );
                if (value.naturalSize?.width && value.naturalSize.height)
                  setSource({
                    width: value.naturalSize.width,
                    height: value.naturalSize.height,
                  });
              }}
              onProgress={value => {
                setCursor(value.currentTime);
                if (value.currentTime >= edit.end && edit.end > 0)
                  player.current?.seek(edit.start);
              }}
              onEnd={() => player.current?.seek(edit.start)}
              onError={() =>
                showNotice('La vidéo ne peut pas être prévisualisée.')
              }
            />
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel={
                paused ? 'Lire l’aperçu' : 'Mettre l’aperçu en pause'
              }
              onPress={() => setPaused(value => !value)}
            />
            <View pointerEvents="box-none" style={[s.absolute, frame]}>
              <ArtworkView
                ref={canvas}
                collapsable={false}
                art={art}
                width={frame.width}
                height={frame.height}
                pointerEvents="none"
              />
              {tool !== 'draw' &&
                art.texts.map(layer => (
                  <MoveText
                    key={layer.id}
                    layer={layer}
                    width={frame.width}
                    height={frame.height}
                    edit={() => editText(layer)}
                    change={(x, y) =>
                      setArt(old => ({
                        ...old,
                        texts: old.texts.map(value =>
                          value.id === layer.id ? { ...value, x, y } : value,
                        ),
                      }))
                    }
                  />
                ))}
              {tool === 'draw' && (
                <View
                  ref={hitbox}
                  style={StyleSheet.absoluteFill}
                  onStartShouldSetResponder={() => true}
                  onResponderGrant={begin}
                  onResponderMove={draw}
                  onResponderRelease={() => {
                    strokeId.current = null;
                  }}
                  onResponderTerminate={() => {
                    strokeId.current = null;
                  }}
                  accessibilityLabel="Zone de dessin"
                />
              )}
            </View>
            <ScrollView
              style={s.rail}
              contentContainerStyle={s.railContent}
              showsVerticalScrollIndicator={false}
            >
              {(
                [
                  ['text', 'Aa', 'Texte'],
                  ['stickers', '☺', 'Stickers'],
                  ['draw', '✎', 'Dessiner'],
                  ['effects', '✦', 'Effets'],
                  ['trim', '✂', 'Découper'],
                  ['speed', '1×', 'Vitesse'],
                  ['cover', '▣', 'Couverture'],
                ] as const
              ).map(([value, glyph, label]) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: tool === value }}
                  onPress={() => selectTool(value)}
                  style={s.tool}
                >
                  <View style={[s.toolGlyph, tool === value && s.toolSelected]}>
                    <Text style={s.glyph}>{glyph}</Text>
                  </View>
                  <Text style={s.toolLabel}>{label}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  edit.muted ? 'Réactiver le son' : 'Retirer le son'
                }
                onPress={() => setEdit(old => ({ ...old, muted: !old.muted }))}
                style={s.tool}
              >
                <View style={s.toolGlyph}>
                  <Icon name={edit.muted ? 'muted' : 'volume'} size={21} />
                </View>
                <Text style={s.toolLabel}>Son</Text>
              </Pressable>
            </ScrollView>
            {paused && (
              <View pointerEvents="none" style={s.paused}>
                <Icon name="play" size={40} />
              </View>
            )}
            {!!tool && (
              <View style={s.sheet}>
                <View style={s.sheetHeader}>
                  <Text style={s.sheetTitle}>{titles[tool]}</Text>
                  {tool === 'text' && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Valider le texte"
                      onPress={addText}
                      style={s.validateText}
                    >
                      <Text style={s.validateTextLabel}>Terminer</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fermer les outils"
                    style={s.iconButton}
                    onPress={closePanel}
                  >
                    <Text style={s.close}>×</Text>
                  </Pressable>
                </View>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={s.sheetContent}
                >
                  {tool === 'text' && (
                    <>
                      <TextInput
                        accessibilityLabel="Texte sur la vidéo"
                        autoFocus
                        multiline
                        maxLength={200}
                        placeholder="Votre histoire, vos mots."
                        placeholderTextColor="#8d8d91"
                        value={text}
                        onChangeText={setText}
                        style={s.textInput}
                      />
                      <ColorChoices value={color} change={setColor} />
                      <View style={s.row}>
                        {([0.045, 0.06, 0.09] as const).map((size, index) => (
                          <Choice
                            key={size}
                            selected={textSize === size}
                            title={['Petit', 'Moyen', 'Grand'][index]}
                            press={() => setTextSize(size)}
                          />
                        ))}
                      </View>
                      <View style={s.row}>
                        {(['none', 'dark', 'light'] as const).map(value => (
                          <Choice
                            key={value}
                            selected={background === value}
                            title={
                              {
                                none: 'Sans fond',
                                dark: 'Fond sombre',
                                light: 'Fond clair',
                              }[value]
                            }
                            press={() => setBackground(value)}
                          />
                        ))}
                      </View>
                      <Button title="Terminer le texte" onPress={addText} />
                      {textId && (
                        <Button
                          secondary
                          title="Supprimer ce texte"
                          onPress={() => {
                            setArt(old => ({
                              ...old,
                              texts: old.texts.filter(
                                layer => layer.id !== textId,
                              ),
                            }));
                            closePanel();
                          }}
                        />
                      )}
                    </>
                  )}
                  {tool === 'stickers' && (
                    <View style={s.row}>
                      {['❤️', '🔥', '✨', '😂', '👏', '🎉', '👀', '💛'].map(
                        emoji => (
                          <Pressable
                            key={emoji}
                            accessibilityRole="button"
                            accessibilityLabel={'Ajouter ' + emoji}
                            style={s.sticker}
                            onPress={() => {
                              if (art.texts.length >= 8) {
                                showNotice('Huit textes ou stickers maximum.');
                                return;
                              }
                              setArt(old => ({
                                ...old,
                                texts: [
                                  ...old.texts,
                                  {
                                    id: 'sticker-' + ++sequence.current,
                                    text: emoji,
                                    x: 0.35,
                                    y: 0.4,
                                    size: 0.16,
                                    color: '#fff',
                                    background: 'none',
                                  },
                                ],
                              }));
                              setTool(null);
                            }}
                          >
                            <Text style={s.emoji}>{emoji}</Text>
                          </Pressable>
                        ),
                      )}
                    </View>
                  )}
                  {tool === 'draw' && (
                    <>
                      <ColorChoices value={color} change={setColor} />
                      <View style={s.row}>
                        {([0.008, 0.014, 0.03] as const).map((size, index) => (
                          <Choice
                            key={size}
                            selected={brush === size}
                            title={['Fin', 'Moyen', 'Large'][index]}
                            press={() => setBrush(size)}
                          />
                        ))}
                      </View>
                      <View style={s.row}>
                        <Choice
                          title="Annuler le dernier trait"
                          press={() =>
                            setArt(old => ({
                              ...old,
                              strokes: old.strokes.slice(0, -1),
                            }))
                          }
                        />
                        <Choice
                          title="Effacer les dessins"
                          press={() => setArt(old => ({ ...old, strokes: [] }))}
                        />
                      </View>
                      <Text style={s.help}>
                        Dessinez directement sur la vidéo, au-dessus de ce
                        panneau.
                      </Text>
                    </>
                  )}
                  {tool === 'effects' && (
                    <View style={s.row}>
                      {(['none', 'warm', 'cool', 'vignette'] as const).map(
                        effect => (
                          <Choice
                            key={effect}
                            selected={art.effect === effect}
                            title={
                              {
                                none: 'Original',
                                warm: 'Chaud',
                                cool: 'Frais',
                                vignette: 'Vignette',
                              }[effect]
                            }
                            press={() => setArt(old => ({ ...old, effect }))}
                          />
                        ),
                      )}
                    </View>
                  )}
                  {tool === 'trim' && (
                    <TrimControl
                      duration={duration}
                      start={edit.start}
                      end={edit.end}
                      onChange={trim}
                    />
                  )}
                  {tool === 'speed' && (
                    <View style={s.row}>
                      {([0.5, 1, 1.5, 2] as const).map(speed => (
                        <Choice
                          key={speed}
                          selected={edit.speed === speed}
                          title={speed + '×'}
                          press={() => setEdit(old => ({ ...old, speed }))}
                        />
                      ))}
                    </View>
                  )}
                  {tool === 'cover' && (
                    <>
                      <View style={s.row}>
                        <Choice
                          title="−1 s"
                          press={() =>
                            player.current?.seek(
                              clamp(cursor - 1, edit.start, edit.end - 0.05),
                            )
                          }
                        />
                        <Text style={s.help}>{timeLabel(cursor)}</Text>
                        <Choice
                          title="+1 s"
                          press={() =>
                            player.current?.seek(
                              clamp(cursor + 1, edit.start, edit.end - 0.05),
                            )
                          }
                        />
                      </View>
                      <Button
                        title="Choisir l’image actuelle comme couverture"
                        onPress={() => {
                          setCover(clamp(cursor, edit.start, edit.end - 0.05));
                          closePanel();
                        }}
                      />
                      <Text style={s.help}>
                        Couverture choisie à{' '}
                        {timeLabel((cover - edit.start) / edit.speed)} dans
                        votre extrait.
                      </Text>
                    </>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
          <View style={s.footer}>
            <Text style={s.help}>
              {art.texts.length + art.strokes.length > 0
                ? 'Votre montage est prêt à être partagé.'
                : 'Une histoire à votre image.'}
            </Text>
            <Pressable
              style={s.next}
              disabled={!duration || capturing || tool === 'text'}
              accessibilityRole="button"
              accessibilityLabel="Suivant"
              onPress={() => {
                next();
              }}
            >
              <Text style={s.nextLabel}>
                {capturing ? 'Préparation…' : 'Suivant →'}
              </Text>
            </Pressable>
          </View>
          <Toast message={notice} dismiss={dismiss} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
function Choice({
  title,
  press,
  selected = false,
}: {
  title: string;
  press: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      onPress={press}
      style={[s.choice, selected && s.choiceSelected]}
    >
      <Text style={s.choiceLabel}>{title}</Text>
    </Pressable>
  );
}
function ColorChoices({
  value,
  change,
}: {
  value: string;
  change: (color: string) => void;
}) {
  return (
    <View style={s.row}>
      {colors.map(color => (
        <Pressable
          key={color}
          accessibilityRole="button"
          accessibilityLabel={'Couleur ' + color}
          accessibilityState={{ selected: value === color }}
          style={s.colorTarget}
          onPress={() => change(color)}
        >
          <View
            style={[
              s.color,
              {
                backgroundColor: color,
              },
              value === color ? s.colorActive : s.colorInactive,
            ]}
          />
        </Pressable>
      ))}
    </View>
  );
}
function MoveText({
  layer,
  width,
  height,
  change,
  edit,
}: {
  layer: TextLayer;
  width: number;
  height: number;
  change: (x: number, y: number) => void;
  edit: () => void;
}) {
  const live = useRef({ layer, width, height, change });
  live.current = { layer, width, height, change };
  const start = useRef({ x: 0, y: 0 }),
    size = useRef({ width: 0, height: 0 });
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        start.current = { x: live.current.layer.x, y: live.current.layer.y };
      },
      onPanResponderMove: (_e, g) => {
        const v = live.current;
        v.change(
          clamp(
            start.current.x + g.dx / v.width,
            0,
            Math.max(0, 1 - size.current.width / v.width),
          ),
          clamp(
            start.current.y + g.dy / v.height,
            0,
            Math.max(0, 1 - size.current.height / v.height),
          ),
        );
      },
    }),
  ).current;
  return (
    <View
      {...pan.panHandlers}
      style={[
        s.absolute,
        {
          left: layer.x * width,
          top: layer.y * height,
          maxWidth: width * 0.9,
        },
      ]}
      onLayout={e => {
        size.current = e.nativeEvent.layout;
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Modifier le texte ' + layer.text}
        onPress={edit}
      >
        <Text
          style={[
            textLayerStyle({ ...layer, x: 0, y: 0 }, width, height),
            s.textHitArea,
          ]}
        >
          {layer.text}
        </Text>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  absolute: { position: 'absolute' },
  colorActive: { borderWidth: 3, borderColor: '#ffc64b' },
  colorInactive: { borderWidth: 1, borderColor: '#777' },
  textHitArea: {
    opacity: 0,
    position: 'relative',
    left: 0,
    top: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
    textShadowColor: 'transparent',
  },
  validateText: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginLeft: 'auto',
  },
  validateTextLabel: { color: '#ffc64b', fontSize: 14, fontWeight: '700' },
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#08090b' },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  headerTitle: { color: '#eee9df', fontSize: 15, fontWeight: '600' },
  time: { color: '#aaa6a0', fontSize: 12, minWidth: 44, textAlign: 'right' },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { color: '#fff', fontSize: 30, fontWeight: '300' },
  stage: { flex: 1, backgroundColor: '#050607', overflow: 'hidden' },
  rail: { position: 'absolute', right: 8, top: 8, bottom: 8, width: 64 },
  railContent: { gap: 6, alignItems: 'center' },
  tool: { alignItems: 'center', justifyContent: 'center', minHeight: 51 },
  toolGlyph: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#17191b99',
  },
  toolSelected: { backgroundColor: '#6a4b22dd' },
  glyph: { color: '#fff', fontSize: 20, fontWeight: '600' },
  toolLabel: {
    color: '#fff',
    fontSize: 9,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  paused: { position: 'absolute', top: '44%', left: '44%' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '65%',
    backgroundColor: '#1b1d20f8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#414145',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  sheetContent: { padding: 16, gap: 12, paddingBottom: 24 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  textInput: {
    minHeight: 84,
    maxHeight: 160,
    padding: 14,
    fontSize: 22,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#55565b',
    borderRadius: 14,
    textAlignVertical: 'top',
  },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#505055',
    borderRadius: 14,
  },
  choiceSelected: { borderColor: '#ffc64b', backgroundColor: '#393021' },
  choiceLabel: { color: '#fff', fontSize: 13 },
  colorTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  color: { width: 28, height: 28, borderRadius: 14 },
  sticker: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#2b2d31',
  },
  emoji: { fontSize: 34 },
  footer: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  help: { color: '#aaa7a2', fontSize: 12, lineHeight: 18, flexShrink: 1 },
  next: {
    minHeight: 46,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#ffc64b',
  },
  nextLabel: { color: '#15110d', fontSize: 14, fontWeight: '700' },
});
