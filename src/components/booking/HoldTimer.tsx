import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface HoldTimerProps {
  expiresAt: string;
  onExpire?: () => void;
}

export const HoldTimer: React.FC<HoldTimerProps> = ({ expiresAt, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isCritical, setIsCritical] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const expiration = new Date(expiresAt).getTime();
      const distance = expiration - now;

      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft('00:00');
        if (onExpire) onExpire();
        return;
      }

      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      
      if (distance < 60000) { // Less than 1 minute
        setIsCritical(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  if (!timeLeft) return null;

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300 ${
      isCritical ? 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error)] animate-pulse' : 'bg-[var(--surface-glass)] text-[var(--primary-500)] border-[var(--border-glass)]'
    }`}>
      <Clock className="w-4 h-4" />
      <span className="font-mono text-sm" style={{ fontWeight: 'var(--font-weight-bold)' }}>{timeLeft}</span>
    </div>
  );
};
