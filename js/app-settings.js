import { choiceSetting } from './modes/shared.js';

// Settings shared by every mode. Stored like a mode's settings, under id 'app'.
// shown(): whether the setting does anything on this device.
export const APP = {
  id: 'app',
  settings: [
    {
      // iPhone only. Android has no silent-switch audio behaviour to choose.
      ...choiceSetting('silent', 'On silent', ['Still play', 'Stay quiet']),
      shown: () => 'audioSession' in navigator,
    },
  ],
};
