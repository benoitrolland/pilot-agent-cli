const GitRepository = require('../../domain/ports/GitRepository');

class SimpleGitAdapter extends GitRepository {
    constructor(workingDir) {
        super();
        this.workingDir = workingDir;
        this.git = null;
        this.initGit();
    }

    initGit() {
        try {
            const simpleGit = require('simple-git');
            this.git = simpleGit(this.workingDir);
        } catch (error) {
            // Fallback to basic implementation if simple-git is not available
            console.warn('simple-git not available, using fallback Git implementation');
            this.git = new FallbackGit(this.workingDir);
        }
    }

    async getCurrentBranch() {
        if (this.git.branch) {
            const result = await this.git.branch();
            return result.current;
        }
        return await this.git.getCurrentBranch();
    }

    async createBranch(branchName) {
        if (this.git.checkoutLocalBranch) {
            await this.git.checkoutLocalBranch(branchName);
        } else {
            await this.git.createBranch(branchName);
        }
    }

    async checkoutBranch(branchName) {
        if (this.git.checkout) {
            await this.git.checkout(branchName);
        } else {
            await this.git.checkoutBranch(branchName);
        }
    }

    async addFiles(files) {
        if (this.git.add) {
            await this.git.add(files);
        } else {
            await this.git.addFiles(files);
        }
    }

    async addFile(file) {
        await this.addFiles([file]);
    }

    async commit(message) {
        if (this.git.commit) {
            await this.git.commit(message);
        } else {
            await this.git.commitChanges(message);
        }
    }

    async getStatus() {
        if (this.git.status) {
            return await this.git.status();
        }
        return await this.git.getStatus();
    }

    async hasChanges() {
        const status = await this.getStatus();
        if (status.files) {
            return status.files.length > 0;
        }
        return status.hasChanges || false;
    }
}

// Fallback Git implementation when simple-git is not available
class FallbackGit {
    constructor(workingDir) {
        this.workingDir = workingDir;
        this.exec = require('child_process').promisify || require('util').promisify(require('child_process').exec);
    }

    async getCurrentBranch() {
        try {
            const { stdout } = await this.exec('git branch --show-current', { cwd: this.workingDir });
            return stdout.trim();
        } catch (error) {
            return 'main'; // fallback
        }
    }

    async createBranch(branchName) {
        await this.exec(`git checkout -b ${branchName}`, { cwd: this.workingDir });
    }

    async checkoutBranch(branchName) {
        await this.exec(`git checkout ${branchName}`, { cwd: this.workingDir });
    }

    async addFiles(files) {
        const fileList = Array.isArray(files) ? files.join(' ') : files;
        await this.exec(`git add ${fileList}`, { cwd: this.workingDir });
    }

    async commitChanges(message) {
        await this.exec(`git commit -m "${message}"`, { cwd: this.workingDir });
    }

    async getStatus() {
        try {
            const { stdout } = await this.exec('git status --porcelain', { cwd: this.workingDir });
            const files = stdout.trim().split('\n').filter(line => line.trim());
            return { files, hasChanges: files.length > 0 };
        } catch (error) {
            return { files: [], hasChanges: false };
        }
    }
}

module.exports = SimpleGitAdapter;
