"use strict";
(() => {
  // src/welcome.ts
  document.addEventListener("DOMContentLoaded", () => {
    const openGmailBtn = document.getElementById("open-gmail-btn");
    if (openGmailBtn) {
      openGmailBtn.addEventListener("click", () => {
        chrome.tabs.query({ url: "https://mail.google.com/*" }, (tabs) => {
          if (tabs && tabs.length > 0) {
            const tab = tabs[0];
            if (tab.id) {
              chrome.tabs.update(tab.id, { active: true });
              chrome.tabs.reload(tab.id);
            }
          } else {
            chrome.tabs.create({ url: "https://mail.google.com/" });
          }
        });
      });
    }
  });
})();
//# sourceMappingURL=welcome.js.map
