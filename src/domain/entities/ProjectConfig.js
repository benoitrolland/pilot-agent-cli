class ProjectConfig {
    constructor(config = {}) {
        this.rootDir = config.rootDir || './';
        this.targetFiles = config.targetFiles || [];
        this.readFiles = config.readFiles || [];
        this.prompt = config.prompt || '';
        this.autoCommit = config.autoCommit !== undefined ? config.autoCommit : false;
        this.autoAccept = config.autoAccept !== undefined ? config.autoAccept : false;
        this.commitMessage = config.commitMessage || '';
        this.squashOnSuccess = config.squashOnSuccess !== undefined ? config.squashOnSuccess : false;
        
        this.validate();
    }

    validate() {
        if (!this.prompt || this.prompt.trim().length === 0) {
            throw new Error('Prompt is required');
        }
        
        if (!Array.isArray(this.targetFiles) || this.targetFiles.length === 0) {
            throw new Error('At least one target file is required');
        }
        
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
