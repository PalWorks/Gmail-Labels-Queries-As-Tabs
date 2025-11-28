/**
 * background.ts
 *
 * Service worker for the extension.
 * Handles opening the options page.
 */

import '@inboxsdk/core/background.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openOptions') {
        chrome.runtime.openOptionsPage();
    } else if (message.action === 'DOWNLOAD_FILE') {
        try {
            console.log("Background: Received DOWNLOAD_FILE request");

            if (!chrome.downloads) {
                throw new Error("chrome.downloads API is not available");
            }

            // Use Base64 encoding to avoid character issues
            // Wrap in try-catch specifically for encoding issues
            let base64Data;
            try {
                base64Data = btoa(unescape(encodeURIComponent(message.data)));
            } catch (e) {
                throw new Error("Failed to encode data: " + (e as Error).message);
            }

            const url = 'data:application/json;base64,' + base64Data;

            chrome.downloads.download({
                url: url,
                filename: message.filename,
                saveAs: false,
                conflictAction: 'uniquify'
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error("Background: Download failed:", chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log("Background: Download started, ID:", downloadId);
                    sendResponse({ success: true, downloadId: downloadId });
                }
            });
        } catch (e: any) {
            console.error("Background: Error processing download request:", e);
            sendResponse({ success: false, error: e.message });
        }
        return true; // Keep channel open for async response
    }
});

chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_SETTINGS" })
            .catch((err) => {
                // Ignore errors if the content script isn't ready
                console.warn("Could not send message to tab:", err);
            });
    }
});

// Optional: Install hook
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Could set default labels here if we wanted
        const defaultLabels = [
            { name: 'Inbox', id: 'default-inbox' },
            { name: 'Sent', id: 'default-sent' }
        ];
        chrome.storage.sync.get(['labels'], (result) => {
            if (!result.labels) {
                chrome.storage.sync.set({ labels: defaultLabels });
            }
        });
    }
});
