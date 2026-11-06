import React from 'react';
import { Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
const icons = {
  home: {
    light: require('../assets/icons/home-light.png'),
    accent: require('../assets/icons/home-accent.png'),
    dark: require('../assets/icons/home-dark.png'),
  },
  play: {
    light: require('../assets/icons/play-light.png'),
    accent: require('../assets/icons/play-accent.png'),
    dark: require('../assets/icons/play-dark.png'),
  },
  heart: {
    light: require('../assets/icons/heart-light.png'),
    accent: require('../assets/icons/heart-accent.png'),
    dark: require('../assets/icons/heart-dark.png'),
  },
  comment: {
    light: require('../assets/icons/comment-light.png'),
    accent: require('../assets/icons/comment-accent.png'),
    dark: require('../assets/icons/comment-dark.png'),
  },
  bookmark: {
    light: require('../assets/icons/bookmark-light.png'),
    accent: require('../assets/icons/bookmark-accent.png'),
    dark: require('../assets/icons/bookmark-dark.png'),
  },
  share: {
    light: require('../assets/icons/share-light.png'),
    accent: require('../assets/icons/share-accent.png'),
    dark: require('../assets/icons/share-dark.png'),
  },
  user: {
    light: require('../assets/icons/user-light.png'),
    accent: require('../assets/icons/user-accent.png'),
    dark: require('../assets/icons/user-dark.png'),
  },
  plus: {
    light: require('../assets/icons/plus-light.png'),
    accent: require('../assets/icons/plus-accent.png'),
    dark: require('../assets/icons/plus-dark.png'),
  },
  settings: {
    light: require('../assets/icons/settings-light.png'),
    accent: require('../assets/icons/settings-accent.png'),
    dark: require('../assets/icons/settings-dark.png'),
  },
  clock: {
    light: require('../assets/icons/clock-light.png'),
    accent: require('../assets/icons/clock-accent.png'),
    dark: require('../assets/icons/clock-dark.png'),
  },
  more: {
    light: require('../assets/icons/more-light.png'),
    accent: require('../assets/icons/more-accent.png'),
    dark: require('../assets/icons/more-dark.png'),
  },
  volume: {
    light: require('../assets/icons/volume-light.png'),
    accent: require('../assets/icons/volume-accent.png'),
    dark: require('../assets/icons/volume-dark.png'),
  },
  muted: {
    light: require('../assets/icons/muted-light.png'),
    accent: require('../assets/icons/muted-accent.png'),
    dark: require('../assets/icons/muted-dark.png'),
  },
  pause: {
    light: require('../assets/icons/pause-light.png'),
    accent: require('../assets/icons/pause-accent.png'),
    dark: require('../assets/icons/pause-dark.png'),
  },
};
export type IconName = keyof typeof icons | 'search' | 'messages';
export function Icon({
  name,
  size = 24,
  tone = 'light',
}: {
  name: IconName;
  size?: number;
  tone?: 'light' | 'accent' | 'dark';
}) {
  if (name === 'search' || name === 'messages')
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        accessibilityElementsHidden
      >
        <Path
          fill={
            tone === 'accent' ? '#ffc64b' : tone === 'dark' ? '#0e1012' : '#fff'
          }
          d={
            name === 'search'
              ? 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z'
              : 'M4 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H4Zm0 3 8 6 8-6v2l-8 6-8-6V6Z'
          }
        />
      </Svg>
    );
  return (
    <Image
      source={icons[name][tone]}
      style={{ width: size, height: size }}
      accessible={false}
    />
  );
}
