import { createSignal, onMount } from 'frameact';

export default function useBrowserOnline() {
  const [isOnline, setIsOnline] = createSignal(window.navigator.onLine);

  onMount(() => {
    function handleChange() {
      setIsOnline(window.navigator.onLine);
    }

    window.addEventListener('online', handleChange);
    window.addEventListener('offline', handleChange);

    return () => {
      window.removeEventListener('offline', handleChange);
      window.removeEventListener('online', handleChange);
    };
  });

  return isOnline;
}
