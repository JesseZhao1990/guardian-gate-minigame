declare const wx: {
  createCanvas(): any;
  createInnerAudioContext(): any;
  getWindowInfo?(): {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    safeArea?: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
  };
  getSystemInfoSync(): {
    windowWidth: number;
    windowHeight: number;
    pixelRatio: number;
    safeArea?: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
  };
  getMenuButtonBoundingClientRect?(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  onTouchStart(listener: (event: any) => void): void;
  onTouchMove(listener: (event: any) => void): void;
  onTouchEnd(listener: (event: any) => void): void;
  onTouchCancel(listener: (event: any) => void): void;
  onHide(listener: () => void): void;
  onShow(listener: () => void): void;
  onShareAppMessage?(listener: () => { title: string; imageUrl?: string; query?: string }): void;
  showShareMenu?(options?: { menus?: Array<'shareAppMessage' | 'shareTimeline'> }): void;
  onWindowResize?(listener: () => void): void;
  onAudioInterruptionBegin?(listener: () => void): void;
  onAudioInterruptionEnd?(listener: () => void): void;
  vibrateShort?(options?: { type?: 'heavy' | 'medium' | 'light' }): void;
};
