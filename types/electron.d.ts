export {};

declare global {
  interface Window {
    electronAPI?: {
      platform: NodeJS.Platform;
      versions: {
        electron?: string;
        chrome?: string;
        node?: string;
      };
    };
  }
}
