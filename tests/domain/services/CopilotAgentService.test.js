const CopilotAgentService = require('../../../src/domain/services/CopilotAgentService');
const ProjectConfig = require('../../../src/domain/entities/ProjectConfig');

describe('CopilotAgentService', () => {
    let mockCopilotClient;
    let mockGitRepository;
    let mockFileSystem;
    let mockLogger;
    let service;

    beforeEach(() => {
        mockCopilotClient = {
            getSuggestions: jest.fn()
        };

        mockGitRepository = {
            getCurrentBranch: jest.fn(),
            createBranch: jest.fn(),
            checkoutBranch: jest.fn(),
            addFile: jest.fn(),
            commit: jest.fn()
        };

        mockFileSystem = {
            exists: jest.fn(),
            readFile: jest.fn(),
            writeFile: jest.fn(),
            resolve: jest.fn()
        };

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        service = new CopilotAgentService(
            mockCopilotClient,
            mockGitRepository,
            mockFileSystem,
            mockLogger
        );
    });

    describe('executeProject', () => {
        it('should execute project successfully without auto-commit', async () => {
            const config = new ProjectConfig({
                rootDir: './test',
                targetFiles: ['test.js'],
                prompt: 'Test prompt',
                autoCommit: false
            });

            mockFileSystem.exists.mockResolvedValue(false);
            mockFileSystem.resolve.mockReturnValue('/full/path/test.js');
            mockCopilotClient.getSuggestions.mockResolvedValue([{
                content: 'console.log("test");',
                description: 'Test suggestion'
            }]);

            const result = await service.executeProject(config);

            expect(result.success).toBe(true);
            expect(result.changes).toHaveLength(1);
            expect(result.branchCreated).toBe(false);
            expect(mockGitRepository.createBranch).not.toHaveBeenCalled();
        });

        it('should create branch when auto-commit is enabled', async () => {
            const config = new ProjectConfig({
                rootDir: './test',
                targetFiles: ['test.js'],
                prompt: 'Test prompt',
                autoCommit: true
            });

            mockGitRepository.getCurrentBranch.mockResolvedValue('main');
            mockFileSystem.exists.mockResolvedValue(false);
            mockFileSystem.resolve.mockReturnValue('/full/path/test.js');
            mockCopilotClient.getSuggestions.mockResolvedValue([{
                content: 'console.log("test");',
                description: 'Test suggestion'
            }]);

            const result = await service.executeProject(config);

            expect(result.branchCreated).toBe(true);
            expect(mockGitRepository.createBranch).toHaveBeenCalled();
            expect(mockGitRepository.checkoutBranch).toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            const config = new ProjectConfig({
                rootDir: './test',
                targetFiles: ['test.js'],
                prompt: 'Test prompt'
            });

            mockCopilotClient.getSuggestions.mockRejectedValue(new Error('Copilot error'));

            await expect(service.executeProject(config))
                .rejects.toThrow('Copilot error');

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('readContextFiles', () => {
        it('should read existing context files', async () => {
            const config = new ProjectConfig({
                readFiles: ['README.md', 'nonexistent.txt']
            });

            mockFileSystem.resolve
                .mockReturnValueOnce('/path/README.md')
                .mockReturnValueOnce('/path/nonexistent.txt');

            mockFileSystem.exists
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            mockFileSystem.readFile.mockResolvedValue('# README content');

            const result = await service.readContextFiles(config);

            expect(result).toEqual({
                'README.md': '# README content'
            });
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Could not read context file nonexistent.txt')
            );
        });
    });

    describe('buildCopilotContext', () => {
        it('should build proper context object', () => {
            const targetFile = 'test.js';
            const originalContent = 'const x = 1;';
            const contextContent = { 'README.md': '# Test' };
            const config = new ProjectConfig({
                prompt: 'Add documentation'
            });

            const result = service.buildCopilotContext(
                targetFile,
                originalContent,
                contextContent,
                config
            );

            expect(result).toEqual({
                filePath: 'test.js',
                content: 'const x = 1;',
                prompt: 'Add documentation',
                contextFiles: { 'README.md': '# Test' }
            });
        });
    });
});
