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
  async function getAllAccounts() {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.get(null, (items) => {
          if (checkRuntimeError(reject)) return;
          const accounts = Object.keys(items).filter((k) => k.startsWith("account_")).map((k) => k.replace("account_", ""));
          resolve(accounts);
        });
      } catch (e) {
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

  // src/options.ts
  var labelList = document.getElementById("labels-list");
  var newLabelInput = document.getElementById("new-label-input");
  var addBtn = document.getElementById("add-btn");
  var exportBtn = document.getElementById("export-btn");
  var importBtn = document.getElementById("import-btn");
  var importFile = document.getElementById("import-file");
  var themeSelect = document.getElementById("theme-select");
  var accountSelect = document.getElementById("account-select");
  var currentAccount = null;
  document.addEventListener("DOMContentLoaded", async () => {
    await loadAccounts();
    if (currentAccount) {
      const settings = await getSettings(currentAccount);
      if (themeSelect) {
        themeSelect.value = settings.theme;
      }
      renderList();
    }
    accountSelect?.addEventListener("change", async () => {
      currentAccount = accountSelect.value;
      const settings = await getSettings(currentAccount);
      if (themeSelect) {
        themeSelect.value = settings.theme;
      }
      renderList();
    });
    themeSelect?.addEventListener("change", async () => {
      if (!currentAccount) return;
      const theme = themeSelect.value;
      await saveSettings(currentAccount, { theme });
    });
  });
  async function loadAccounts() {
    const accounts = await getAllAccounts();
    if (accountSelect) {
      accountSelect.innerHTML = "";
      if (accounts.length === 0) {
        const option = document.createElement("option");
        option.text = "No accounts found. Please open Gmail first.";
        option.disabled = true;
        option.selected = true;
        accountSelect.appendChild(option);
        disableControls(true);
      } else {
        accounts.forEach((acc) => {
          const option = document.createElement("option");
          option.value = acc;
          option.text = acc;
          accountSelect.appendChild(option);
        });
        currentAccount = accounts[0];
        accountSelect.value = currentAccount;
        disableControls(false);
      }
    }
  }
  function disableControls(disabled) {
    if (addBtn) addBtn.disabled = disabled;
    if (newLabelInput) newLabelInput.disabled = disabled;
    if (exportBtn) exportBtn.disabled = disabled;
    if (importBtn) importBtn.disabled = disabled;
    if (themeSelect) themeSelect.disabled = disabled;
  }
  async function renderList() {
    if (!currentAccount) return;
    const settings = await getSettings(currentAccount);
    if (!labelList) return;
    labelList.innerHTML = "";
    settings.tabs.forEach((tab, index) => {
      const li = document.createElement("li");
      li.draggable = true;
      li.dataset.id = tab.id;
      li.dataset.index = index.toString();
      li.innerHTML = `
      <div style="display: flex; align-items: center;">
        <span class="drag-handle">\u2630</span>
        <span>${escapeHtml(tab.title)}</span>
        ${tab.type === "hash" ? '<small style="color:#888; margin-left:4px;">(Custom)</small>' : ""}
      </div>
      <button class="remove-btn" title="Remove">\u2715</button>
    `;
      const removeBtn = li.querySelector(".remove-btn");
      removeBtn.addEventListener("click", async () => {
        if (currentAccount) {
          await removeTab(currentAccount, tab.id);
          renderList();
        }
      });
      li.addEventListener("dragstart", handleDragStart);
      li.addEventListener("dragover", handleDragOver);
      li.addEventListener("drop", handleDrop);
      li.addEventListener("dragenter", handleDragEnter);
      li.addEventListener("dragleave", handleDragLeave);
      labelList.appendChild(li);
    });
  }
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const name = newLabelInput.value;
      if (name && currentAccount) {
        await addTab(currentAccount, name, name, "label");
        newLabelInput.value = "";
        renderList();
      }
    });
  }
  if (newLabelInput) {
    newLabelInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        addBtn.click();
      }
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      if (!currentAccount) return;
      const settings = await getSettings(currentAccount);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings));
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `gmail_tabs_settings_${currentAccount}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    });
  }
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      importFile.click();
    });
  }
  if (importFile) {
    importFile.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file || !currentAccount) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result;
          const settings = JSON.parse(content);
          if (Array.isArray(settings.tabs)) {
            await saveSettings(currentAccount, settings);
            renderList();
            alert("Settings imported successfully!");
          } else {
            alert("Invalid JSON format.");
          }
        } catch (err) {
          console.error(err);
          alert("Error parsing JSON.");
        }
      };
      reader.readAsText(file);
    });
  }
  var dragSrcEl = null;
  function handleDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", this.innerHTML);
    this.classList.add("dragging");
  }
  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = "move";
    return false;
  }
  function handleDragEnter() {
    this.classList.add("over");
  }
  function handleDragLeave() {
    this.classList.remove("over");
  }
  async function handleDrop(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    if (dragSrcEl !== this && currentAccount) {
      const settings = await getSettings(currentAccount);
      const oldIndex = parseInt(dragSrcEl.dataset.index);
      const newIndex = parseInt(this.dataset.index);
      const item = settings.tabs.splice(oldIndex, 1)[0];
      settings.tabs.splice(newIndex, 0, item);
      await updateTabOrder(currentAccount, settings.tabs);
      renderList();
    }
    return false;
  }
  function escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return text.replace(/[&<>"']/g, function(m) {
      return map[m];
    });
  }
})();
//# sourceMappingURL=options.js.map
