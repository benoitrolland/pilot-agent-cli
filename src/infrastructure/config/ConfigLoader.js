const ProjectConfig = require('../../domain/entities/ProjectConfig');

class ConfigLoader {
    constructor(fileSystem) {
        this.fileSystem = fileSystem;
    }

    async loadConfig(configPath) {
        try {
            if (!await this.fileSystem.exists(configPath)) {
                throw new Error(`Config file not found: ${configPath}`);
            }

            const configContent = await this.fileSystem.readFile(configPath);
            const configData = JSON.parse(configContent);
            
            return new ProjectConfig(configData);
        } catch (error) {
            throw new Error(`Failed to load config: ${error.message}`);
        }
    }

    async saveConfig(config, configPath) {
        const configJson = JSON.stringify(config.toJSON(), null, 2);
        await this.fileSystem.writeFile(configPath, configJson);
    }

    generateDefaultConfig() {
        return new ProjectConfig({
            rootDir: "./",
            targetFiles: [],
            readFiles: [],
            prompt: "Improve code quality and add documentation",
            autoCommit: false,
            autoAccept: false,
            commitMessage: "",
            squashOnSuccess: false
        });
    }
}

module.exports = ConfigLoader;
