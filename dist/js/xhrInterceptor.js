"use strict";
(() => {
  // src/xhrInterceptor.ts
  function dispatchUnreadUpdate(updates) {
    if (!updates || updates.length === 0) return;
    const event = new CustomEvent("gmailTabs:unreadUpdate", {
      detail: updates
    });
    document.dispatchEvent(event);
  }
  function parseGmailJson(text) {
    try {
      const cleanText = text.replace(/^\)]}'\n/, "");
      return JSON.parse(cleanText);
    } catch (e) {
      return null;
    }
  }
  function interceptXHR() {
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;
    XHR.open = function(method, url) {
      this._url = url.toString();
      return originalOpen.apply(this, arguments);
    };
    XHR.send = function(body) {
      const xhr = this;
      this.addEventListener("load", function() {
        const url = xhr._url || "";
        if (url.includes("/sync/") || url.includes("/mail/u/") && !url.includes("?")) {
          try {
            const responseText = xhr.responseText;
            if (responseText) {
              processResponse(responseText);
            }
          } catch (e) {
            console.error("Gmail Tabs: Error processing XHR response", e);
          }
        }
      });
      return originalSend.apply(this, arguments);
    };
  }
  function processResponse(responseText) {
    const data = parseGmailJson(responseText);
    if (!data) return;
    const updates = [];
    findCounts(data, updates);
    if (updates.length > 0) {
      dispatchUnreadUpdate(updates);
    }
  }
  function findCounts(obj, updates) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      if (obj.length >= 2 && typeof obj[0] === "string" && typeof obj[1] === "number") {
        const labelId = obj[0];
        const count = obj[1];
        if (isValidLabel(labelId)) {
          updates.push({ label: labelId, count });
        }
      }
      for (const item of obj) {
        findCounts(item, updates);
      }
    } else {
      for (const key in obj) {
        findCounts(obj[key], updates);
      }
    }
  }
  function isValidLabel(label) {
    if (!label) return false;
    if (label.includes("http")) return false;
    if (label.includes("gmail/att/")) return false;
    if (label.includes("/")) {
      if (label.startsWith("/")) return false;
    }
    if (label.length > 80) return false;
    return true;
  }
  interceptXHR();
  console.log("Gmail Tabs: pageWorld.js loaded and intercepting XHR");
})();
//# sourceMappingURL=xhrInterceptor.js.map
