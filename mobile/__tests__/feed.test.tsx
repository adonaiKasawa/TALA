import React from 'react';
import Renderer from 'react-test-renderer';
import { FeedCard } from '../src/feed/FeedCard';
import { FeedPlayer } from '../src/feed/FeedPlayer';
import type { FeedItem } from '../src/feed/api';
jest.mock('../src/services/session', () => ({ request: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-video', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: R.forwardRef((props: object, ref: unknown) => {
      R.useImperativeHandle(ref, () => ({ seek: jest.fn() }));
      return R.createElement('MockVideo', props);
    }),
    SelectedVideoTrackType: { AUTO: 'auto', RESOLUTION: 'resolution' },
    SelectedTrackType: { INDEX: 'index', DISABLED: 'disabled' },
    TextTrackType: { VTT: 'text/vtt' },
  };
});
const item: FeedItem = {
  id: '12345678-1234-4234-8234-123456789abc',
  title: 'Une histoire',
  description: '#tala',
  kind: 'short',
  duration: 20,
  hashtags: ['tala'],
  creator: { id: 'creator', username: 'nadia', displayName: 'Nadia' },
  audio: { label: 'Son original', creator: 'nadia' },
};
const playback = {
  url: 'https://media.example/video.mp4',
  type: 'mp4',
  thumbnail: 'https://media.example/poster.jpg',
  captions: [
    { language: 'fr', label: 'Français', url: 'https://media.example/fr.vtt' },
  ],
};
test('les gestes séparent pause, like, son et accélération sans commandes superposées', async () => {
  jest.useFakeTimers();
  let renderer!: Renderer.ReactTestRenderer;
  const liked = jest.fn(),
    send = jest.fn(async () => playback);
  try {
    await Renderer.act(async () => {
      renderer = Renderer.create(
        <FeedPlayer
          id={item.id}
          active
          saver={false}
          send={send as never}
          onDoubleTap={liked}
          onSample={jest.fn()}
          onEvent={jest.fn()}
        />,
      );
    });
    const gesture = () =>
      renderer.root.findByProps({ testID: 'feed-gesture-surface' });
    const video = () => renderer.root.findByType('MockVideo' as never);
    await Renderer.act(async () => {
      gesture().props.onPress();
      jest.advanceTimersByTime(281);
    });
    expect(video().props.paused).toBe(true);
    await Renderer.act(async () => {
      gesture().props.onPress();
      gesture().props.onPress();
      jest.advanceTimersByTime(281);
    });
    expect(liked).toHaveBeenCalledTimes(1);
    expect(video().props.paused).toBe(true);
    await Renderer.act(async () => {
      gesture().props.onPress();
      gesture().props.onPress();
      gesture().props.onPress();
      jest.advanceTimersByTime(281);
    });
    expect(liked).toHaveBeenCalledTimes(1);
    expect(video().props.muted).toBe(true);
    expect(video().props.paused).toBe(true);
    await Renderer.act(async () => gesture().props.onLongPress());
    expect(video().props.rate).toBe(2);
    expect(video().props.paused).toBe(false);
    await Renderer.act(async () => {
      gesture().props.onPressOut();
      gesture().props.onPress();
      jest.advanceTimersByTime(281);
    });
    expect(video().props.rate).toBe(1);
    expect(video().props.paused).toBe(true);
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Activer le son' }),
    ).toHaveLength(0);
  } finally {
    if (renderer) await Renderer.act(async () => renderer.unmount());
    jest.useRealTimers();
  }
});
test('le double appui garde le like et le plus d’abonnement disparaît après abonnement', async () => {
  jest.useFakeTimers();
  let renderer!: Renderer.ReactTestRenderer;
  let liked = false,
    following = false;
  const send = jest.fn(async (path: string, method?: string) => {
    if (path.endsWith('/playback')) return playback;
    if (path.endsWith('/reactions/like') && method === 'PUT') liked = true;
    if (path.endsWith('/relations/follow') && method === 'PUT')
      following = true;
    return { liked, following, likes: liked ? 1 : 0, saved: false, own: false };
  });
  try {
    await Renderer.act(async () => {
      renderer = Renderer.create(
        <FeedCard
          item={item}
          active
          preload={false}
          height={600}
          saver={false}
          signedIn={false}
          send={send as never}
          removed={jest.fn()}
          creator={jest.fn()}
          tag={jest.fn()}
        />,
      );
    });
    for (let i = 0; i < 2; i++)
      await Renderer.act(async () => {
        const surface = renderer.root.findByProps({
          testID: 'feed-gesture-surface',
        });
        surface.props.onPress();
        surface.props.onPress();
        jest.advanceTimersByTime(281);
      });
    expect(
      send.mock.calls.filter(
        ([path, method]) =>
          path.endsWith('/reactions/like') && method === 'PUT',
      ),
    ).toHaveLength(1);
    await Renderer.act(async () =>
      renderer.root
        .findByProps({ accessibilityLabel: 'S’abonner à @nadia' })
        .props.onPress(),
    );
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: 'S’abonner à @nadia',
      }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Options' }),
    ).toHaveLength(0);
  } finally {
    if (renderer) await Renderer.act(async () => renderer.unmount());
    jest.useRealTimers();
  }
});
jest.setTimeout(30000);

test.each([false, true])(
  'le buffer du fil respecte les contraintes Android (économie=%s)',
  async saver => {
    const send = jest.fn(async () => playback);
    let renderer!: Renderer.ReactTestRenderer;
    try {
      await Renderer.act(async () => {
        renderer = Renderer.create(
          <FeedPlayer
            id={item.id}
            active
            saver={saver}
            send={send as never}
            onSample={jest.fn()}
            onEvent={jest.fn()}
          />,
        );
      });
      const buffer = renderer.root.findByType('MockVideo' as never).props.source
        .bufferConfig;
      // Media3 rejects a minimum below its startup or rebuffer threshold.
      expect(buffer.minBufferMs).toBeGreaterThanOrEqual(
        buffer.bufferForPlaybackMs ?? 1000,
      );
      expect(buffer.minBufferMs).toBeGreaterThanOrEqual(
        buffer.bufferForPlaybackAfterRebufferMs ?? 2000,
      );
      expect(buffer.maxBufferMs).toBeGreaterThanOrEqual(buffer.minBufferMs);
    } finally {
      if (renderer) await Renderer.act(async () => renderer.unmount());
    }
  },
);
test('précharger ne crée pas une impression ; changer de vidéo arrête la précédente', async () => {
  const send = jest.fn(async (path: string) =>
    path.endsWith('/playback')
      ? playback
      : path.endsWith('/social')
      ? { liked: false, likes: 0, saved: false, following: false, own: true }
      : {},
  );
  const props = {
    item,
    active: false,
    preload: true,
    height: 600,
    saver: false,
    signedIn: true,
    send: send as never,
    removed: jest.fn(),
    creator: jest.fn(),
    tag: jest.fn(),
  };
  let renderer!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(<FeedCard {...props} />);
  });
  expect(send.mock.calls.some(([path]) => path === '/watch/impressions')).toBe(
    false,
  );
  expect(renderer.root.findByType('MockVideo' as never).props.paused).toBe(
    true,
  );
  await Renderer.act(async () => {
    renderer.update(<FeedCard {...props} active />);
  });
  expect(
    send.mock.calls.filter(([path]) => path === '/watch/impressions'),
  ).toHaveLength(1);
  expect(renderer.root.findByType('MockVideo' as never).props.paused).toBe(
    false,
  );
  await Renderer.act(async () => {
    renderer.update(<FeedCard {...props} />);
  });
  expect(renderer.root.findByType('MockVideo' as never).props.paused).toBe(
    true,
  );
  await Renderer.act(async () => renderer.unmount());
});
test('activer une piste force sa sélection, indépendamment des préférences système', async () => {
  let renderer!: Renderer.ReactTestRenderer;
  const send = jest.fn(async () => playback);
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <FeedPlayer
        id={item.id}
        active
        saver={false}
        send={send as never}
        onSample={jest.fn()}
        onEvent={jest.fn()}
      />,
    );
  });
  await Renderer.act(async () => {
    renderer.root.findByType('MockVideo' as never).props.onLoad({
      duration: 20,
      videoTracks: [],
      textTracks: [{ index: 0, title: 'Français', language: 'fr' }],
    });
  });
  const settings = renderer.root.findByProps({
    accessibilityLabel: 'Réglages de lecture',
  });
  expect(settings.props.accessibilityState.expanded).toBe(false);
  await Renderer.act(async () => settings.props.onPress());
  expect(settings.props.accessibilityState.expanded).toBe(true);
  await Renderer.act(async () =>
    renderer.root.findByProps({ testID: 'feed-captions' }).props.onPress(),
  );
  expect(
    renderer.root.findByType('MockVideo' as never).props.selectedTextTrack,
  ).toEqual({ type: 'index', value: 0 });
  await Renderer.act(async () =>
    renderer.root.findByProps({ testID: 'feed-captions' }).props.onPress(),
  );
  expect(
    renderer.root.findByType('MockVideo' as never).props.selectedTextTrack.type,
  ).toBe('disabled');
  await Renderer.act(async () => renderer.unmount());
});
