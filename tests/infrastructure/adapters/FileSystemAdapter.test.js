const FileSystemAdapter = require('../../../src/infrastructure/adapters/FileSystemAdapter');
const fs = require('fs').promises;
const path = require('path');

// Mock fs module
jest.mock('fs', () => ({
    promises: {
        access: jest.fn(),
        readFile: jest.fn(),
        writeFile: jest.fn(),
        mkdir: jest.fn()
    }
}));

describe('FileSystemAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new FileSystemAdapter();
        jest.clearAllMocks();
    });

    describe('exists', () => {
        it('should return true when file exists', async () => {
            fs.access.mockResolvedValue();

            const result = await adapter.exists('test.txt');

            expect(result).toBe(true);
            expect(fs.access).toHaveBeenCalledWith('test.txt');
        });

        it('should return false when file does not exist', async () => {
            fs.access.mockRejectedValue(new Error('ENOENT'));

            const result = await adapter.exists('nonexistent.txt');

            expect(result).toBe(false);
        });
    });

    describe('readFile', () => {
        it('should read file content', async () => {
            const expectedContent = 'file content';
            fs.readFile.mockResolvedValue(expectedContent);

            const result = await adapter.readFile('test.txt');

            expect(result).toBe(expectedContent);
            expect(fs.readFile).toHaveBeenCalledWith('test.txt', 'utf8');
        });

        it('should propagate read errors', async () => {
            fs.readFile.mockRejectedValue(new Error('Permission denied'));

            await expect(adapter.readFile('test.txt'))
                .rejects.toThrow('Permission denied');
        });
    });

    describe('writeFile', () => {
        it('should write file content after creating directory', async () => {
            const filePath = '/path/to/file.txt';
            const content = 'test content';

            fs.mkdir.mockResolvedValue();
            fs.writeFile.mockResolvedValue();

            await adapter.writeFile(filePath, content);

            expect(fs.mkdir).toHaveBeenCalledWith(
                path.dirname(filePath),
                { recursive: true }
            );
            expect(fs.writeFile).toHaveBeenCalledWith(filePath, content, 'utf8');
        });

        it('should handle directory creation errors gracefully', async () => {
            fs.mkdir.mockRejectedValue({ code: 'EEXIST' });
            fs.writeFile.mockResolvedValue();

            await expect(adapter.writeFile('test.txt', 'content'))
                .resolves.not.toThrow();
        });

        it('should propagate non-EEXIST directory errors', async () => {
            fs.mkdir.mockRejectedValue(new Error('Permission denied'));

            await expect(adapter.writeFile('test.txt', 'content'))
                .rejects.toThrow('Permission denied');
        });
    });

    describe('resolve', () => {
        it('should resolve path correctly', () => {
            const result = adapter.resolve('path', 'to', 'file.txt');

            expect(result).toBe(path.resolve('path', 'to', 'file.txt'));
        });
    });

    describe('createDirectory', () => {
        it('should create directory recursively', async () => {
            fs.mkdir.mockResolvedValue();

            await adapter.createDirectory('/path/to/dir');

            expect(fs.mkdir).toHaveBeenCalledWith('/path/to/dir', { recursive: true });
        });

        it('should ignore EEXIST errors', async () => {
            fs.mkdir.mockRejectedValue({ code: 'EEXIST' });

            await expect(adapter.createDirectory('/path/to/dir'))
                .resolves.not.toThrow();
        });
    });
});
