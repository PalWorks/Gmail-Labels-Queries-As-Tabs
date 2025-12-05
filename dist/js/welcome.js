"use strict";
(() => {
  // src/welcome.ts
  document.addEventListener("DOMContentLoaded", () => {
    const openGmailBtn = document.getElementById("open-gmail-btn");
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    function applyTheme(theme) {
      if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else if (theme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }
    chrome.storage.sync.get(["theme"], (result) => {
      const savedTheme = result.theme || "system";
      applyTheme(savedTheme);
      const radioToSelect = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
      if (radioToSelect) {
        radioToSelect.checked = true;
      }
    });
    themeRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const target = e.target;
        if (target.checked) {
          const newTheme = target.value;
          applyTheme(newTheme);
          chrome.storage.sync.set({ theme: newTheme });
        }
      });
    });
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
