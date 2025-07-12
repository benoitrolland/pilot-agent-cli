// Jest setup file for hexagonal architecture testing
// Configures global test environment and mocks

// Global test utilities
global.createMockLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
});

global.createMockFileSystem = () => ({
    exists: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    createDirectory: jest.fn(),
    resolve: jest.fn()
});

global.createMockGitRepository = () => ({
    getCurrentBranch: jest.fn(),
    createBranch: jest.fn(),
    checkoutBranch: jest.fn(),
    addFile: jest.fn(),
    addFiles: jest.fn(),
    commit: jest.fn(),
    getStatus: jest.fn(),
    hasChanges: jest.fn()
});

global.createMockCopilotClient = () => ({
    start: jest.fn(),
    stop: jest.fn(),
    getSuggestions: jest.fn(),
    getCompletions: jest.fn(),
    checkDependencies: jest.fn()
});

// Configure console to reduce noise during testing
const originalConsole = global.console;
global.console = {
    ...originalConsole,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
};

// Reset all mocks before each test
beforeEach(() => {
    jest.clearAllMocks();
});

// Restore console after all tests
afterAll(() => {
    global.console = originalConsole;
});
