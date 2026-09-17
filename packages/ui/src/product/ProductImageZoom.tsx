import {useCallback, useId, useRef, useState} from 'react';
import {shopifyImage2048} from './shopifyImage2048';

const ZOOM_SCALE = 2.25;

type ProductImageZoomProps = {
  url: string;
  alt?: string | null;
  objectFit?: 'cover' | 'contain';
  /** CSS object-position for hero crop, e.g. `center 42%` */
  objectPosition?: string;
  /** Featured area background when objectFit is contain */
  backgroundColor?: string;
};

export function ProductImageZoom({
  url,
  alt,
  objectFit = 'cover',
  objectPosition = 'center center',
  backgroundColor,
}: ProductImageZoomProps) {
  const hintId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{x: number; y: number} | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [panning, setPanning] = useState(false);
  const [origin, setOrigin] = useState({x: '50%', y: '50%'});
  const [pan, setPan] = useState({x: 0, y: 0});

  const label = alt ? `Powiększ zdjęcie: ${alt}` : 'Powiększ zdjęcie';
  const objectClass =
    objectFit === 'contain' ? 'object-contain' : 'object-cover';

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin({x: `${x}%`, y: `${y}%`});
    setZoomed(true);
    setPan({x: 0, y: 0});
  }, []);

  const handleMouseLeave = useCallback(() => {
    setZoomed(false);
    setPan({x: 0, y: 0});
  }, []);

  const handleClick = useCallback(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    setZoomed((z) => {
      if (z) {
        setPan({x: 0, y: 0});
        setOrigin({x: '50%', y: '50%'});
      }
      return !z;
    });
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!zoomed || e.touches.length === 0) return;
      setPanning(true);
      touchStart.current = {x: e.touches[0].clientX, y: e.touches[0].clientY};
    },
    [zoomed],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!zoomed || !touchStart.current || e.touches.length === 0) return;
      const dx = e.touches[0].clientX - touchStart.current.x;
      const dy = e.touches[0].clientY - touchStart.current.y;
      touchStart.current = {x: e.touches[0].clientX, y: e.touches[0].clientY};
      setPan((p) => ({x: p.x + dx, y: p.y + dy}));
    },
    [zoomed],
  );

  const handleTouchEnd = useCallback(() => {
    touchStart.current = null;
    setPanning(false);
  }, []);

  const transform = zoomed
    ? `scale(${ZOOM_SCALE}) translate(${pan.x}px, ${pan.y}px)`
    : 'scale(1)';

  const cursorClass = zoomed
    ? panning
      ? 'cursor-grabbing'
      : 'cursor-grab'
    : 'cursor-zoom-in';

  return (
    <div className="flex h-full w-full flex-col">
      <div
        ref={containerRef}
        className={`relative min-h-0 flex-1 overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 ${cursorClass}`}
        style={backgroundColor ? {backgroundColor} : undefined}
        role="img"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={shopifyImage2048(url)}
          alt={alt ?? ''}
          className={`h-full w-full ${objectClass} transition-transform duration-150 ease-out`}
          style={{
            transform,
            transformOrigin: `${origin.x} ${origin.y}`,
            objectPosition,
          }}
          draggable={false}
          loading="eager"
          fetchPriority="high"
        />
      </div>
      <p
        id={hintId}
        className="mt-2 hidden text-center text-[10px] uppercase tracking-[0.22em] text-[rgb(var(--color-primary))]/50 md:block"
      >
        Najedź, aby powiększyć
      </p>
    </div>
  );
}
