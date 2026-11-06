import React from 'react';
import Renderer from 'react-test-renderer';
import { AppState, FlatList } from 'react-native';
import { FeedScreen } from '../src/screens/FeedScreen';
import { feedRequest } from '../src/feed/api';
import { Button } from '../src/components/ui';

jest.mock('../src/services/session', () => ({ request: jest.fn() }));
jest.mock('../src/feed/api', () => ({ feedRequest: jest.fn() }));
jest.mock('../src/feed/FeedCard', () => ({ FeedCard: () => null }));
jest.mock('../src/feed/Library', () => ({
  Library: () => null,
  Creator: () => null,
}));
jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/private' },
    readFile: jest.fn(async () => '{}'),
  },
}));

test('la première vidéo démarre et reste active après une actualisation sans changement de visibilité', async () => {
  AppState.currentState = 'active';
  const items = [{ id: 'first' }, { id: 'second' }];
  jest.mocked(feedRequest).mockResolvedValue({ items, nextCursor: null });
  let renderer!: Renderer.ReactTestRenderer;
  const card = (index: number) => {
    const list = renderer.root.findByType(FlatList);
    return list.props.renderItem({ item: items[index], index }).props;
  };
  try {
    await Renderer.act(async () => {
      renderer = Renderer.create(<FeedScreen signedIn={false} />);
    });
    expect(card(0).active).toBe(true);
    expect(card(1).active).toBe(false);
    await Renderer.act(async () => {
      renderer.root.findByType(FlatList).props.onViewableItemsChanged({
        viewableItems: [{ index: 1, isViewable: true }],
      });
    });
    expect(card(0).active).toBe(false);
    expect(card(1).active).toBe(true);
    await Renderer.act(async () => {
      renderer.root
        .findAllByType(Button)
        .find(b => b.props.title === 'Actualiser le fil')!
        .props.onPress();
    });
    // FlatList may keep the same visible keys and emit no new callback.
    expect(card(0).active).toBe(true);
    expect(card(1).active).toBe(false);
  } finally {
    if (renderer) await Renderer.act(async () => renderer.unmount());
  }
}, 30000);
