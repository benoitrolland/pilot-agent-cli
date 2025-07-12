const SimpleGitAdapter = require('../../../src/infrastructure/adapters/SimpleGitAdapter');
const { exec } = require('child_process');
const { promisify } = require('util');

// Mock child_process
jest.mock('child_process', () => ({
    exec: jest.fn()
}));

// Mock simple-git
jest.mock('simple-git', () => {
    return jest.fn(() => ({
        branch: jest.fn(),
        checkoutLocalBranch: jest.fn(),
        checkout: jest.fn(),
        add: jest.fn(),
        commit: jest.fn(),
        status: jest.fn()
    }));
});

describe('SimpleGitAdapter', () => {
    let adapter;
    let mockExec;

    beforeEach(() => {
        mockExec = promisify(exec);
        adapter = new SimpleGitAdapter('/test/workdir');
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should initialize with simple-git when available', () => {
            expect(adapter.workingDir).toBe('/test/workdir');
            expect(adapter.git).toBeDefined();
        });

        it('should fallback to FallbackGit when simple-git unavailable', () => {
            // This would be tested by mocking require to throw
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Create adapter that will use fallback
            const fallbackAdapter = new SimpleGitAdapter('/test');

            consoleWarnSpy.mockRestore();
        });
    });

    describe('getCurrentBranch', () => {
        it('should return current branch from simple-git', async () => {
            adapter.git.branch.mockResolvedValue({ current: 'main' });

            const result = await adapter.getCurrentBranch();

            expect(result).toBe('main');
            expect(adapter.git.branch).toHaveBeenCalled();
        });

        it('should fallback to FallbackGit method', async () => {
            // Remove simple-git method to test fallback
            delete adapter.git.branch;
            adapter.git.getCurrentBranch = jest.fn().mockResolvedValue('develop');

            const result = await adapter.getCurrentBranch();

            expect(result).toBe('develop');
        });
    });

    describe('createBranch', () => {
        it('should create branch using simple-git', async () => {
            adapter.git.checkoutLocalBranch.mockResolvedValue();

            await adapter.createBranch('feature-branch');

            expect(adapter.git.checkoutLocalBranch).toHaveBeenCalledWith('feature-branch');
        });

        it('should fallback to createBranch method', async () => {
            delete adapter.git.checkoutLocalBranch;
            adapter.git.createBranch = jest.fn().mockResolvedValue();

            await adapter.createBranch('feature-branch');

            expect(adapter.git.createBranch).toHaveBeenCalledWith('feature-branch');
        });
    });

    describe('addFile', () => {
        it('should add single file', async () => {
            adapter.git.add.mockResolvedValue();

            await adapter.addFile('test.js');

            expect(adapter.git.add).toHaveBeenCalledWith(['test.js']);
        });
    });

    describe('commit', () => {
        it('should commit with message', async () => {
            adapter.git.commit.mockResolvedValue();

            await adapter.commit('Test commit');

            expect(adapter.git.commit).toHaveBeenCalledWith('Test commit');
        });

        it('should fallback to commitChanges method', async () => {
            delete adapter.git.commit;
            adapter.git.commitChanges = jest.fn().mockResolvedValue();

            await adapter.commit('Test commit');

            expect(adapter.git.commitChanges).toHaveBeenCalledWith('Test commit');
        });
    });

    describe('hasChanges', () => {
        it('should return true when files have changes', async () => {
            adapter.git.status.mockResolvedValue({
                files: ['modified.js', 'new.js']
            });

            const result = await adapter.hasChanges();

            expect(result).toBe(true);
        });

        it('should return false when no changes', async () => {
            adapter.git.status.mockResolvedValue({
                files: []
            });

            const result = await adapter.hasChanges();

            expect(result).toBe(false);
        });

        it('should handle fallback status format', async () => {
            delete adapter.git.status;
            adapter.git.getStatus = jest.fn().mockResolvedValue({
                hasChanges: true
            });

            const result = await adapter.hasChanges();

            expect(result).toBe(true);
        });
    });
});
