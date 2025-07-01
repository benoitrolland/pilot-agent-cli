const ProjectConfig = require('../../domain/entities/ProjectConfig');

class ConfigLoader {
    constructor(fileSystem) {
        this.fileSystem = fileSystem;
    }

    async loadConfig(configPath = './pilot-agent.config.json') {
        try {
            if (await this.fileSystem.exists(configPath)) {
                const content = await this.fileSystem.readFile(configPath);
                const data = JSON.parse(content);
                return ProjectConfig.fromJSON(data);
            } else {
                // Return default config if file doesn't exist
                return new ProjectConfig();
            }
        } catch (error) {
            throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
        }
    }

    async saveConfig(config, configPath = './pilot-agent.config.json') {
        try {
            const content = JSON.stringify(config.toJSON(), null, 2);
            await this.fileSystem.writeFile(configPath, content);
        } catch (error) {
            throw new Error(`Failed to save config to ${configPath}: ${error.message}`);
        }
    }

    generateDefaultConfig() {
        return new ProjectConfig({
            rootDir: process.cwd(),
            targetFiles: ['README.md'],
            readFiles: [],
            prompt: 'Update documentation',
            autoCommit: true,
            autoAccept: true,
            commitMessage: '',
            squashOnSuccess: true
        });
    }
}

module.exports = ConfigLoader;
