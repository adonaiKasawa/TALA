import React, { useRef, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';
import { timeLabel } from './editing';
export function TrimControl({
  duration,
  start,
  end,
  onChange,
}: {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const track = useRef<React.ComponentRef<typeof View>>(null),
    origin = useRef(0),
    edge = useRef<'start' | 'end'>('start');
  const [width, setWidth] = useState(1);
  function updatePosition(pageX: number) {
    const value = Math.max(
      0,
      Math.min(duration, ((pageX - origin.current) / width) * duration),
    );
    if (edge.current === 'start') onChange(Math.min(value, end - 0.25), end);
    else onChange(start, Math.max(value, start + 0.25));
  }
  return (
    <View style={s.container}>
      <View style={s.labels}>
        <Text style={s.label}>Début {timeLabel(start)}</Text>
        <Text style={s.label}>Fin {timeLabel(end)}</Text>
      </View>
      <View
        ref={track}
        style={s.track}
        accessible
        onLayout={e => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        accessibilityRole="adjustable"
        accessibilityLabel="Découper la vidéo"
        accessibilityValue={{
          text: `De ${timeLabel(start)} à ${timeLabel(end)}`,
        }}
        accessibilityActions={[
          { name: 'startEarlier', label: 'Reculer le début de 0,5 seconde' },
          { name: 'startLater', label: 'Avancer le début de 0,5 seconde' },
          { name: 'endEarlier', label: 'Reculer la fin de 0,5 seconde' },
          { name: 'endLater', label: 'Avancer la fin de 0,5 seconde' },
        ]}
        onAccessibilityAction={e => {
          const action = e.nativeEvent.actionName;
          if (action === 'startEarlier')
            onChange(Math.max(0, start - 0.5), end);
          if (action === 'startLater')
            onChange(Math.min(end - 0.25, start + 0.5), end);
          if (action === 'endEarlier')
            onChange(start, Math.max(start + 0.25, end - 0.5));
          if (action === 'endLater')
            onChange(start, Math.min(duration, end + 0.5));
        }}
        onStartShouldSetResponder={() => duration > 0}
        onResponderGrant={e => {
          const pageX = e.nativeEvent.pageX;
          track.current?.measureInWindow(x => {
            origin.current = x;
            const value = ((pageX - x) / width) * duration;
            edge.current =
              Math.abs(value - start) < Math.abs(value - end) ? 'start' : 'end';
            updatePosition(pageX);
          });
        }}
        onResponderMove={(e: GestureResponderEvent) =>
          updatePosition(e.nativeEvent.pageX)
        }
      >
        <View
          pointerEvents="none"
          style={[
            s.selection,
            {
              left: `${(start / (duration || 1)) * 100}%`,
              right: `${(1 - end / (duration || 1)) * 100}%`,
            },
          ]}
        >
          <View style={s.handle} />
          <View style={s.handle} />
        </View>
        <Text pointerEvents="none" style={s.hint}>
          Glissez les bords pour choisir l’extrait
        </Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 8 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 12, color: '#ddd8d0', fontVariant: ['tabular-nums'] },
  track: {
    height: 60,
    backgroundColor: '#242629',
    borderRadius: 10,
    justifyContent: 'center',
  },
  selection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: '#ffc64b',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  handle: {
    width: 8,
    height: '100%',
    backgroundColor: '#ffc64b',
    borderRadius: 6,
  },
  hint: { fontSize: 10, color: '#eee7dd', textAlign: 'center' },
});
