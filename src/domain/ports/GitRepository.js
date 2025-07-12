class GitRepository {
    async getCurrentBranch() {
        throw new Error('Method not implemented');
    }

    async createBranch(branchName) {
        throw new Error('Method not implemented');
    }

    async checkoutBranch(branchName) {
        throw new Error('Method not implemented');
    }

    async addFiles(files) {
        throw new Error('Method not implemented');
    }

    async commit(message) {
        throw new Error('Method not implemented');
    }

    async getStatus() {
        throw new Error('Method not implemented');
    }

    async hasChanges() {
        throw new Error('Method not implemented');
    }
}

module.exports = GitRepository;
