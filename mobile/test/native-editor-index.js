// Standalone native verification entry. Never imported by the product entry.
import React, { useState } from 'react';
import {
  AppRegistry,
  Image,
  Text,
  View,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BlobUtil from 'react-native-blob-util';
import { ClipComposer } from '../src/video/ClipComposer';
import { ToastProvider, useFeedback } from '../src/components/Toast';
if (!__DEV__) throw new Error('Native preview is development-only.');
function Feedback() {
  const [, show] = useFeedback();
  return (
    <View style={styles.feedback}>
      <Pressable
        accessibilityLabel="Tester la notification"
        onPress={() => show('Connectez-vous pour continuer.')}
      >
        <Text style={styles.label}>Tester la notification</Text>
      </Pressable>
    </View>
  );
}
function Preview() {
  const [output, setOutput] = useState(null),
    [closed, setClosed] = useState(false);
  if (closed) return <Feedback />;
  if (output)
    return (
      <View style={styles.output}>
        <Text style={styles.title} accessibilityLabel="Export natif réussi">
          Export natif réussi
        </Text>
        <Image
          source={{ uri: 'file://' + output }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>
    );
  return (
    <ClipComposer
      uri="file:///data/user/0/com.talamobile/cache/tala-editor-fixture.mp4"
      cancel={() => setClosed(true)}
      done={async result => {
        const folder = BlobUtil.fs.dirs.DocumentDir;
        if (result.overlay) {
          await BlobUtil.fs.cp(
            result.overlay.replace(/^file:\/\//, ''),
            folder + '/tala-editor-export.png',
          );
        }
        await BlobUtil.fs.writeFile(
          folder + '/tala-editor-result.json',
          JSON.stringify({
            edit: result.edit,
            art: result.art,
            duration: result.duration,
            cover: result.cover,
          }),
          'utf8',
        );
        setOutput(folder + '/tala-editor-export.png');
      }}
    />
  );
}
function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <Preview />
      </ToastProvider>
    </SafeAreaProvider>
  );
}
AppRegistry.registerComponent('TalaMobile', () => App);
const styles = StyleSheet.create({
  feedback: {
    flex: 1,
    backgroundColor: '#101214',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#ffc64b', fontSize: 20 },
  output: { flex: 1, backgroundColor: '#16181b' },
  title: { color: '#ffc64b', padding: 20 },
  image: { flex: 1 },
});
