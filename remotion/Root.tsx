import React from 'react';
import { Composition } from 'remotion';
import { MarketVideo, MarketVideoProps } from './MarketVideo';

const DEFAULT_PROPS: MarketVideoProps = {
  question: 'Will SpaceX acquire Cursor?',
  icon: null,
  tags: ['Tech', 'AI'],
  yesPrice: 0.91,
  delta24hPct: 41,
  history: Array.from({ length: 200 }, (_, i) => ({
    t: i,
    p: 0.45 + 0.45 * Math.min(1, Math.pow(i / 199, 1.3)),
  })),
  headline: '',
  format: 'caption',
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MarketVideo"
      component={MarketVideo}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1440}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={({ props }) => {
        const f = (props as MarketVideoProps).format;
        if (f === 'narrow') return { width: 960, height: 1098 };
        if (f === 'square') return { width: 1080, height: 1080 };
        return { width: 1080, height: 1440 };
      }}
    />
  );
};
