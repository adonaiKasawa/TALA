import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import Video, { type VideoRef } from 'react-native-video';
import {
  pick,
  keepLocalCopy,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import BlobUtil from 'react-native-blob-util';
import {
  Action,
  Button,
  Field,
  Screen,
  Section,
  confirm,
  styles,
} from '../components/ui';
import { request, uploadVideoBlock } from '../services/session';
import { CaptionEditor } from '../feed/CaptionEditor';
import { CreateVideoWizard } from '../video/CreateVideoWizard';
type Item = {
  id: string;
  title: string;
  description: string;
  visibility: 'private' | 'public' | 'unlisted';
  kind: 'short' | 'long';
  status: string;
  size: number;
  uploadedBytes: number;
  duration: number | null;
  thumbnailTime: number;
  chunkBytes: number;
  driver: string;
  isTest: boolean;
  errorCode: string | null;
};
type Playback = { url: string; thumbnail: string; type: string };
const statuses: Record<string, string> = {
  draft: 'À envoyer',
  uploading: 'Envoi en cours',
  queued: 'En attente',
  analyzing: 'Vérification',
  optimizing: 'Préparation',
  transferring: 'Préparation',
  mux_processing: 'Finalisation',
  ready: 'Prête à publier',
  published: 'Publiée',
  failed: 'Traitement interrompu',
  rejected: 'Fichier refusé',
};
export function VideosScreen({
  onDone,
  initialMode = 'create',
}: {
  onDone?: () => void;
  initialMode?: 'create' | 'library';
}) {
  const [items, setItems] = useState<Item[]>([]),
    [mode, setMode] = useState<'create' | 'library' | 'detail' | 'posted'>(
      initialMode,
    ),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState('');
  const load = useCallback(
    async () => setItems((await request('/me/videos')) as Item[]),
    [],
  );
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      load().catch(error => {
        if (alive) setNotice(error.message);
      });
    refresh();
    const timer = setInterval(() => {
      refresh();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);
  const item = items.find(v => v.id === selected);
  if (mode === 'create')
    return (
      <CreateVideoWizard
        close={onDone}
        reload={load}
        posted={id => {
          setSelected(id);
          setMode('posted');
        }}
      />
    );
  return (
    <Screen
      title="Mes vidéos"
      subtitle={'Vos publications et vos brouillons, au même endroit.'}
    >
      <View style={styles.row}>
        <Button
          secondary
          title="Créer une vidéo"
          selected={false}
          onPress={() => {
            setSelected(null);
            setMode('create');
          }}
        />
        <Button
          secondary
          title="Mes vidéos"
          selected
          onPress={() => setMode('library')}
        />
      </View>
      {mode === 'library' ? (
        <Section title="Vos imports">
          <Button
            title="Importer une vidéo"
            onPress={() => {
              setSelected(null);
              setMode('create');
            }}
          />
          {notice && (
            <Text accessibilityRole="alert" style={styles.error}>
              {notice}
            </Text>
          )}
          {!items.length && (
            <Text style={styles.text}>Aucune vidéo importée.</Text>
          )}
          {items.map(v => (
            <View key={v.id} style={styles.divider}>
              <Text style={styles.h2}>{v.title}</Text>
              <Text style={styles.small}>
                {statuses[v.status] || v.status} ·{' '}
                {v.kind === 'short' ? 'Short' : 'Vidéo longue'}
              </Text>
              <Button
                title="Ouvrir"
                secondary
                onPress={() => {
                  setSelected(v.id);
                  setMode('detail');
                }}
              />
            </View>
          ))}
        </Section>
      ) : mode === 'posted' && item ? (
        <Section
          title={
            item.visibility === 'private'
              ? 'Votre vidéo privée est prête.'
              : 'Votre vidéo est publiée.'
          }
        >
          <Text style={styles.h2}>{item.title}</Text>
          <Text style={styles.text}>
            {item.visibility === 'public'
              ? 'Votre histoire peut maintenant être découverte dans le fil.'
              : item.visibility === 'unlisted'
                ? 'Seules les personnes qui ont le lien peuvent regarder cette vidéo.'
                : 'Vous seul pouvez regarder cette vidéo. Vous pourrez la rendre publique depuis Mes vidéos.'}
          </Text>
          {onDone && <Button title="Retour à l’accueil" onPress={onDone} />}
          <Button
            secondary
            title="Créer une autre vidéo"
            onPress={() => {
              setSelected(null);
              setMode('create');
            }}
          />
          <Button
            secondary
            title="Gérer cette vidéo"
            onPress={() => setMode('detail')}
          />
        </Section>
      ) : item ? (
        <Editor
          key={item?.id || 'new'}
          item={item}
          reload={load}
          selected={id => {
            setSelected(id);
            setMode(id ? 'detail' : 'library');
          }}
        />
      ) : (
        <Text style={styles.small}>Ouverture de la vidéo…</Text>
      )}
    </Screen>
  );
}
function Editor({
  item,
  reload,
  selected,
}: {
  item?: Item;
  reload: () => Promise<void>;
  selected: (id: string | null) => void;
}) {
  const [title, setTitle] = useState(item?.title || ''),
    [description, setDescription] = useState(item?.description || ''),
    [kind, setKind] = useState<'short' | 'long'>(item?.kind || 'short'),
    [visibility, setVisibility] = useState<Item['visibility']>(
      item?.visibility || 'private',
    ),
    [thumbnail, setThumbnail] = useState(String(item?.thumbnailTime || 0)),
    [file, setFile] = useState<{ path: string; size: number } | null>(null),
    [id, setId] = useState(item?.id || ''),
    [progress, setProgress] = useState<number | null>(null),
    [playback, setPlayback] = useState<Playback | null>(null),
    [playerError, setPlayerError] = useState(''),
    [paused, setPaused] = useState(false);
  const controller = useRef<AbortController | null>(null),
    cached = useRef<string | null>(null);
  const player = useRef<VideoRef | null>(null),
    position = useRef(0),
    playing = useRef(false),
    buffering = useRef(false);
  const playbackId = item?.id,
    hasPlayback = Boolean(playback);
  useEffect(() => {
    if (!playbackId || !hasPlayback) return;
    const timer = setInterval(() => {
      request(`/videos/${playbackId}/playback`)
        .then(data => {
          setPaused(!playing.current);
          setPlayback(data as Playback);
          setPlayerError('');
        })
        .catch(() =>
          setPlayerError(
            'La lecture ne peut pas être renouvelée. Vérifiez votre connexion.',
          ),
        );
    }, 240000);
    return () => clearInterval(timer);
  }, [playbackId, hasPlayback]);
  const removeCopy = async (path: string | null) => {
    if (
      path?.startsWith(BlobUtil.fs.dirs.CacheDir + '/') &&
      path.includes('/tala-upload-')
    )
      await BlobUtil.fs.unlink(path).catch(() => {});
  };
  useEffect(
    () => () => {
      controller.current?.abort();
      removeCopy(cached.current).catch(() => {});
    },
    [],
  );
  async function choose() {
    try {
      const [picked] = await pick({
        type: [types.video],
        allowMultiSelection: false,
      });
      if (!picked.size || picked.size > 536870912)
        throw new Error('Choisissez une vidéo de 512 Mo maximum.');
      const [copy] = await keepLocalCopy({
        files: [
          { uri: picked.uri, fileName: `tala-upload-${Date.now()}.video` },
        ],
        destination: 'cachesDirectory',
      });
      if (copy.status !== 'success')
        throw new Error('Le fichier n’a pas pu être copié.');
      const path = decodeURIComponent(copy.localUri.replace(/^file:\/\//, ''));
      await removeCopy(cached.current);
      cached.current = path;
      setFile({ path, size: Number((await BlobUtil.fs.stat(path)).size) });
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      )
        return false;
      throw error;
    }
  }
  const metadata = () => ({
    title: title.trim(),
    description,
    kind,
    visibility,
    thumbnailTime: Number(thumbnail),
  });
  async function upload() {
    if (!file) throw new Error('Choisissez une vidéo.');
    if (!item && !title.trim()) throw new Error('Saisissez un titre.');
    controller.current = new AbortController();
    setProgress(0);
    try {
      let current = id
        ? ((await request('/videos/' + id)) as Item)
        : ((await request('/videos', 'api', 'POST', {
            ...metadata(),
            size: file.size,
          })) as Item);
      setId(current.id);
      if (current.size !== file.size)
        throw new Error('Choisissez le fichier correspondant à cet import.');
      for (let offset = current.uploadedBytes; offset < file.size;) {
        if (controller.current.signal.aborted)
          throw new Error('Envoi suspendu. Vous pouvez reprendre.');
        const length = Math.min(current.chunkBytes, file.size - offset);
        current = (await uploadVideoBlock(
          current.id,
          file.path,
          offset,
          length,
          controller.current.signal,
        )) as Item;
        offset = current.uploadedBytes;
        setProgress(Math.floor((offset / file.size) * 100));
      }
      await request(`/videos/${current.id}/complete`, 'api', 'POST', {});
      await reload();
      selected(current.id);
    } finally {
      setProgress(null);
    }
  }
  async function play() {
    if (item) {
      setPlayback((await request(`/videos/${item.id}/playback`)) as Playback);
      setPlayerError('');
    }
  }
  const uploadable = !item || ['draft', 'uploading'].includes(item.status);
  return (
    <Section title={item ? item.title : 'Nouvelle vidéo'}>
      {item && (
        <Text style={styles.text}>{statuses[item.status] || item.status}</Text>
      )}
      {item?.driver === 'local' && (
        <Text style={styles.notice}>
          Mode local : la vidéo est conservée sur le PC.
        </Text>
      )}
      {item?.isTest && (
        <Text style={styles.notice}>
          Mux en mode test : extrait et disponibilité limités.
        </Text>
      )}
      {item?.errorCode && (
        <Text accessibilityRole="alert" style={styles.error}>
          Le traitement a échoué. Vérifiez la durée, le format et la qualité du
          fichier avant de réessayer.
        </Text>
      )}
      <Field
        label="Titre"
        value={title}
        onChangeText={setTitle}
        maxLength={140}
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={5000}
      />
      <View style={styles.row}>
        <Text style={[styles.text, styles.flex]}>
          Vidéo longue (sinon short de 3 min maximum)
        </Text>
        <Switch
          value={kind === 'long'}
          onValueChange={value => setKind(value ? 'long' : 'short')}
        />
      </View>
      <Text style={styles.label}>Visibilité</Text>
      {(['private', 'unlisted', 'public'] as const).map(value => (
        <Button
          key={value}
          secondary={visibility !== value}
          title={
            {
              private: 'Privée — vous uniquement',
              unlisted: 'Non répertoriée — accès par lien',
              public: 'Publique',
            }[value]
          }
          onPress={() => setVisibility(value)}
        />
      ))}
      <Field
        label="Position de miniature (secondes)"
        value={thumbnail}
        onChangeText={setThumbnail}
        keyboardType="decimal-pad"
      />
      {item && <CaptionEditor id={item.id} />}
      {uploadable ? (
        <>
          <Action
            title={file ? 'Choisir un autre fichier' : 'Choisir la vidéo'}
            work={choose}
          />
          {file && (
            <Text style={styles.small}>
              {Math.ceil(file.size / 1048576)} Mo sélectionnés
            </Text>
          )}
          <Action
            title={id ? 'Reprendre l’envoi' : 'Envoyer la vidéo'}
            work={upload}
          />
          {progress !== null && (
            <>
              <Text accessibilityLiveRegion="polite" style={styles.text}>
                {progress} % envoyés
              </Text>
              <Button
                title="Suspendre l’envoi"
                secondary
                onPress={() => controller.current?.abort()}
              />
            </>
          )}
        </>
      ) : (
        <Action
          title="Enregistrer les informations"
          work={async () => {
            await request('/videos/' + item.id, 'api', 'PATCH', metadata());
            await reload();
          }}
        />
      )}
      {item && ['ready', 'published'].includes(item.status) && (
        <>
          <Action title="Voir la vidéo" work={play} />
          {playback && (
            <Video
              ref={player}
              source={{ uri: playback.url }}
              controls
              resizeMode="contain"
              paused={paused}
              onProgress={data => {
                position.current = data.currentTime;
              }}
              onBuffer={data => {
                buffering.current = data.isBuffering;
              }}
              onPlaybackStateChanged={data => {
                if (!buffering.current) playing.current = data.isPlaying;
              }}
              onLoad={() => {
                if (position.current > 0)
                  player.current?.seek(position.current);
              }}
              style={styles.videoPlayer}
              onError={() =>
                setPlayerError(
                  'Lecture interrompue. Actualisez-la pour réessayer.',
                )
              }
            />
          )}
          {playerError && <Text style={styles.error}>{playerError}</Text>}
          {playback && <Action title="Actualiser la lecture" work={play} />}
          <Action
            title={
              item.status === 'published'
                ? 'Retirer de la publication'
                : 'Publier la vidéo'
            }
            work={async () => {
              await request(
                `/videos/${item.id}/${
                  item.status === 'published' ? 'unpublish' : 'publish'
                }`,
                'api',
                'POST',
                {},
              );
              await reload();
            }}
          />
        </>
      )}
      {item?.status === 'failed' && (
        <Action
          title="Réessayer le traitement"
          work={async () => {
            await request(`/videos/${item.id}/retry`, 'api', 'POST', {});
            await reload();
          }}
        />
      )}
      {item && (
        <Action
          danger
          title="Supprimer la vidéo"
          work={async () => {
            if (
              !(await confirm(
                'Supprimer cette vidéo ?',
                'La vidéo sera retirée et les fichiers seront nettoyés. Les liens déjà ouverts peuvent rester valides quelques minutes.',
              ))
            )
              return false;
            await request('/videos/' + item.id, 'api', 'DELETE');
            await reload();
            selected(null);
          }}
        />
      )}
    </Section>
  );
}
