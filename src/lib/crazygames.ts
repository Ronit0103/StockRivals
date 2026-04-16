
// Type definitions for CrazyGames SDK v3
export interface CrazyGamesSDK {
  ad: {
    requestAd: (type: 'midroll' | 'rewarded', callbacks: {
      adStarted?: () => void;
      adFinished?: () => void;
      adError?: (error: string) => void;
    }) => void;
    hasAdblock: () => Promise<boolean>;
  };
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime: () => void;
  };
  user: {
    isUserAccountAvailable: () => boolean;
    getUser: () => Promise<any>;
    showAuthPrompt: () => Promise<any>;
  };
}

declare global {
  interface Window {
    CrazyGames: {
      SDK: Promise<CrazyGamesSDK>;
    };
  }
}

let sdkInstance: CrazyGamesSDK | null = null;

export const initCrazyGamesSDK = async () => {
  if (sdkInstance) return sdkInstance;
  if (window.CrazyGames) {
    sdkInstance = await window.CrazyGames.SDK;
    console.log("CrazyGames SDK Initialized");
    return sdkInstance;
  }
  return null;
};

export const getCrazyGamesSDK = () => sdkInstance;

export const requestAd = (type: 'midroll' | 'rewarded', onFinished?: () => void, onError?: (err: string) => void) => {
  if (!sdkInstance) {
    onFinished?.();
    return;
  }

  sdkInstance.ad.requestAd(type, {
    adStarted: () => {
      console.log("Ad started");
      // You might want to mute game audio here
    },
    adFinished: () => {
      console.log("Ad finished");
      onFinished?.();
    },
    adError: (error) => {
      console.error("Ad error:", error);
      onError?.(error);
      onFinished?.(); // Continue game even if ad fails
    }
  });
};

export const reportGameplayStart = () => {
  sdkInstance?.game.gameplayStart();
};

export const reportGameplayStop = () => {
  sdkInstance?.game.gameplayStop();
};

export const reportHappyTime = () => {
  sdkInstance?.game.happytime();
};
