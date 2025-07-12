class ProjectConfig {
    constructor(config = {}) {
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

    sanitizeFiles(files) {
        if (!Array.isArray(files)) {
            return [];
        }
        return files.filter(file => file && typeof file === 'string' && file.trim().length > 0);
    }

    validate() {
        // Validate rootDir
        if (this.rootDir === null || this.rootDir === undefined || typeof this.rootDir !== 'string') {
            throw new Error('Root directory path must be a valid string');
        }

        // Validate prompt only when required (not empty constructor)
        if (this.prompt !== undefined && this.prompt !== null) {
            if (typeof this.prompt !== 'string') {
                throw new Error('Prompt must be a non-empty string');
            }
            if (this.prompt.trim().length === 0 && this.targetFiles.length > 0) {
                throw new Error('Prompt is required');
            }
        }

        // Validate targetFiles type
        if (!Array.isArray(this.targetFiles)) {
            throw new Error('targetFiles must be an array');
        }

        // Validate targetFiles content only when prompt is provided
        if (this.prompt && this.prompt.trim().length > 0 && this.targetFiles.length === 0) {
            throw new Error('At least one target file is required');
        }

        // Validate readFiles
        if (!Array.isArray(this.readFiles)) {
            throw new Error('readFiles must be an array');
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
