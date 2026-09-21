/**
 * importExport.test.ts
 *
 * Unit tests for the shared import/export utilities.
 */

import { buildExportPayload, generateExportFilename, validateImportData, triggerDownload } from '../src/utils/importExport';
import { Tab } from '../src/utils/storage';

// ---------------------------------------------------------------------------
// Mock chrome API
// ---------------------------------------------------------------------------

let mockSendMessage: jest.Mock;
let mockLastError: { message: string } | undefined;

beforeAll(() => {
    mockSendMessage = jest.fn();
    (global as any).chrome = {
        runtime: {
            get lastError() {
                return mockLastError;
            },
            sendMessage: mockSendMessage,
        },
    };
});

beforeEach(() => {
    mockSendMessage.mockReset();
    mockLastError = undefined;
});

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const validTabs: Tab[] = [
    { id: 'tab-1', title: 'Inbox', type: 'hash', value: '#inbox' },
    { id: 'tab-2', title: 'Work', type: 'label', value: 'Work' },
];

// ---------------------------------------------------------------------------
// buildExportPayload
// ---------------------------------------------------------------------------

describe('buildExportPayload', () => {
    it('should return correct shape with version 1', () => {
        const payload = buildExportPayload('user@gmail.com', validTabs);
        expect(payload.version).toBe(1);
        expect(payload.email).toBe('user@gmail.com');
        expect(payload.tabs).toEqual(validTabs);
        expect(typeof payload.timestamp).toBe('number');
    });

    it('should set timestamp close to now', () => {
        const before = Date.now();
        const payload = buildExportPayload('a@b.com', []);
        const after = Date.now();
        expect(payload.timestamp).toBeGreaterThanOrEqual(before);
        expect(payload.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle empty tabs array', () => {
        const payload = buildExportPayload('a@b.com', []);
        expect(payload.tabs).toEqual([]);
    });

    it('should omit rules and theme when not supplied', () => {
        const payload = buildExportPayload('a@b.com', validTabs);
        expect(payload.rules).toBeUndefined();
        expect(payload.theme).toBeUndefined();
    });

    it('should include rules and theme when supplied', () => {
        const rules = [{ tabId: 'tab-2', action: 'archive' as const, daysOld: 30, enabled: true }];
        const payload = buildExportPayload('a@b.com', validTabs, rules, 'dark');
        expect(payload.rules).toEqual(rules);
        expect(payload.theme).toBe('dark');
    });
});

// ---------------------------------------------------------------------------
// generateExportFilename
// ---------------------------------------------------------------------------

describe('generateExportFilename', () => {
    it('should include sanitized email and date', () => {
        const filename = generateExportFilename('user@gmail.com');
        expect(filename).toMatch(/^GmailTabs_user_gmail\.com_\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should sanitize special characters in email', () => {
        const filename = generateExportFilename('user+tag@sub.domain.com');
        expect(filename).toContain('user_tag_sub.domain.com');
        expect(filename).not.toContain('+');
        expect(filename).not.toContain('@');
    });

    it('should end with .json', () => {
        const filename = generateExportFilename('x@y.com');
        expect(filename).toMatch(/\.json$/);
    });
});

// ---------------------------------------------------------------------------
// validateImportData
// ---------------------------------------------------------------------------

describe('validateImportData', () => {
    it('should accept valid import data and return tabs', () => {
        const data = { version: 1, tabs: validTabs };
        const result = validateImportData(data);
        expect(result).toEqual(validTabs);
    });

    it('should reject data without tabs property', () => {
        expect(() => validateImportData({ version: 1 })).toThrow('Missing "tabs" array');
    });

    it('should reject data where tabs is not an array', () => {
        expect(() => validateImportData({ tabs: 'not-array' })).toThrow('Missing "tabs" array');
    });

    it('should reject tab entry that is not an object', () => {
        expect(() => validateImportData({ tabs: ['string'] })).toThrow('not an object');
    });

    it('should reject tab with missing id', () => {
        const data = { tabs: [{ title: 'X', type: 'label', value: 'Y' }] };
        expect(() => validateImportData(data)).toThrow('missing or empty "id"');
    });

    it('should reject tab with empty id', () => {
        const data = { tabs: [{ id: '  ', title: 'X', type: 'label', value: 'Y' }] };
        expect(() => validateImportData(data)).toThrow('missing or empty "id"');
    });

    it('should reject tab with missing title', () => {
        const data = { tabs: [{ id: 'a', type: 'label', value: 'Y' }] };
        expect(() => validateImportData(data)).toThrow('missing or empty "title"');
    });

    it('should reject tab with invalid type', () => {
        const data = { tabs: [{ id: 'a', title: 'X', type: 'custom', value: 'Y' }] };
        expect(() => validateImportData(data)).toThrow('"type" must be "label" or "hash"');
    });

    it('should reject tab with missing value', () => {
        const data = { tabs: [{ id: 'a', title: 'X', type: 'label' }] };
        expect(() => validateImportData(data)).toThrow('missing or empty "value"');
    });

    it('should reject tab with empty value', () => {
        const data = { tabs: [{ id: 'a', title: 'X', type: 'label', value: '' }] };
        expect(() => validateImportData(data)).toThrow('missing or empty "value"');
    });

    it('should include the tab index in error messages', () => {
        const data = {
            tabs: [
                { id: 'ok', title: 'Ok', type: 'label', value: 'ok' },
                { id: '', title: 'Bad', type: 'label', value: 'bad' },
            ],
        };
        expect(() => validateImportData(data)).toThrow('index 1');
    });

    it('should accept empty tabs array', () => {
        const result = validateImportData({ tabs: [] });
        expect(result).toEqual([]);
    });

    it('should keep a valid tab color', () => {
        const data = { tabs: [{ id: 't1', title: 'A', type: 'label', value: 'A', color: 'blue' }] };
        validateImportData(data);
        expect((data.tabs[0] as any).color).toBe('blue');
    });

    it('should strip an invalid tab color, falling back to default', () => {
        const data = { tabs: [{ id: 't1', title: 'A', type: 'label', value: 'A', color: 'chartreuse' }] };
        expect(() => validateImportData(data)).not.toThrow();
        expect('color' in (data.tabs[0] as any)).toBe(false);
    });

    it('should accept valid rules when present', () => {
        const data = {
            tabs: validTabs,
            rules: [{ tabId: 'tab-2', action: 'trash', daysOld: 30, enabled: true }],
        };
        expect(() => validateImportData(data)).not.toThrow();
    });

    it('should reject non-array rules', () => {
        expect(() => validateImportData({ tabs: validTabs, rules: 'nope' })).toThrow('"rules" must be an array');
    });

    it('should reject a rule with an invalid action', () => {
        const data = {
            tabs: validTabs,
            rules: [{ tabId: 'tab-2', action: 'nuke', daysOld: 30, enabled: true }],
        };
        expect(() => validateImportData(data)).toThrow('invalid "action"');
    });

    it('should reject a rule missing tabId', () => {
        const data = {
            tabs: validTabs,
            rules: [{ action: 'trash', daysOld: 30, enabled: true }],
        };
        expect(() => validateImportData(data)).toThrow('missing or empty "tabId"');
    });
});

// ---------------------------------------------------------------------------
// triggerDownload
// ---------------------------------------------------------------------------

describe('triggerDownload', () => {
    it('should send correct message to background', async () => {
        mockSendMessage.mockImplementation((_msg: any, cb: any) => cb({ success: true, downloadId: 42 }));

        const result = await triggerDownload('test.json', '{"data":1}');
        expect(mockSendMessage).toHaveBeenCalledWith(
            { action: 'DOWNLOAD_FILE', filename: 'test.json', data: '{"data":1}' },
            expect.any(Function)
        );
        expect(result.success).toBe(true);
        expect(result.downloadId).toBe(42);
    });

    it('should handle chrome.runtime.lastError', async () => {
        mockSendMessage.mockImplementation((_msg: any, cb: any) => {
            mockLastError = { message: 'Extension context invalidated' };
            cb(undefined);
        });

        const result = await triggerDownload('test.json', '{}');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Extension context invalidated');
    });

    it('should handle background failure response', async () => {
        mockSendMessage.mockImplementation((_msg: any, cb: any) => cb({ success: false, error: 'Disk full' }));

        const result = await triggerDownload('test.json', '{}');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Disk full');
    });
});

// ---------------------------------------------------------------------------
// Imported ids are made safe for markup
// ---------------------------------------------------------------------------

describe('validateImportData id sanitization', () => {
    beforeAll(() => {
        if (!globalThis.crypto?.randomUUID) {
            Object.defineProperty(globalThis, 'crypto', {
                value: { randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}` },
                writable: true,
            });
        }
    });

    test('leaves ordinary ids alone', () => {
        const data = {
            tabs: [{ id: 'default-inbox', title: 'Inbox', type: 'hash', value: '#inbox' }],
        };
        expect(validateImportData(data as any)[0].id).toBe('default-inbox');
    });

    test('replaces an id that would inject markup', () => {
        // A tab id goes straight into data-tab-id="..." in the options page,
        // which is an extension page with chrome.* access.
        const data = {
            tabs: [{ id: 'x" onmouseover="alert(1)', title: 'Evil', type: 'label', value: 'evil' }],
        };
        const tabs = validateImportData(data as any);
        expect(tabs[0].id).not.toContain('"');
        expect(tabs[0].id).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('repoints rules at the replaced id so automation survives', () => {
        const data = {
            tabs: [{ id: 'bad id with spaces', title: 'T', type: 'label', value: 'v' }],
            rules: [{ tabId: 'bad id with spaces', action: 'trash', daysOld: 30, enabled: true }],
        };
        const tabs = validateImportData(data as any);
        expect((data.rules as any)[0].tabId).toBe(tabs[0].id);
        expect(tabs[0].id).not.toBe('bad id with spaces');
    });

    test('rejects a non-string targetLabel', () => {
        const data = {
            tabs: [{ id: 'a', title: 'T', type: 'label', value: 'v' }],
            rules: [{ tabId: 'a', action: 'moveToLabel', daysOld: 30, enabled: true, targetLabel: { evil: true } }],
        };
        expect(() => validateImportData(data as any)).toThrow(/targetLabel/);
    });
});
