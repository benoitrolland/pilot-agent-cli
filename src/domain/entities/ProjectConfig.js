class ProjectConfig {
    constructor(config = {}) {
        // Validation précoce avant sanitization
        this.validateInputTypes(config);

        this.rootDir = config.rootDir || './';
        this.targetFiles = this.sanitizeFiles(config.targetFiles || []);
        this.readFiles = this.sanitizeFiles(config.readFiles || []);
        this.prompt = config.prompt || '';
        this.autoCommit = config.autoCommit !== undefined ? config.autoCommit : false;
        this.autoAccept = config.autoAccept !== undefined ? config.autoAccept : false;
        this.commitMessage = config.commitMessage || '';
        this.squashOnSuccess = config.squashOnSuccess !== undefined ? config.squashOnSuccess : false;
        
        this.validate();
    }

    validateInputTypes(config) {
        // Validate rootDir type before assignment
        if (config.rootDir !== undefined &&
            (config.rootDir === null || typeof config.rootDir !== 'string')) {
            throw new Error('Root directory path must be a valid string');
        }

        // Validate targetFiles type before sanitization
        if (config.targetFiles !== undefined && !Array.isArray(config.targetFiles)) {
            throw new Error('targetFiles must be an array');
        }

        // Validate readFiles type before sanitization
        if (config.readFiles !== undefined && !Array.isArray(config.readFiles)) {
            throw new Error('readFiles must be an array');
        }

        // Validate prompt type
        if (config.prompt !== undefined && config.prompt !== null &&
            typeof config.prompt !== 'string') {
            throw new Error('Prompt must be a non-empty string');
        }
    }

    sanitizeFiles(files) {
        if (!Array.isArray(files)) {
            return [];
        }
        return files.filter(file => file && typeof file === 'string' && file.trim().length > 0);
    }

    validate() {
        // Validate prompt content only when target files are present
        if (this.prompt !== undefined && this.prompt !== null) {
            if (this.prompt.trim().length === 0 && this.targetFiles.length > 0) {
                throw new Error('Prompt is required');
            }
        }

        // Validate targetFiles content only when prompt is provided
        if (this.prompt && this.prompt.trim().length > 0 && this.targetFiles.length === 0) {
            throw new Error('At least one target file is required');
        }
    }

    toJSON() {
        return {
            rootDir: this.rootDir,
            targetFiles: this.targetFiles,
            readFiles: this.readFiles,
            prompt: this.prompt,
            autoCommit: this.autoCommit,
            autoAccept: this.autoAccept,
            commitMessage: this.commitMessage,
            squashOnSuccess: this.squashOnSuccess
        };
    }

    static fromJSON(data) {
        return new ProjectConfig(data);
    }
}

module.exports = ProjectConfig;
