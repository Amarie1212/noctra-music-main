import type { CSSProperties } from 'react';
import logoUrl from '../../build/icon.png';

const stars = [
  { left: '8%', top: '16%', size: 2, delay: '0.2s', duration: '3.8s' },
  { left: '14%', top: '58%', size: 3, delay: '1.2s', duration: '4.4s' },
  { left: '22%', top: '28%', size: 2, delay: '0.8s', duration: '4.8s' },
  { left: '29%', top: '76%', size: 1.5, delay: '2.1s', duration: '3.9s' },
  { left: '37%', top: '14%', size: 2.5, delay: '1.4s', duration: '5s' },
  { left: '45%', top: '64%', size: 2, delay: '0.6s', duration: '4.2s' },
  { left: '52%', top: '36%', size: 3, delay: '2.4s', duration: '4.9s' },
  { left: '60%', top: '12%', size: 1.5, delay: '0.4s', duration: '3.7s' },
  { left: '68%', top: '72%', size: 2.5, delay: '1.8s', duration: '4.6s' },
  { left: '74%', top: '26%', size: 2, delay: '1.1s', duration: '4.1s' },
  { left: '82%', top: '54%', size: 3, delay: '2.7s', duration: '5.1s' },
  { left: '89%', top: '18%', size: 2, delay: '0.9s', duration: '4.3s' },
  { left: '11%', top: '84%', size: 2.5, delay: '1.7s', duration: '4.7s' },
  { left: '33%', top: '48%', size: 1.5, delay: '2.3s', duration: '3.6s' },
  { left: '49%', top: '86%', size: 2, delay: '0.5s', duration: '4.5s' },
  { left: '57%', top: '52%', size: 1.5, delay: '1.5s', duration: '3.8s' },
  { left: '79%', top: '82%', size: 2, delay: '2.1s', duration: '4.2s' },
  { left: '92%', top: '66%', size: 2.5, delay: '1s', duration: '4.9s' },
];

type SplashScreenProps = {
  isVisible: boolean;
};

export default function SplashScreen({ isVisible }: SplashScreenProps) {
  return (
    <div className={`startup-splash${isVisible ? ' visible' : ' hidden'}`} aria-hidden={!isVisible}>
      <div className="startup-splash-stars" aria-hidden="true">
        {stars.map((star, index) => (
          <span
            key={`${star.left}-${star.top}-${index}`}
            className="startup-star"
            style={
              {
                '--star-left': star.left,
                '--star-top': star.top,
                '--star-size': `${star.size}px`,
                '--star-delay': star.delay,
                '--star-duration': star.duration,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="startup-splash-nebula" aria-hidden="true" />

      <div className="startup-splash-center">
        <div className="startup-logo-halo" aria-hidden="true" />
        <div className="startup-logo-motion">
          <img src={logoUrl} alt="NOCTRA" className="startup-logo" />
        </div>
        <p className="startup-splash-title">NOCTRA</p>
      </div>
    </div>
  );
}
