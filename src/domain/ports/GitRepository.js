class GitRepository {
    async getCurrentBranch() {
        throw new Error('Method must be implemented');
    }

    async getCommitsSince(ref) {
        throw new Error('Method must be implemented');
    }

    async commit(message, files = []) {
        throw new Error('Method must be implemented');
    }

    async squashCommits(fromRef, toRef, message) {
        throw new Error('Method must be implemented');
    }

    async fixupCommits(commits) {
        throw new Error('Method must be implemented');
    }

    async getLastSuccessCommit() {
        throw new Error('Method must be implemented');
    }

    async isWorkingTreeClean() {
        throw new Error('Method must be implemented');
    }

    async stageFiles(files) {
        throw new Error('Method must be implemented');
    }
}

module.exports = GitRepository;
