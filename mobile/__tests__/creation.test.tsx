import React from 'react';
import Renderer from 'react-test-renderer';
import { CreateVideoWizard } from '../src/video/CreateVideoWizard';
import { Button, Field } from '../src/components/ui';
import { TrimControl } from '../src/video/TrimControl';
import {
  request,
  uploadVideoBlock,
  uploadVideoOverlay,
} from '../src/services/session';
import { captureRef } from 'react-native-view-shot';
import { ArtworkView } from '../src/video/ArtworkView';
jest.mock('../src/video/CaptureScreen', () => ({
  CaptureScreen: ({ gallery }: { gallery: () => Promise<unknown> }) => {
    const React = require('react');
    const { Action } = require('../src/components/ui');
    return React.createElement(Action, {
      title: 'Choisir une vidéo',
      work: gallery,
    });
  },
}));
jest.setTimeout(30000);
import { pick } from '@react-native-documents/picker';
import { clipDuration, coverTime } from '../src/video/editing';
jest.mock('../src/services/session', () => ({
  request: jest.fn(),
  uploadVideoBlock: jest.fn(),
  uploadVideoOverlay: jest.fn(async () => ({})),
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => '/cache/overlay.png'),
  releaseCapture: jest.fn(),
}));
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'SvgMock',
  Defs: 'SvgDefs',
  RadialGradient: 'SvgGradient',
  Stop: 'SvgStop',
  Rect: 'SvgRect',
  Path: 'SvgPath',
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(async () => [
    { uri: 'content://test', size: 100, name: 'histoire.mp4' },
  ]),
  keepLocalCopy: jest.fn(async () => [
    { status: 'success', localUri: 'file:///cache/tala-upload-test.video' },
  ]),
  types: { video: 'video/*' },
  isErrorWithCode: () => false,
  errorCodes: { OPERATION_CANCELED: 'cancel' },
}));
jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { CacheDir: '/cache' },
    stat: jest.fn(async () => ({ size: 100 })),
    unlink: jest.fn(async () => {}),
  },
}));
jest.mock('react-native-video', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: R.forwardRef((props: object, ref: unknown) => {
      R.useImperativeHandle(ref, () => ({ seek: jest.fn() }));
      return R.createElement('PreviewVideo', props);
    }),
  };
});
test('création : choisir, prévisualiser le montage puis publier avec sa recette et sa couverture', async () => {
  let renderer!: Renderer.ReactTestRenderer;
  const posted = jest.fn(),
    reload = jest.fn(async () => {});
  const draft = {
    id: 'video-edit',
    size: 100,
    uploadedBytes: 0,
    chunkBytes: 100,
    status: 'draft',
  };
  jest.mocked(request).mockImplementation(async (path, _target, method) => {
    if (path === '/videos' && method === 'POST') return draft;
    if (path === '/videos/video-edit' && (!method || method === 'GET'))
      return { ...draft, status: 'ready' };
    return {};
  });
  jest
    .mocked(uploadVideoBlock)
    .mockResolvedValue({ ...draft, uploadedBytes: 100 });
  const press = async (title: string) =>
    Renderer.act(async () => {
      const button =
        renderer.root
          .findAllByType(Button)
          .find(b => b.props.title === title) ||
        renderer.root.findAllByProps({ accessibilityLabel: title })[0];
      button.props.onPress();
    });
  try {
    await Renderer.act(async () => {
      renderer = Renderer.create(
        <CreateVideoWizard posted={posted} reload={reload} />,
      );
    });
    expect(renderer.root.findAllByType(Field)).toHaveLength(0);
    await press('Choisir une vidéo');
    expect(pick).toHaveBeenCalled();
    await Renderer.act(async () =>
      renderer.root
        .findByType('PreviewVideo' as never)
        .props.onLoad({ duration: 12 }),
    );
    await press('Découper');
    await Renderer.act(async () =>
      renderer.root.findByType(TrimControl).props.onChange(2, 8),
    );
    await press('Fermer les outils');
    await press('Vitesse');
    await Renderer.act(async () =>
      renderer.root.findByProps({ accessibilityLabel: '2×' }).props.onPress(),
    );
    await press('Fermer les outils');
    await press('Retirer le son');
    expect(renderer.root.findByType('PreviewVideo' as never).props.rate).toBe(
      2,
    );
    expect(renderer.root.findByType('PreviewVideo' as never).props.muted).toBe(
      true,
    );
    await press('Couverture');
    await Renderer.act(async () =>
      renderer.root
        .findByType('PreviewVideo' as never)
        .props.onProgress({ currentTime: 4 }),
    );
    await Renderer.act(async () =>
      renderer.root
        .findByProps({
          accessibilityLabel: 'Choisir l’image actuelle comme couverture',
        })
        .props.onPress(),
    );
    await press('Suivant');
    await press('Enregistrer ma vidéo privée');
    const creation = jest
      .mocked(request)
      .mock.calls.find(
        ([path, _target, method]) => path === '/videos' && method === 'POST',
      );
    expect(creation?.[3]).toMatchObject({
      title: 'histoire',
      visibility: 'private',
      kind: 'short',
      thumbnailTime: 1,
      editRecipe: { start: 2, end: 8, speed: 2, muted: true },
    });
    expect(uploadVideoBlock).toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      '/videos/video-edit/publish',
      'api',
      'POST',
      {},
    );
    expect(posted).toHaveBeenCalledWith('video-edit');
  } finally {
    if (renderer) await Renderer.act(async () => renderer.unmount());
  }
});
test('la couverture reste dans l’extrait après découpe et changement de vitesse', () => {
  const edit = { start: 10, end: 14, speed: 0.5 as const, muted: false };
  expect(clipDuration(edit)).toBe(8);
  expect(coverTime(edit, 12)).toBe(4);
  expect(coverTime(edit, 0)).toBe(0);
  expect(coverTime(edit, 20)).toBeLessThan(8);
});
test('texte, sticker et effet sont exportés avant de terminer l’import', async () => {
  let renderer!: Renderer.ReactTestRenderer;
  jest.mocked(request).mockClear();
  jest.mocked(uploadVideoOverlay).mockClear();
  jest.mocked(captureRef).mockClear();
  const draft = {
    id: 'video-art',
    size: 100,
    uploadedBytes: 0,
    chunkBytes: 100,
    status: 'draft',
  };
  jest
    .mocked(request)
    .mockImplementation(async (path, _target, method) =>
      path === '/videos' && method === 'POST'
        ? draft
        : path === '/videos/video-art'
          ? { ...draft, status: 'ready' }
          : {},
    );
  jest
    .mocked(uploadVideoBlock)
    .mockResolvedValue({ ...draft, uploadedBytes: 100 });
  const press = async (title: string) =>
    Renderer.act(async () => {
      const node =
        renderer.root
          .findAllByType(Button)
          .find(b => b.props.title === title) ||
        renderer.root.findAllByProps({ accessibilityLabel: title })[0];
      node.props.onPress();
    });
  try {
    await Renderer.act(async () => {
      renderer = Renderer.create(
        <CreateVideoWizard
          posted={jest.fn()}
          reload={jest.fn(async () => {})}
        />,
      );
    });
    await press('Choisir une vidéo');
    await Renderer.act(async () => {
      renderer.root.findByProps({ testID: 'composer-stage' }).props.onLayout({
        nativeEvent: { layout: { width: 360, height: 640 } },
      });
      renderer.root.findByType('PreviewVideo' as never).props.onLoad({
        duration: 5,
        naturalSize: { width: 720, height: 1280 },
      });
    });
    await press('Texte');
    await Renderer.act(async () =>
      renderer.root
        .findAllByProps({ accessibilityLabel: 'Texte sur la vidéo' })[0]
        .props.onChangeText('Bonjour TALA'),
    );
    await press('Terminer le texte');
    await press('Stickers');
    await press('Ajouter 🔥');
    await press('Effets');
    await press('Chaud');
    await press('Fermer les outils');
    expect(renderer.root.findByType(ArtworkView).props.art.texts).toHaveLength(
      2,
    );
    expect(renderer.root.findByType(ArtworkView).props.art.effect).toBe('warm');
    await press('Suivant');
    await Renderer.act(
      async () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(captureRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: 'png', result: 'tmpfile' }),
    );
    await press('Enregistrer ma vidéo privée');
    expect(
      jest
        .mocked(request)
        .mock.calls.find(
          ([path, , method]) => path === '/videos' && method === 'POST',
        )?.[3],
    ).toMatchObject({ editRecipe: { overlay: true } });
    expect(uploadVideoOverlay).toHaveBeenCalledWith(
      'video-art',
      '/cache/overlay.png',
      expect.anything(),
    );
    const overlayOrder =
      jest.mocked(uploadVideoOverlay).mock.invocationCallOrder[0];
    const completeIndex = jest
      .mocked(request)
      .mock.calls.findIndex(([path]) => path === '/videos/video-art/complete');
    expect(overlayOrder).toBeLessThan(
      jest.mocked(request).mock.invocationCallOrder[completeIndex],
    );
  } finally {
    if (renderer) await Renderer.act(async () => renderer.unmount());
  }
});
test('quitter la création pendant la préparation ne publie pas la vidéo après coup', async () => {
  let renderer!: Renderer.ReactTestRenderer,
    finishRead: (() => void) | undefined;
  const posted = jest.fn(),
    draft = {
      id: 'video-edit',
      size: 100,
      uploadedBytes: 0,
      chunkBytes: 100,
      status: 'draft',
    };
  jest.mocked(request).mockClear();
  jest.mocked(uploadVideoBlock).mockClear();
  jest.mocked(request).mockImplementation(async (path, _target, method) => {
    if (path === '/videos' && method === 'POST') return draft;
    if (path === '/videos/video-edit')
      return new Promise(resolve => {
        finishRead = () => resolve({ ...draft, status: 'ready' });
      });
    return {};
  });
  jest
    .mocked(uploadVideoBlock)
    .mockResolvedValue({ ...draft, uploadedBytes: 100 });
  const press = async (title: string) =>
    Renderer.act(async () => {
      const button =
        renderer.root
          .findAllByType(Button)
          .find(b => b.props.title === title) ||
        renderer.root.findAllByProps({ accessibilityLabel: title })[0];
      button.props.onPress();
    });
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <CreateVideoWizard posted={posted} reload={jest.fn(async () => {})} />,
    );
  });
  await press('Choisir une vidéo');
  await Renderer.act(async () =>
    renderer.root
      .findByType('PreviewVideo' as never)
      .props.onLoad({ duration: 3 }),
  );
  await press('Suivant');
  await press('Enregistrer ma vidéo privée');
  expect(finishRead).toBeDefined();
  await Renderer.act(async () => renderer.unmount());
  await Renderer.act(async () => finishRead!());
  expect(posted).not.toHaveBeenCalled();
  expect(
    jest.mocked(request).mock.calls.some(([path]) => path.endsWith('/publish')),
  ).toBe(false);
});
