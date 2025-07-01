class ProjectConfig {
    constructor({
        rootDir = process.cwd(),
        targetFiles = [],
        readFiles = [],
        prompt = '',
        autoCommit = true,
        autoAccept = true,
        commitMessage = '',
        squashOnSuccess = true
    } = {}) {
        this.rootDir = this.validatePath(rootDir);
        this.targetFiles = this.validateFiles(targetFiles);
        this.readFiles = this.validateFiles(readFiles);
        this.prompt = this.validatePrompt(prompt);
        this.autoCommit = autoCommit;
        this.autoAccept = autoAccept;
        this.commitMessage = commitMessage;
        this.squashOnSuccess = squashOnSuccess;
    }

    validatePath(path) {
        if (!path || typeof path !== 'string') {
            throw new Error('Root directory path must be a valid string');
        }
        return path;
    }

    validateFiles(files) {
        if (!Array.isArray(files)) {
            throw new Error('Files must be an array');
        }
        return files.filter(file => file && typeof file === 'string');
    }

    validatePrompt(prompt) {
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('Prompt must be a non-empty string');
        }
        return prompt.trim();
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
