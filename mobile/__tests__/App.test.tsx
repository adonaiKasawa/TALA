/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { restore, request, signOut } from '../src/services/session';
import { Button } from '../src/components/ui';
jest.mock('../src/screens/VideosScreen', () => ({ VideosScreen: () => null }));
jest.mock('../src/screens/FeedScreen', () => ({ FeedScreen: () => null }));
jest.mock('../src/screens/SearchScreen', () => ({ SearchScreen: () => null }));
jest.mock('../src/screens/VideoGrid', () => ({ VideoGrid: () => null }));
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'SvgMock',
  Path: 'PathMock',
}));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/services/session', () => ({
  restore: jest.fn(async () => false),
  request: jest.fn(),
  clearSession: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  ClientError: class extends Error {},
}));

test('présente les parcours natifs de connexion et inscription sans données techniques', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findAllByProps({ accessibilityLabel: 'Profil' })[0]
      .props.onPress();
  });
  const tree = JSON.stringify(renderer!.toJSON());
  expect(tree).toContain('Se connecter');
  expect(tree).toContain('Créer un compte');
  expect(tree).not.toContain('refreshToken');
  await ReactTestRenderer.act(() => {
    renderer!.unmount();
  });
}, 30000);
test('se déconnecter revient au fil public ; seul le clic Profil ouvre les parcours de connexion', async () => {
  jest.mocked(restore).mockResolvedValueOnce(true);
  jest.mocked(request).mockImplementation(async path =>
    path.startsWith('/me/library')
      ? {
          items: [],
          stats: {
            videos: 0,
            reposts: 0,
            favorites: 0,
            followers: 0,
            following: 0,
          },
        }
      : path === '/account/me'
        ? { id: 'account', email: 'test@example.test', mfaEnabled: false }
        : {
            id: 'profile',
            username: 'nadia',
            displayName: 'Nadia',
            bio: '',
            avatarUrl: null,
            isPrivate: false,
            links: [],
            preferences: {
              country: 'CD',
              languages: ['fr'],
              interests: [],
              locale: 'fr',
            },
          },
  );
  jest.mocked(signOut).mockResolvedValue(undefined);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await ReactTestRenderer.act(async () =>
      renderer.root
        .findAllByProps({ accessibilityLabel: 'Profil' })[0]
        .props.onPress(),
    );
    await ReactTestRenderer.act(async () =>
      renderer.root
        .findAllByType(Button)
        .find(button => button.props.title === 'Compte')!
        .props.onPress(),
    );
    await ReactTestRenderer.act(async () =>
      renderer.root
        .findAllByType(Button)
        .find(button => button.props.title === 'Déconnexion')!
        .props.onPress(),
    );
    expect(signOut).toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Créer un compte');
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Accueil' })[0].props
        .accessibilityState.selected,
    ).toBe(true);
    await ReactTestRenderer.act(async () =>
      renderer.root
        .findAllByProps({ accessibilityLabel: 'Profil' })[0]
        .props.onPress(),
    );
    expect(JSON.stringify(renderer.toJSON())).toContain('Créer un compte');
  } finally {
    if (renderer) await ReactTestRenderer.act(async () => renderer.unmount());
  }
});
