import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const sharp = createRequire(new URL('../web/package.json', import.meta.url))('sharp');
const paths = {
  heart: 'M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z',
  comment: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-4a8.5 8.5 0 1 1 16-4.5Z',
  bookmark: 'M6 3h12v18l-6-4-6 4Z',
  share: 'm14 3 7 7-7 7v-5C7 12 4 15 3 20c-1-9 3-14 11-14Z',
};
for (const [name, d] of Object.entries(paths)) {
  for (const [tone, color] of [['light', '#ffffff'], ['accent', '#ffc64b'], ['liked', '#ff453a']]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-2 -2 28 28"><defs><filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity=".65"/></filter></defs><path d="${d}" fill="${color}" filter="url(#shadow)"/></svg>`;
    await sharp(Buffer.from(svg)).resize(128,128).png().toFile(fileURLToPath(new URL(`../mobile/src/assets/icons/${name}-filled-${tone}.png`, import.meta.url)));
  }
}
fs.writeFileSync(new URL('../mobile/src/components/SocialIcon.tsx', import.meta.url), `import React from 'react';\nimport {Image} from 'react-native';\nconst icons={${Object.keys(paths).map(name => `${name}:{${['light','accent','liked'].map(tone => `${tone}:require('../assets/icons/${name}-filled-${tone}.png')`).join(',')}}`).join(',')}};\nexport function SocialIcon({name,tone='light',size=34}:{name:keyof typeof icons;tone?:'light'|'accent'|'liked';size?:number}){return <Image accessible={false} source={icons[name][tone]} style={{width:size,height:size}}/>;}\n`);
