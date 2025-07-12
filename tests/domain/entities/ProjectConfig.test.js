const ProjectConfig = require('../../../src/domain/entities/ProjectConfig');

describe('ProjectConfig', () => {
    describe('constructor', () => {
        it('should create config with default values', () => {
            const config = new ProjectConfig();
            
            expect(config.rootDir).toBe(process.cwd());
            expect(config.targetFiles).toEqual([]);
            expect(config.readFiles).toEqual([]);
            expect(config.autoCommit).toBe(true);
            expect(config.autoAccept).toBe(true);
            expect(config.squashOnSuccess).toBe(true);
        });

        it('should create config with custom values', () => {
            const options = {
                rootDir: './custom',
                targetFiles: ['file1.js', 'file2.js'],
                readFiles: ['readme.md'],
                prompt: 'Test prompt',
                autoCommit: false
            };

            const config = new ProjectConfig(options);
            
            expect(config.rootDir).toBe('./custom');
            expect(config.targetFiles).toEqual(['file1.js', 'file2.js']);
            expect(config.readFiles).toEqual(['readme.md']);
            expect(config.prompt).toBe('Test prompt');
            expect(config.autoCommit).toBe(false);
        });

        it('should validate prompt is not empty', () => {
            expect(() => new ProjectConfig({ prompt: '' }))
                .toThrow('Prompt must be a non-empty string');
        });

        it('should validate rootDir is a string', () => {
            expect(() => new ProjectConfig({ rootDir: null }))
                .toThrow('Root directory path must be a valid string');
        });

        it('should filter out invalid files', () => {
            const config = new ProjectConfig({ 
                targetFiles: ['valid.js', null, '', 'another.js'] 
            });
            
            expect(config.targetFiles).toEqual(['valid.js', 'another.js']);
        });
    });

    describe('toJSON', () => {
        it('should serialize config to JSON', () => {
            const config = new ProjectConfig({
                rootDir: './test',
                prompt: 'Test prompt'
            });

            const json = config.toJSON();
            
            expect(json).toHaveProperty('rootDir', './test');
            expect(json).toHaveProperty('prompt', 'Test prompt');
            expect(json).toHaveProperty('autoCommit', true);
        });
    });

    describe('fromJSON', () => {
        it('should create config from JSON data', () => {
            const data = {
                rootDir: './from-json',
                prompt: 'JSON prompt',
                autoCommit: false
            };

            const config = ProjectConfig.fromJSON(data);
            
            expect(config.rootDir).toBe('./from-json');
            expect(config.prompt).toBe('JSON prompt');
            expect(config.autoCommit).toBe(false);
        });
    });
});
