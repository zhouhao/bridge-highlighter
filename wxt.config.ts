import { defineConfig } from 'wxt';

export default defineConfig({
  modules: [],
  manifest: {
    name: 'Shark Eagle Highlighter',
    description: 'Save and highlight text selections across page visits',
    version: '1.1.4',
    permissions: ['contextMenus', 'sidePanel', 'tabs'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    side_panel: {
      default_path: 'sidepanel.html'
    },
    action: {
      default_title: 'Open Shark Eagle Panel',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true
    } as any
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      if (manifest.options_ui) {
        (manifest.options_ui as any).open_in_tab = true;
      }
    }
  },
  webExt: {
    startUrls: ['https://hzhou.me/2020/12/24/SaltyNote-Server-Setup/']
  }
});
