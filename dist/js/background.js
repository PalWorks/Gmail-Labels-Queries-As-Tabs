"use strict";
(() => {
  // node_modules/@inboxsdk/core/background.js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "inboxsdk__injectPageWorld" && sender.tab) {
      if (chrome.scripting) {
        let documentIds;
        let frameIds;
        if (sender.documentId) {
          documentIds = [sender.documentId];
        } else {
          frameIds = [sender.frameId];
        }
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id, documentIds, frameIds },
          world: "MAIN",
          files: ["pageWorld.js"]
        });
        sendResponse(true);
      } else {
        sendResponse(false);
      }
    }
  });

  // src/background.ts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "openOptions") {
      chrome.runtime.openOptionsPage();
    } else if (message.action === "DOWNLOAD_FILE") {
      try {
        console.log("Background: Received DOWNLOAD_FILE request");
        if (!chrome.downloads) {
          throw new Error("chrome.downloads API is not available");
        }
        let base64Data;
        try {
          base64Data = btoa(unescape(encodeURIComponent(message.data)));
        } catch (e) {
          throw new Error("Failed to encode data: " + e.message);
        }
        const url = "data:application/json;base64," + base64Data;
        chrome.downloads.download({
          url,
          filename: message.filename,
          saveAs: false,
          conflictAction: "uniquify"
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("Background: Download failed:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log("Background: Download started, ID:", downloadId);
            sendResponse({ success: true, downloadId });
          }
        });
      } catch (e) {
        console.error("Background: Error processing download request:", e);
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }
  });
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_SETTINGS" }).catch((err) => {
        console.warn("Could not send message to tab:", err);
      });
    }
  });
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      const defaultLabels = [
        { name: "Inbox", id: "default-inbox" },
        { name: "Sent", id: "default-sent" }
      ];
      chrome.storage.sync.get(["labels"], (result) => {
        if (!result.labels) {
          chrome.storage.sync.set({ labels: defaultLabels });
        }
      });
    }
  });
})();
//# sourceMappingURL=background.js.map
