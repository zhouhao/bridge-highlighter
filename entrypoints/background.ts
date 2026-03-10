import {
  getHighlightsForUrl,
  saveHighlight,
  updateHighlight,
  removeHighlight,
  getAllHighlights,
} from '@/utils/db';

export default defineBackground(() => {
  // Create context menu on install
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'save-highlight',
      title: 'Highlight Text',
      contexts: ['selection']
    });
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;

    if (info.menuItemId === 'save-highlight') {
      chrome.tabs.sendMessage(tab.id, { action: 'saveHighlight' });
    }
  });

  // Handle action click to open side panel
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // Listen for messages from content script and sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getHighlights') {
      getHighlightsForUrl(message.url).then(sendResponse);
      return true;
    } else if (message.action === 'saveHighlightData') {
      saveHighlight(message.url, message.highlight).then(() => sendResponse(true));
      return true;
    } else if (message.action === 'updateHighlightData') {
      updateHighlight(message.url, message.highlightId, message.updates).then(() => sendResponse(true));
      return true;
    } else if (message.action === 'removeHighlightData') {
      removeHighlight(message.url, message.highlightId).then(() => sendResponse(true));
      return true;
    } else if (message.action === 'getAllHighlights') {
      getAllHighlights().then(sendResponse);
      return true;
    }
  });

  // Notify sidepanel of tab switches
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      chrome.runtime.sendMessage({
        action: 'tabActivated',
        tabId: activeInfo.tabId
      });
    } catch (error) {
      console.debug('Could not notify sidepanel of tab change:', error);
    }
  });
});
