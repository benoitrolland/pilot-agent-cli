const simpleGit = require('simple-git');
const GitRepository = require('../../domain/ports/GitRepository');

class SimpleGitAdapter extends GitRepository {
    constructor(workingDir) {
        super();
        this.git = simpleGit(workingDir);
    }

    async getCurrentBranch() {
        const status = await this.git.status();
        return status.current;
    }

    async getCommitsSince(ref) {
        const log = await this.git.log({ from: ref, to: 'HEAD' });
        return log.all;
    }

    async commit(message, files = []) {
        if (files.length > 0) {
            await this.git.add(files);
        }
        return await this.git.commit(message);
    }

    async squashCommits(fromRef, toRef, message) {
        // Reset to fromRef keeping working directory
        await this.git.reset(['--soft', fromRef]);
        // Commit all changes with new message
        return await this.git.commit(message);
    }

    async fixupCommits(commits) {
        // Implementation for fixup commits
        for (const commit of commits) {
            await this.git.rebase(['--interactive', '--autosquash', commit.hash]);
        }
    }

    async getLastSuccessCommit() {
        try {
            const log = await this.git.log();
            const successCommit = log.all.find(commit => 
                commit.message.toLowerCase().includes('success') ||
                commit.message.toLowerCase().includes('goal') ||
                commit.message.toLowerCase().includes('completed')
            );
            return successCommit ? successCommit.hash : null;
        } catch (error) {
            return null;
        }
    }

    async isWorkingTreeClean() {
        const status = await this.git.status();
        return status.isClean();
    }

    async stageFiles(files) {
        return await this.git.add(files);
    }
}

module.exports = SimpleGitAdapter;
