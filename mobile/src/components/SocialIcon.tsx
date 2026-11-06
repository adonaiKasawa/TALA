import React from 'react';
import { Image } from 'react-native';
const icons = {
  heart: {
    light: require('../assets/icons/heart-filled-light.png'),
    accent: require('../assets/icons/heart-filled-accent.png'),
    liked: require('../assets/icons/heart-filled-liked.png'),
  },
  comment: {
    light: require('../assets/icons/comment-filled-light.png'),
    accent: require('../assets/icons/comment-filled-accent.png'),
    liked: require('../assets/icons/comment-filled-liked.png'),
  },
  bookmark: {
    light: require('../assets/icons/bookmark-filled-light.png'),
    accent: require('../assets/icons/bookmark-filled-accent.png'),
    liked: require('../assets/icons/bookmark-filled-liked.png'),
  },
  share: {
    light: require('../assets/icons/share-filled-light.png'),
    accent: require('../assets/icons/share-filled-accent.png'),
    liked: require('../assets/icons/share-filled-liked.png'),
  },
};
export function SocialIcon({
  name,
  tone = 'light',
  size = 34,
}: {
  name: keyof typeof icons;
  tone?: 'light' | 'accent' | 'liked';
  size?: number;
}) {
  return (
    <Image
      accessible={false}
      source={icons[name][tone]}
      style={{ width: size, height: size }}
    />
  );
}
