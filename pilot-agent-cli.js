#!/usr/bin/env node

const CopilotClient = require('./copilot-client');
const CopilotAgentService = require('./src/domain/services/CopilotAgentService');
const SimpleGitAdapter = require('./src/infrastructure/adapters/SimpleGitAdapter');
const FileSystemAdapter = require('./src/infrastructure/adapters/FileSystemAdapter');
const ConfigLoader = require('./src/infrastructure/config/ConfigLoader');
const ProjectConfig = require('./src/domain/entities/ProjectConfig');

class Logger {
    constructor(verbose = false) {
        this.verbose = verbose;
    }

    info(message) {
        console.log(message);
    }

    warn(message) {
        console.warn(`⚠️ ${message}`);
    }

    error(message) {
        console.error(`❌ ${message}`);
    }

    debug(message) {
        if (this.verbose) {
            console.log(`🔍 ${message}`);
        }
    }
}

class PilotAgentCLI {
    constructor() {
        this.fileSystem = new FileSystemAdapter();
        this.configLoader = new ConfigLoader(this.fileSystem);
    }

    async run(args) {
        const command = args[0] || 'help';
        const verbose = args.includes('--verbose');
        const logger = new Logger(verbose);

        try {
            switch (command) {
                case 'init':
                    await this.initConfig(args, logger);
                    break;
                case 'run':
                    await this.runAgent(args, logger);
                    break;
                case 'config':
                    await this.showConfig(args, logger);
                    break;
                case 'help':
                default:
                    this.showHelp();
                    break;
            }
        } catch (error) {
            logger.error(`Command failed: ${error.message}`);
            if (verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    async initConfig(args, logger) {
        const configPath = this.getConfigPath(args);
        
        if (await this.fileSystem.exists(configPath)) {
            logger.warn(`Config file already exists: ${configPath}`);
            return;
        }

        const defaultConfig = this.configLoader.generateDefaultConfig();
        await this.configLoader.saveConfig(defaultConfig, configPath);
        
        logger.info(`✅ Created default config file: ${configPath}`);
        logger.info('📝 Edit the config file to customize your settings');
    }

    async runAgent(args, logger) {
        const configPath = this.getConfigPath(args);
        const config = await this.configLoader.loadConfig(configPath);
        
        logger.info('🤖 Starting Pilot Agent');
        logger.debug(`Using config: ${configPath}`);
        
        // Initialize dependencies
        const copilotClient = new CopilotClient(logger.verbose);
        const gitRepository = new SimpleGitAdapter(config.rootDir);
        
        // Create and run service
        const agentService = new CopilotAgentService(
            copilotClient,
            gitRepository,
            this.fileSystem,
            logger
        );
        
        const result = await agentService.executeProject(config);
        
        if (result.success) {
            logger.info('🎉 Pilot Agent completed successfully!');
            if (result.changes.length > 0) {
                logger.info(`📝 Modified ${result.changes.length} file(s)`);
                result.changes.forEach(change => {
                    logger.info(`  ${change.type}: ${change.file}`);
                });
            }
        }
    }

    async showConfig(args, logger) {
        const configPath = this.getConfigPath(args);
        
        try {
            const config = await this.configLoader.loadConfig(configPath);
            logger.info(`📋 Current configuration (${configPath}):`);
            console.log(JSON.stringify(config.toJSON(), null, 2));
        } catch (error) {
            logger.error(`Could not load config: ${error.message}`);
            logger.info('💡 Run "pilot-agent-cli init" to create a default config');
        }
    }

    getConfigPath(args) {
        const configIndex = args.indexOf('--config');
        return configIndex !== -1 && args[configIndex + 1] 
            ? args[configIndex + 1] 
            : './pilot-agent.config.json';
    }

    showHelp() {
        console.log('🤖 Pilot Agent CLI - GitHub Copilot Automation Tool');
        console.log('=================================================');
        console.log('');
        console.log('Usage: pilot-agent-cli <command> [options]');
        console.log('');
        console.log('Commands:');
        console.log('  init                          Create default configuration file');
        console.log('  run                           Execute Pilot Agent with current config');
        console.log('  config                        Show current configuration');
        console.log('  help                          Show this help message');
        console.log('');
        console.log('Options:');
        console.log('  --config <path>               Specify config file path (default: ./pilot-agent.config.json)');
        console.log('  --verbose                     Enable verbose logging');
        console.log('');
        console.log('Examples:');
        console.log('  pilot-agent-cli init');
        console.log('  pilot-agent-cli run --verbose');
        console.log('  pilot-agent-cli run --config ./custom-config.json');
        console.log('  pilot-agent-cli config');
        console.log('');
        console.log('Configuration File Structure:');
        console.log('  {');
        console.log('    "rootDir": "./",                    // Project root directory');
        console.log('    "targetFiles": ["src/app.js"],     // Files to modify/create');
        console.log('    "readFiles": ["README.md"],        // Context files to read');
        console.log('    "prompt": "Add error handling",    // Instructions for Copilot');
        console.log('    "autoCommit": true,                // Auto-commit changes');
        console.log('    "autoAccept": true,                // Auto-accept suggestions');
        console.log('    "commitMessage": "",               // Custom commit message');
        console.log('    "squashOnSuccess": true            // Squash commits on goal completion');
        console.log('  }');
    }
}

// Run CLI if called directly
if (require.main === module) {
    const cli = new PilotAgentCLI();
    cli.run(process.argv.slice(2));
}

module.exports = PilotAgentCLI;
