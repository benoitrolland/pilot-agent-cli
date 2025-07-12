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

        it('should validate required fields', () => {
            expect(() => new ProjectConfig({
                prompt: '',
                targetFiles: []
            })).toThrow('Prompt is required');

            expect(() => new ProjectConfig({
                prompt: 'Valid prompt',
                targetFiles: 'not-an-array'
            })).toThrow('targetFiles must be an array');
        });
    });

    describe('validation', () => {
        it('should throw error for empty prompt', () => {
            expect(() => new ProjectConfig({
                prompt: '   ',
                targetFiles: ['file.js']
            })).toThrow('Prompt is required');
        });

        it('should throw error for empty targetFiles', () => {
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
