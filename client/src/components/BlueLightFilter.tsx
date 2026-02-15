import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/authContext';

function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 7;
}

export default function BlueLightFilter() {
  const { user } = useAuth();
  const [active, setActive] = useState(false);

  const { data: profile } = useQuery<{ blueLightFilter?: boolean }>({
    queryKey: ['/api/profile'],
    enabled: !!user,
    staleTime: 60000,
  });

  const enabled = profile?.blueLightFilter === true;

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }

    setActive(isNightTime());

    const interval = setInterval(() => {
      setActive(isNightTime());
    }, 60000);

    return () => clearInterval(interval);
  }, [enabled]);

  if (!active) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        pointerEvents: 'none',
        backgroundColor: 'rgba(255, 140, 0, 0.12)',
        mixBlendMode: 'multiply',
        transition: 'opacity 2s ease-in-out',
      }}
      aria-hidden="true"
    />
  );
}
