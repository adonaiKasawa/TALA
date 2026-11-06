import React from 'react';
import Renderer from 'react-test-renderer';
import { Pressable, Text } from 'react-native';
import { ToastProvider, useFeedback } from '../src/components/Toast';
function Example() {
  const [, show] = useFeedback(4500);
  return (
    <Pressable
      accessibilityLabel="Afficher le message"
      onPress={() => show('Connectez-vous pour continuer.')}
    >
      <Text>Tester</Text>
    </Pressable>
  );
}
test('les notifications disparaissent et leur durée repart lors d’un même message répété', async () => {
  jest.useFakeTimers();
  let renderer!: Renderer.ReactTestRenderer;
  try {
    await Renderer.act(async () => {
      renderer = Renderer.create(
        <ToastProvider>
          <Example />
        </ToastProvider>,
      );
    });
    const show = () =>
      renderer.root
        .findAllByProps({ accessibilityLabel: 'Afficher le message' })[0]
        .props.onPress();
    const visible = () =>
      renderer.root.findAllByProps({
        accessibilityLabel: 'Connectez-vous pour continuer. — fermer',
      }).length > 0;
    await Renderer.act(async () => show());
    expect(visible()).toBe(true);
    await Renderer.act(async () => jest.advanceTimersByTime(4000));
    await Renderer.act(async () => show());
    await Renderer.act(async () => jest.advanceTimersByTime(1000));
    expect(visible()).toBe(true);
    await Renderer.act(async () => jest.advanceTimersByTime(3500));
    expect(visible()).toBe(false);
    await Renderer.act(async () => show());
    await Renderer.act(async () =>
      renderer.root
        .findAllByProps({
          accessibilityLabel: 'Connectez-vous pour continuer. — fermer',
        })[0]
        .props.onPress(),
    );
    expect(visible()).toBe(false);
  } finally {
    if (renderer) await Renderer.act(async () => renderer.unmount());
    jest.useRealTimers();
  }
});
