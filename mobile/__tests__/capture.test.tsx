import React from 'react';
import Renderer from 'react-test-renderer';
import { AppState } from 'react-native';
import { CaptureScreen } from '../src/video/CaptureScreen';
jest.setTimeout(30000);
const mockStop = jest.fn(async () => {}),
  mockCancel = jest.fn(async () => {}),
  mockStart = jest.fn(
    async (
      _finish: (path: string) => void,
      _error: (error: Error) => void,
    ) => {},
  );
const mockRecorder = {
  startRecording: mockStart,
  stopRecording: mockStop,
  cancelRecording: mockCancel,
};
const mockOutput = { createRecorder: jest.fn(async () => mockRecorder) };
jest.mock('react-native-vision-camera', () => ({
  Camera: 'CameraNative',
  useCameraDevice: () => ({ id: 'back' }),
  useCameraPermission: () => ({
    hasPermission: true,
    canRequestPermission: false,
  }),
  useMicrophonePermission: () => ({
    hasPermission: true,
    canRequestPermission: false,
  }),
  useVideoOutput: () => mockOutput,
}));
jest.mock('../src/video/ArtworkView', () => ({
  ArtworkView: 'ArtworkPreview',
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
afterEach(() => jest.clearAllMocks());
beforeEach(() => {
  AppState.currentState = 'active';
});
test('caméra : ouverture directe, galerie accessible et effet transmis avec la prise', async () => {
  const captured = jest.fn(async () => {}),
    gallery = jest.fn(async () => {});
  let renderer!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <CaptureScreen close={() => {}} gallery={gallery} captured={captured} />,
    );
  });
  const camera = renderer.root.findByType('CameraNative' as never);
  expect(camera.props.isActive).toBe(true);
  await Renderer.act(async () =>
    renderer.root
      .findAllByProps({ accessibilityLabel: 'Ouvrir la galerie' })[0]
      .props.onPress(),
  );
  expect(gallery).toHaveBeenCalledTimes(1);
  await Renderer.act(async () =>
    renderer.root
      .findAllByProps({ accessibilityLabel: 'Effet Soleil' })[0]
      .props.onPress(),
  );
  await Renderer.act(async () => camera.props.onStarted());
  await Renderer.act(async () =>
    renderer.root
      .findAllByProps({ accessibilityLabel: 'Enregistrer une vidéo' })[0]
      .props.onPress(),
  );
  expect(mockOutput.createRecorder).toHaveBeenCalledWith({
    maxDuration: 180,
    maxFileSize: 500 * 1024 * 1024,
  });
  expect(mockStart).toHaveBeenCalledTimes(1);
  await Renderer.act(async () =>
    renderer.root
      .findAllByProps({ accessibilityLabel: 'Terminer l’enregistrement' })[0]
      .props.onPress(),
  );
  expect(mockStop).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => {
    const finish = mockStart.mock.calls[0][0] as unknown as (
      path: string,
    ) => void;
    finish('/cache/recorded.mp4');
  });
  expect(captured).toHaveBeenCalledWith('/cache/recorded.mp4', 'warm');
  expect(renderer.root.findByType('CameraNative' as never).props.isActive).toBe(
    false,
  );
  await Renderer.act(async () => renderer.unmount());
});
test('caméra : pause pendant la galerie, reprise si le sélecteur est annulé', async () => {
  let release!: (value: unknown) => void;
  const gallery = jest.fn(
    () =>
      new Promise(resolve => {
        release = resolve;
      }),
  );
  let renderer!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <CaptureScreen
        close={() => {}}
        gallery={gallery}
        captured={async () => {}}
      />,
    );
  });
  await Renderer.act(async () => {
    renderer.root
      .findAllByProps({ accessibilityLabel: 'Ouvrir la galerie' })[0]
      .props.onPress();
  });
  expect(renderer.root.findByType('CameraNative' as never).props.isActive).toBe(
    false,
  );
  await Renderer.act(async () => {
    release(false);
  });
  expect(renderer.root.findByType('CameraNative' as never).props.isActive).toBe(
    true,
  );
  await Renderer.act(async () => renderer.unmount());
});
test('caméra : quitter annule la prise et un résultat tardif ne déclenche pas le montage', async () => {
  const captured = jest.fn(async () => {});
  let renderer!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <CaptureScreen
        close={() => {}}
        gallery={async () => {}}
        captured={captured}
      />,
    );
  });
  await Renderer.act(async () =>
    renderer.root.findByType('CameraNative' as never).props.onStarted(),
  );
  await Renderer.act(async () =>
    renderer.root
      .findAllByProps({ accessibilityLabel: 'Enregistrer une vidéo' })[0]
      .props.onPress(),
  );
  const finish = mockStart.mock.calls[0][0] as unknown as (
    path: string,
  ) => void;
  await Renderer.act(async () => renderer.unmount());
  expect(mockCancel).toHaveBeenCalledTimes(1);
  finish('/cache/late.mp4');
  expect(captured).not.toHaveBeenCalled();
});
