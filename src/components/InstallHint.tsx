import { useEffect, useState } from 'react';
import { Button } from './ui';

const DISMISS_KEY = 'ra.installHint.v1';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone/iPad Safari: no install prompt, so explain the Share menu instead. */
const isIosSafari = () => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
};

/**
 * Suggests adding RepCounter to the home screen, once the user has saved a
 * set. Chrome/Edge/Android show an Install button (their own prompt); iOS
 * Safari gets the Share-menu steps. Hidden when already installed, inside
 * social apps' built-in browsers, or after being dismissed.
 */
export function InstallHint({ show, inApp }: { show: boolean; inApp: boolean }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!show || inApp || dismissed || isStandalone() || (!prompt && !isIosSafari())) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] text-ink-2">
      <p className="leading-snug">
        {prompt ? (
          <>Add RepCounter to your home screen to open it like an app at the gym.</>
        ) : (
          <>
            Add RepCounter to your home screen: tap <span className="font-semibold text-ink">Share</span>, then{' '}
            <span className="font-semibold text-ink">Add to Home Screen</span>.
          </>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {prompt && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              void prompt.prompt();
              setPrompt(null);
            }}
          >
            Install
          </Button>
        )}
        <button type="button" onClick={dismiss} className="text-ink-3 underline-offset-2 hover:underline">
          Not now
        </button>
      </div>
    </div>
  );
}
