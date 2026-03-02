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
