"use strict";
(() => {
  // src/utils/storage.ts
  var DEFAULT_SETTINGS = {
    tabs: [],
    theme: "system",
    showUnreadCount: false
  };
  function getAccountKey(accountId) {
    return `account_${accountId}`;
  }
  function checkRuntimeError(reject) {
    if (chrome.runtime.lastError) {
      const msg = chrome.runtime.lastError.message;
      console.warn("Gmail Tabs: Storage Error:", msg);
      if (msg && msg.includes("Extension context invalidated")) {
        console.error("Gmail Tabs: Extension context invalidated. Please refresh the page.");
        reject(new Error("Extension context invalidated"));
      } else {
        reject(new Error(msg));
      }
      return true;
    }
    return false;
  }
  async function getSettings(accountId) {
    return new Promise((resolve, reject) => {
      const key = getAccountKey(accountId);
      try {
        chrome.storage.sync.get([key], (items) => {
          if (checkRuntimeError(reject)) return;
          const stored = items[key];
          const settings = { ...DEFAULT_SETTINGS, ...stored };
          resolve(settings);
        });
      } catch (e) {
        console.warn("Gmail Tabs: Storage call failed", e);
        reject(e);
      }
    });
  }
  async function saveSettings(accountId, newSettings) {
    try {
      const currentSettings = await getSettings(accountId);
      const mergedSettings = { ...currentSettings, ...newSettings };
      const key = getAccountKey(accountId);
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.sync.set({ [key]: mergedSettings }, () => {
            if (checkRuntimeError(reject)) return;
            resolve();
          });
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      console.warn("Gmail Tabs: Save settings failed", e);
      throw e;
    }
  }
  async function addTab(accountId, title, value, type = "label") {
    const settings = await getSettings(accountId);
    const newTab = {
      id: crypto.randomUUID(),
      title: title.trim(),
      value: value.trim(),
      type
    };
    if (!settings.tabs.some((t) => t.value === newTab.value)) {
      settings.tabs.push(newTab);
      await saveSettings(accountId, settings);
    }
  }
  async function removeTab(accountId, tabId) {
    const settings = await getSettings(accountId);
    console.log(`Gmail Tabs: Removing tab ${tabId} from account ${accountId}`);
    const initialLength = settings.tabs.length;
    settings.tabs = settings.tabs.filter((t) => {
      const match = t.id === tabId;
      if (match) console.log(`Gmail Tabs: Found tab to remove: ${t.title} (${t.id})`);
      return !match;
    });
    if (settings.tabs.length === initialLength) {
      console.warn(`Gmail Tabs: Failed to find tab with ID ${tabId} to remove. Available IDs:`, settings.tabs.map((t) => t.id));
    } else {
      console.log(`Gmail Tabs: Tab removed. New count: ${settings.tabs.length}`);
    }
    await saveSettings(accountId, settings);
  }
  async function updateTabOrder(accountId, newTabs) {
    const settings = await getSettings(accountId);
    settings.tabs = newTabs;
    await saveSettings(accountId, settings);
  }

  // src/popup.ts
  var themeSelect = document.getElementById("theme-select");
  var currentAccount = null;
  async function initTheme() {
    if (!currentAccount) return;
    const settings = await getSettings(currentAccount);
    if (themeSelect) {
      themeSelect.value = settings.theme;
      themeSelect.addEventListener("change", async () => {
        if (currentAccount) {
          const newTheme = themeSelect.value;
          await saveSettings(currentAccount, { theme: newTheme });
        }
      });
    }
  }
  var tabInput = document.getElementById("new-tab-input");
  var addTabBtn = document.getElementById("add-tab-btn");
  var tabsList = document.getElementById("tabs-list");
  async function initTabs() {
    if (!tabsList) return;
    await renderTabsList();
    if (addTabBtn) {
      addTabBtn.addEventListener("click", async () => {
        await handleAddTab();
      });
    }
    if (tabInput) {
      tabInput.addEventListener("keypress", async (e) => {
        if (e.key === "Enter") {
          await handleAddTab();
        }
      });
    }
  }
  async function handleAddTab() {
    if (!tabInput || !currentAccount) return;
    let value = tabInput.value.trim();
    if (value) {
      if (value.toLowerCase().startsWith("label:")) {
        value = value.substring(6).trim();
      }
      if (value) {
        await addTab(currentAccount, value, value, "label");
        tabInput.value = "";
        await renderTabsList();
      }
    }
  }
  async function renderTabsList() {
    if (!currentAccount) return;
    const settings = await getSettings(currentAccount);
    if (!tabsList) return;
    tabsList.innerHTML = "";
    settings.tabs.forEach((tab, index) => {
      const li = document.createElement("li");
      li.className = "label-item";
      li.setAttribute("draggable", "true");
      li.dataset.index = index.toString();
      const dragHandle = document.createElement("div");
      dragHandle.className = "drag-handle";
      dragHandle.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';
      li.appendChild(dragHandle);
      const nameSpan = document.createElement("span");
      nameSpan.className = "label-name";
      nameSpan.textContent = tab.title;
      if (tab.type === "hash") {
        const typeSpan = document.createElement("small");
        typeSpan.style.color = "#888";
        typeSpan.style.marginLeft = "4px";
        typeSpan.textContent = "(Custom)";
        nameSpan.appendChild(typeSpan);
      }
      li.appendChild(nameSpan);
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "\u2715";
      removeBtn.title = "Remove Tab";
      removeBtn.addEventListener("click", async () => {
        if (currentAccount) {
          await removeTab(currentAccount, tab.id);
          await renderTabsList();
        }
      });
      li.appendChild(removeBtn);
      li.addEventListener("dragstart", handleDragStart);
      li.addEventListener("dragenter", handleDragEnter);
      li.addEventListener("dragover", handleDragOver);
      li.addEventListener("dragleave", handleDragLeave);
      li.addEventListener("drop", handleDrop);
      li.addEventListener("dragend", handleDragEnd);
      tabsList.appendChild(li);
    });
  }
  var dragSrcEl = null;
  function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", this.dataset.index || "");
    }
  }
  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    return false;
  }
  function handleDragEnter(e) {
    this.classList.add("over");
  }
  function handleDragLeave(e) {
    this.classList.remove("over");
  }
  async function handleDrop(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    if (dragSrcEl !== this && currentAccount) {
      const oldIndex = parseInt(dragSrcEl.dataset.index || "0");
      const newIndex = parseInt(this.dataset.index || "0");
      const settings = await getSettings(currentAccount);
      const tabs = [...settings.tabs];
      const [movedTab] = tabs.splice(oldIndex, 1);
      tabs.splice(newIndex, 0, movedTab);
      await updateTabOrder(currentAccount, tabs);
      await renderTabsList();
    }
    return false;
  }
  function handleDragEnd(e) {
    dragSrcEl = null;
    document.querySelectorAll(".label-item").forEach((item) => {
      item.classList.remove("over", "dragging");
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id && activeTab.url && activeTab.url.includes("mail.google.com")) {
        chrome.tabs.sendMessage(activeTab.id, { action: "GET_ACCOUNT_INFO" }, (response) => {
          if (chrome.runtime.lastError) {
            console.log("Could not connect to content script");
            showError("Please reload Gmail or navigate to a Gmail tab.");
            return;
          }
          if (response && response.account) {
            currentAccount = response.account;
            initTheme();
            initTabs();
          } else {
            showError("Could not detect Gmail account. Please wait for Gmail to load.");
          }
        });
      } else {
        showError("Please open Gmail to configure tabs.");
      }
    });
  });
  function showError(msg) {
    if (tabsList) {
      tabsList.innerHTML = `<li style="padding:10px; color:#666;">${msg}</li>`;
    }
    if (addTabBtn) addTabBtn.disabled = true;
    if (tabInput) tabInput.disabled = true;
    if (themeSelect) themeSelect.disabled = true;
  }
})();
//# sourceMappingURL=popup.js.map
