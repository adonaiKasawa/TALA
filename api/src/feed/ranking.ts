export type RankingProfile = {
  interests: string[];
  languages: string[];
  country: string | null;
};
export type RankingVideo = {
  hashtags: string[];
  category: string;
  language: string;
  country: string | null;
  publishedAt: Date | null;
};
export function rankingFeatures(
  profile: RankingProfile,
  video: RankingVideo,
  following: boolean,
  newCreator: boolean,
  now = Date.now(),
) {
  const topics = new Set(
    [...video.hashtags, video.category].map((s) => s.toLocaleLowerCase()),
  );
  return [
    1,
    Number(profile.interests.some((s) => topics.has(s.toLocaleLowerCase()))),
    Number(profile.languages.includes(video.language)),
    Number(!!profile.country && profile.country === video.country),
    Number(following),
    Math.exp(
      -Math.max(0, now - (video.publishedAt?.getTime() || now)) /
        (7 * 86400000),
    ),
    Number(newCreator),
  ];
}
export const sigmoid = (x: number) =>
  1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
export const predict = (weights: number[], features: number[]) =>
  sigmoid(weights.reduce((sum, w, i) => sum + w * features[i], 0));
export type Sample = { features: number[]; label: number };
export function fit(samples: Sample[]) {
  const weights = Array(7).fill(0) as number[];
  for (let epoch = 0; epoch < 200; epoch++) {
    const gradient = Array(7).fill(0) as number[];
    for (const sample of samples) {
      const error = predict(weights, sample.features) - sample.label;
      gradient.forEach((_, j) => (gradient[j] += error * sample.features[j]));
    }
    weights.forEach(
      (w, j) =>
        (weights[j] -=
          0.1 * (gradient[j] / samples.length + (j ? 0.01 * w : 0))),
    );
  }
  return weights;
}
export function logLoss(
  samples: Sample[],
  probability: (sample: Sample) => number,
) {
  return (
    samples.reduce((sum, s) => {
      const p = Math.max(1e-6, Math.min(1 - 1e-6, probability(s)));
      return sum - s.label * Math.log(p) - (1 - s.label) * Math.log(1 - p);
    }, 0) / samples.length
  );
}
