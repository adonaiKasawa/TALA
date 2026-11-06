import { useCallback, useEffect, useRef, useState } from 'react';
/** Brief feedback clears even when the exact same message is shown again. */
export function useTransientMessage(duration = 4500) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMessage('');
  }, []);
  const show = useCallback(
    (value: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(value);
      timer.current = value
        ? setTimeout(() => {
            timer.current = null;
            setMessage('');
          }, duration)
        : null;
    },
    [duration],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [message, show, dismiss] as const;
}
