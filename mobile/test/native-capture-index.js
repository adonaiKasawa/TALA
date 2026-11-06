// Development-only verification of the real creation flow, including native camera and picker.
import React from 'react';
import { AppRegistry, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../src/components/Toast';
import { CreateVideoWizard } from '../src/video/CreateVideoWizard';
if (!__DEV__) throw new Error('Development preview only.');
function App() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <View style={styles.root}>
          <CreateVideoWizard
            close={() => {}}
            reload={async () => {}}
            posted={() => {}}
          />
        </View>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e1012' },
});
AppRegistry.registerComponent('TalaMobile', () => App);
