const ProjectConfig = require('../../../src/domain/entities/ProjectConfig');

describe('ProjectConfig', () => {
    describe('constructor', () => {
        it('should create config with default values', () => {
            const config = new ProjectConfig();
            
            expect(config.rootDir).toBe('./');
            expect(config.targetFiles).toEqual([]);
            expect(config.readFiles).toEqual([]);
            expect(config.prompt).toBe('');
            expect(config.autoCommit).toBe(false);
            expect(config.autoAccept).toBe(false);
            expect(config.squashOnSuccess).toBe(false);
        });

        it('should create config with custom values', () => {
            const options = {
                rootDir: './custom',
                targetFiles: ['file1.js', 'file2.js'],
                readFiles: ['readme.md'],
                prompt: 'Test prompt',
                autoCommit: true
            };

            const config = new ProjectConfig(options);
            
            expect(config.rootDir).toBe('./custom');
            expect(config.targetFiles).toEqual(['file1.js', 'file2.js']);
            expect(config.readFiles).toEqual(['readme.md']);
            expect(config.prompt).toBe('Test prompt');
            expect(config.autoCommit).toBe(true);
        });

        it('should validate prompt when non-string', () => {
            expect(() => new ProjectConfig({
                prompt: 123,
                targetFiles: ['file.js']
            })).toThrow('Prompt must be a non-empty string');
        });

        it('should validate rootDir is a string', () => {
            expect(() => new ProjectConfig({
                rootDir: null,
                prompt: 'valid prompt',
                targetFiles: ['file.js']
            })).toThrow('Root directory path must be a valid string');
        });

        it('should filter out invalid files', () => {
            const config = new ProjectConfig({ 
                targetFiles: ['valid.js', null, '', 'another.js'],
                prompt: 'test'
            });
            
            expect(config.targetFiles).toEqual(['valid.js', 'another.js']);
        });

        it('should validate required fields for complete configs', () => {
            expect(() => new ProjectConfig({
                prompt: '',
                targetFiles: ['file.js']
            })).toThrow('Prompt is required');

            expect(() => new ProjectConfig({
                prompt: 'Valid prompt',
                targetFiles: 'not-an-array'
            })).toThrow('targetFiles must be an array');
        });
    });

    describe('validation', () => {
        it('should throw error for empty prompt with target files', () => {
            expect(() => new ProjectConfig({
                prompt: '   ',
                targetFiles: ['file.js']
            })).toThrow('Prompt is required');
        });

        it('should throw error for no target files with prompt', () => {
            expect(() => new ProjectConfig({
                prompt: 'Valid prompt',
                targetFiles: []
            })).toThrow('At least one target file is required');
        });

        it('should throw error for invalid readFiles', () => {
            expect(() => new ProjectConfig({
                prompt: 'Valid prompt',
                targetFiles: ['file.js'],
                readFiles: 'not-an-array'
            })).toThrow('readFiles must be an array');
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON correctly', () => {
            const config = new ProjectConfig({
                rootDir: './test',
                targetFiles: ['file.js'],
                prompt: 'Test prompt'
            });

            const json = config.toJSON();
            expect(json.rootDir).toBe('./test');
            expect(json.targetFiles).toEqual(['file.js']);
            expect(json.prompt).toBe('Test prompt');
        });

        it('should deserialize from JSON correctly', () => {
            const data = {
                rootDir: './test',
                targetFiles: ['file.js'],
                prompt: 'Test prompt',
                autoCommit: false
            };

            const config = ProjectConfig.fromJSON(data);
            expect(config.rootDir).toBe('./test');
            expect(config.autoCommit).toBe(false);
        });
    });
});

module.exports = ProjectConfig;
