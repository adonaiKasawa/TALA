import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
  ScrollView,
} from 'react-native';
import Video, { type VideoRef } from 'react-native-video';
import {
  pick,
  keepLocalCopy,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import BlobUtil from 'react-native-blob-util';
import { Action, Button, Field } from '../components/ui';

import { releaseCapture } from 'react-native-view-shot';
import { ClipComposer, type Composition } from './ClipComposer';
import { CaptureScreen } from './CaptureScreen';
import { emptyArtwork, type Artwork } from './artwork';
import {
  request,
  uploadVideoBlock,
  uploadVideoOverlay,
} from '../services/session';
import { clipDuration, coverTime, timeLabel, type ClipEdit } from './editing';
type Upload = {
  id: string;
  size: number;
  uploadedBytes: number;
  chunkBytes: number;
  status: string;
};
export function CreateVideoWizard({
  posted,
  reload,
  close,
}: {
  posted: (id: string) => void;
  reload: () => Promise<void>;
  close?: () => void;
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0),
    [file, setFile] = useState<{ path: string; size: number } | null>(null);
  const [title, setTitle] = useState(''),
    [description, setDescription] = useState(''),
    [visibility, setVisibility] = useState<'private' | 'public' | 'unlisted'>(
      'private',
    );
  const [duration, setDuration] = useState(0),
    [edit, setEdit] = useState<ClipEdit>({
      start: 0,
      end: 0,
      speed: 1,
      muted: false,
    });
  const [cover, setCover] = useState(0);
  const [progress, setProgress] = useState<number | null>(null),
    [status, setStatus] = useState(''),
    [id, setId] = useState(''),
    [previewError, setPreviewError] = useState('');
  const player = useRef<VideoRef>(null),
    cached = useRef<string | null>(null),
    controller = useRef<AbortController | null>(null),
    mounted = useRef(true);
  const [composition, setComposition] = useState<Composition | undefined>();
  const [overlay, setOverlay] = useState<string | undefined>();
  const overlayFile = useRef<string | undefined>(undefined);
  const busy = progress !== null;
  async function removeCopy(path: string | null) {
    if (path?.startsWith(BlobUtil.fs.dirs.CacheDir + '/tala-upload-'))
      await BlobUtil.fs.unlink(path).catch(() => {});
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (overlayFile.current) releaseCapture(overlayFile.current);
      removeCopy(cached.current).catch(() => {});
    };
  }, []);
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
        throw new Error('Impossible d’ouvrir cette vidéo.');
      const path = decodeURIComponent(copy.localUri.replace(/^file:\/\//, ''));
      if (!mounted.current) {
        await removeCopy(path);
        return false;
      }
      await removeCopy(cached.current);
      cached.current = path;
      setFile({ path, size: Number((await BlobUtil.fs.stat(path)).size) });
      setId('');
      setComposition(undefined);
      setOverlay(undefined);
      if (overlayFile.current) {
        releaseCapture(overlayFile.current);
        overlayFile.current = undefined;
      }
      setDuration(0);
      setPreviewError('');
      setCover(0);

      setEdit({ start: 0, end: 0, speed: 1, muted: false });
      setTitle(
        (picked.name?.replace(/\.[^.]+$/, '') || 'Mon histoire').slice(0, 140),
      );
      setStep(1);
      return true;
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      )
        return false;
      throw error;
    }
  }
  async function publish() {
    if (!file || !duration || previewError)
      throw new Error('Vérifiez d’abord la lecture de la vidéo.');
    if (!title.trim()) throw new Error('Ajoutez un titre à votre vidéo.');
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setProgress(0);
    setStatus('Envoi de votre vidéo…');
    try {
      let current = id
        ? ((await request('/videos/' + id)) as Upload)
        : ((await request('/videos', 'api', 'POST', {
            title: title.trim(),
            description,
            visibility,
            kind: clipDuration(edit) <= 180 ? 'short' : 'long',
            size: file.size,
            thumbnailTime: coverTime(edit, cover),
            editRecipe: { ...edit, overlay: !!overlay },
          })) as Upload);
      if (mounted.current) setId(current.id);
      if (signal.aborted) throw new Error('Envoi suspendu.');
      if (['draft', 'uploading'].includes(current.status)) {
        for (let offset = current.uploadedBytes; offset < file.size;) {
          if (signal.aborted)
            throw new Error(
              'Envoi suspendu. Votre brouillon reste dans Mes vidéos.',
            );
          current = (await uploadVideoBlock(
            current.id,
            file.path,
            offset,
            Math.min(current.chunkBytes, file.size - offset),
            signal,
          )) as Upload;
          offset = current.uploadedBytes;
          if (mounted.current)
            setProgress(Math.floor((offset / file.size) * 100));
        }
        if (signal.aborted) throw new Error('Envoi suspendu.');
        if (overlay) await uploadVideoOverlay(current.id, overlay, signal);
        await request('/videos/' + current.id + '/complete', 'api', 'POST', {});
      } else if (current.status === 'failed')
        await request('/videos/' + current.id + '/retry', 'api', 'POST', {});
      if (mounted.current) {
        setProgress(100);
        setStatus('Montage et préparation en cours…');
      }
      const deadline = Date.now() + 15 * 60 * 1000;
      while (!signal.aborted && Date.now() < deadline) {
        current = (await request('/videos/' + current.id)) as Upload;
        if (signal.aborted) throw new Error('Envoi suspendu.');
        if (current.status === 'published') {
          await reload();
          if (mounted.current) posted(current.id);
          return;
        }
        if (current.status === 'ready') {
          await request(
            '/videos/' + current.id + '/publish',
            'api',
            'POST',
            {},
          );
          await reload();
          if (mounted.current) posted(current.id);
          return;
        }
        if (['failed', 'rejected', 'deleted'].includes(current.status))
          throw new Error(
            'La préparation n’a pas abouti. Retrouvez votre vidéo dans Mes vidéos pour vérifier son format ou réessayer.',
          );
        await new Promise<void>(resolve => setTimeout(resolve, 2000));
      }
      if (mounted.current) {
        await reload();
        throw new Error(
          'Votre brouillon est conservé dans Mes vidéos. Vous pourrez le publier après sa préparation.',
        );
      }
    } catch (error) {
      if (signal.aborted) {
        if (!mounted.current) return false;
        throw new Error(
          'Votre brouillon est conservé dans Mes vidéos. Vous pourrez reprendre sa préparation et sa publication.',
        );
      }
      throw error;
    } finally {
      if (mounted.current) {
        setProgress(null);
        setStatus('');
      }
    }
  }
  function composed(result: Composition) {
    setComposition(result);
    setEdit(result.edit);
    setCover(result.cover);
    setDuration(result.duration);
    setPreviewError('');
    if (overlayFile.current && overlayFile.current !== result.overlay)
      releaseCapture(overlayFile.current);
    overlayFile.current = result.overlay;
    setOverlay(result.overlay);
    setStep(2);
  }
  async function captured(source: string, effect: Artwork['effect']) {
    const path =
      BlobUtil.fs.dirs.CacheDir + '/tala-upload-' + Date.now() + '.mp4';
    await BlobUtil.fs.cp(source.replace(/^file:\/\//, ''), path);
    if (!mounted.current) {
      await removeCopy(path);
      return;
    }
    await removeCopy(cached.current);
    cached.current = path;
    setFile({ path, size: Number((await BlobUtil.fs.stat(path)).size) });
    setId('');
    setTitle('Mon moment');
    setDuration(0);
    setCover(0);
    setPreviewError('');
    setEdit({ start: 0, end: 0, speed: 1, muted: false });
    setComposition({
      edit: { start: 0, end: 0, speed: 1, muted: false },
      cover: 0,
      duration: 0,
      art: { ...emptyArtwork(), effect },
    });
    if (overlayFile.current) releaseCapture(overlayFile.current);
    overlayFile.current = undefined;
    setOverlay(undefined);
    setStep(1);
  }
  return (
    <ScrollView
      contentContainerStyle={s.root}
      keyboardShouldPersistTaps="handled"
    >
      {step === 0 && (
        <CaptureScreen
          close={close || (() => {})}
          gallery={choose}
          captured={captured}
        />
      )}
      {step === 1 && file && (
        <ClipComposer
          key={file.path}
          uri={'file://' + file.path}
          initial={composition}
          done={composed}
          cancel={value => {
            setComposition(value);
            setStep(0);
          }}
        />
      )}
      {step === 2 && (
        <>
          <View style={s.review}>
            <View style={s.coverPreview}>
              {file && (
                <Video
                  ref={player}
                  source={{ uri: 'file://' + file.path }}
                  style={s.fill}
                  resizeMode="contain"
                  paused
                  muted
                  onLoad={() => player.current?.seek(cover)}
                />
              )}
              {overlay && (
                <Image
                  source={{
                    uri: overlay.startsWith('file:')
                      ? overlay
                      : 'file://' + overlay,
                  }}
                  style={s.fill}
                  resizeMode="contain"
                />
              )}
            </View>
            <View style={s.reviewCopy}>
              <Text style={s.sectionTitle}>Votre histoire est prête.</Text>
              <Text style={s.help}>
                {timeLabel(clipDuration(edit))} ·{' '}
                {clipDuration(edit) <= 180 ? 'Short' : 'Vidéo longue'}
              </Text>
              {!busy && !id && (
                <Button
                  secondary
                  title="Modifier le montage"
                  onPress={() => setStep(1)}
                />
              )}
            </View>
          </View>
          <Field
            label="Titre"
            value={title}
            onChangeText={setTitle}
            maxLength={140}
            editable={!busy && !id}
          />
          <Field
            label="Votre légende"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={5000}
            placeholder="Racontez votre moment… #tala"
            editable={!busy && !id}
          />
          <Text style={s.sectionTitle}>Qui peut regarder ?</Text>
          <View style={s.privacy}>
            {(['public', 'private', 'unlisted'] as const).map(value => (
              <Pressable
                key={value}
                disabled={busy || !!id}
                accessibilityRole="button"
                accessibilityLabel={
                  {
                    public: 'Tout le monde',
                    private: 'Moi uniquement',
                    unlisted: 'Par lien',
                  }[value]
                }
                accessibilityState={{ selected: visibility === value }}
                style={[s.chip, visibility === value && s.chipSelected]}
                onPress={() => setVisibility(value)}
              >
                <Text style={s.chipText}>
                  {
                    {
                      public: 'Tout le monde',
                      private: 'Moi uniquement',
                      unlisted: 'Par lien',
                    }[value]
                  }
                </Text>
              </Pressable>
            ))}
          </View>
          {busy && (
            <View accessibilityLiveRegion="polite">
              <Text style={s.status}>
                {status}
                {progress !== 100 ? ' ' + progress + ' %' : ''}
              </Text>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    { width: ((progress || 0) + '%') as `${number}%` },
                  ]}
                />
              </View>
              <Button
                secondary
                title="Continuer plus tard"
                onPress={() => controller.current?.abort()}
              />
            </View>
          )}
          <Action
            title={
              id
                ? 'Reprendre la publication'
                : visibility === 'private'
                  ? 'Enregistrer ma vidéo privée'
                  : 'Publier ma vidéo'
            }
            work={publish}
          />
          {!busy && !!id && (
            <Action
              secondary
              title="Choisir une autre vidéo"
              work={async () => {
                if (!(await choose())) return false;
              }}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { gap: 18 },
  import: {
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: '#38342f',
    borderRadius: 22,
    backgroundColor: '#17191b',
  },
  importTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  help: { fontSize: 13, lineHeight: 20, color: '#aaa6a1' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  review: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  coverPreview: {
    width: 102,
    height: 150,
    backgroundColor: '#08090a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  reviewCopy: { flex: 1, gap: 12 },
  sectionTitle: { color: '#fff', fontSize: 19, fontWeight: '700' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#494a4e',
    borderRadius: 14,
  },
  chipSelected: { borderColor: '#ffc64b', backgroundColor: '#30271c' },
  chipText: { color: '#fff', fontSize: 12 },
  privacy: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  status: { color: '#ffc64b', fontSize: 14, marginBottom: 12 },
  progressTrack: {
    height: 4,
    backgroundColor: '#303236',
    borderRadius: 2,
    marginBottom: 18,
  },
  progressFill: { height: 4, backgroundColor: '#ffc64b', borderRadius: 2 },
});
