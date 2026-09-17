/// <reference types="vite/client" />

// View Transitions API type definitions
interface Document {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
}

interface ViewTransition {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}
