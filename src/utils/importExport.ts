/**
 * importExport.ts
 *
 * Shared import/export utilities used by both the Gmail overlay (modals.ts)
 * and the options page (options.ts).
 *
 * Provides: payload construction, filename generation, validation, and
 * the download trigger via chrome.runtime.sendMessage.
 */

import { Tab } from './storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportData {
    version: number;
    timestamp: number;
    email: string;
    tabs: Tab[];
}

export interface DownloadResult {
    success: boolean;
    downloadId?: number;
    error?: string;
}

// ---------------------------------------------------------------------------
// Payload & Filename
// ---------------------------------------------------------------------------

/**
 * Build a versioned export payload from the given email and tabs.
 */
export function buildExportPayload(email: string, tabs: Tab[]): ExportData {
    return {
        version: 1,
        timestamp: Date.now(),
        email,
        tabs,
    };
}

/**
 * Generate a safe, timestamped filename for an export file.
 * Example: GmailTabs_user_gmail_com_2026-03-03.json
 */
export function generateExportFilename(email: string): string {
    const date = new Date().toISOString().split('T')[0];
    const sanitizedEmail = email.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `GmailTabs_${sanitizedEmail}_${date}.json`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate imported JSON data. Returns the tabs array on success.
 * Throws a descriptive Error on validation failure.
 *
 * Checks:
 *  1. `data.tabs` is a non-missing array
 *  2. Each entry is an object with valid id, title, type, and value
 */
export function validateImportData(data: Record<string, unknown>): Tab[] {
    if (!data.tabs || !Array.isArray(data.tabs)) {
        throw new Error('Invalid format: Missing "tabs" array.');
    }

    const tabs = data.tabs as Record<string, unknown>[];
    for (let i = 0; i < tabs.length; i++) {
        const t = tabs[i];
        if (!t || typeof t !== 'object') {
            throw new Error(`Invalid tab at index ${i}: not an object.`);
        }
        if (typeof t.id !== 'string' || !(t.id as string).trim()) {
            throw new Error(`Invalid tab at index ${i}: missing or empty "id".`);
        }
        if (typeof t.title !== 'string' || !(t.title as string).trim()) {
            throw new Error(`Invalid tab at index ${i}: missing or empty "title".`);
        }
        if (t.type !== 'label' && t.type !== 'hash') {
            throw new Error(`Invalid tab at index ${i}: "type" must be "label" or "hash".`);
        }
        if (typeof t.value !== 'string' || !(t.value as string).trim()) {
            throw new Error(`Invalid tab at index ${i}: missing or empty "value".`);
        }
    }

    return tabs as unknown as Tab[];
}

// ---------------------------------------------------------------------------
// Download Trigger
// ---------------------------------------------------------------------------

/**
 * Send a DOWNLOAD_FILE message to the background script.
 * Returns a promise that resolves with the background response.
 */
export function triggerDownload(filename: string, json: string): Promise<DownloadResult> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            {
                action: 'DOWNLOAD_FILE',
                filename,
                data: json,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Gmail Tabs: Download message failed', chrome.runtime.lastError);
                    resolve({
                        success: false,
                        error: chrome.runtime.lastError.message || 'Message failed',
                    });
                    return;
                }
                if (response && response.success) {
                    resolve({ success: true, downloadId: response.downloadId });
                } else {
                    resolve({
                        success: false,
                        error: response?.error || 'Unknown error',
                    });
                }
            }
        );
    });
}
