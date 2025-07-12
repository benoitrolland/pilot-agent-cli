#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Ensure all required directories exist
const requiredDirs = [
    path.join(__dirname, 'src', 'domain', 'entities'),
    path.join(__dirname, 'src', 'domain', 'ports'), 
    path.join(__dirname, 'src', 'domain', 'services'),
    path.join(__dirname, 'src', 'infrastructure', 'adapters'),
    path.join(__dirname, 'src', 'infrastructure', 'config'),
    path.join(__dirname, 'src', 'core')
];

requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Import dependencies with fallbacks
let CopilotClient, CopilotAgentService, SimpleGitAdapter, FileSystemAdapter, ConfigLoader, ProjectConfig;

try {
    CopilotClient = require('./copilot-client');
} catch (error) {
    console.error('❌ Could not load CopilotClient:', error.message);
    process.exit(1);
}

try {
    CopilotAgentService = require('./src/domain/services/CopilotAgentService');
    SimpleGitAdapter = require('./src/infrastructure/adapters/SimpleGitAdapter');
    FileSystemAdapter = require('./src/infrastructure/adapters/FileSystemAdapter');
    ConfigLoader = require('./src/infrastructure/config/ConfigLoader');
    ProjectConfig = require('./src/domain/entities/ProjectConfig');
} catch (error) {
    console.error('❌ Could not load required modules. Please ensure all files are properly created.');
    console.error('Error:', error.message);
    process.exit(1);
}

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
                case 'test':
                    await this.runTests(args, logger);
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
        
        // Also create a sample config with examples
        const exampleConfig = new ProjectConfig({
            rootDir: "./",
            targetFiles: [
                "src/components/Header.js",
                "src/utils/helpers.js", 
                "docs/API.md"
            ],
            readFiles: [
                "README.md",
                "package.json",
                "src/types/index.ts"
            ],
            prompt: "Add comprehensive error handling and logging to all components. Follow clean code principles and add JSDoc comments.",
            autoCommit: true,
            autoAccept: true,
            commitMessage: "",
            squashOnSuccess: true
        });

        const examplePath = configPath.replace('.json', '.example.json');
        await this.configLoader.saveConfig(exampleConfig, examplePath);
        logger.info(`📄 Created example config: ${examplePath}`);
    }

    async runAgent(args, logger) {
        const configPath = this.getConfigPath(args);
        
        try {
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
        } catch (error) {
            if (error.message.includes('Failed to load config')) {
                logger.error('Configuration file not found or invalid');
                logger.info('💡 Run "node pilot-agent-cli.js init" to create a default config');
            } else {
                throw error;
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
            logger.info('💡 Run "node pilot-agent-cli.js init" to create a default config');
        }
    }

    async runTests(args, logger) {
        logger.info('🧪 Running tests...');
        
        // Simple test runner for our domain logic
        try {
            // Test ProjectConfig
            const testConfig = new ProjectConfig({
                rootDir: './test',
                prompt: 'Test prompt',
                targetFiles: ['test.js']
            });
            
            if (testConfig.rootDir !== './test') {
                throw new Error('ProjectConfig test failed');
            }
            
            logger.info('✅ ProjectConfig tests passed');
            
            // Test FileSystemAdapter
            const fileAdapter = new FileSystemAdapter();
            const testPath = fileAdapter.resolve(__dirname, 'test.txt');
            
            if (!testPath.includes(__dirname)) {
                throw new Error('FileSystemAdapter test failed');
            }
            
            logger.info('✅ FileSystemAdapter tests passed');
            logger.info('🎉 All tests passed!');
            
        } catch (error) {
            logger.error(`Tests failed: ${error.message}`);
            process.exit(1);
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
        console.log('==================================================');
        console.log('');
        console.log('Usage: pilot-agent-cli <command> [options]');
        console.log('');
        console.log('Commands:');
        console.log('  init                          Create default configuration file');
        console.log('  run                           Execute Pilot Agent with current config');
        console.log('  config                        Show current configuration');
        console.log('  test                          Run basic tests');
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
        console.log('  pilot-agent-cli test');
        console.log('');
        console.log('Getting Started:');
        console.log('  1. pilot-agent-cli init           # Create config file');
        console.log('  2. Edit pilot-agent.config.json   # Customize settings');
        console.log('  3. pilot-agent-cli run            # Execute automation');
        console.log('');
        console.log('Configuration File Structure:');
        console.log('  {');
        console.log('    "rootDir": "./",                 // Project root directory');
        console.log('    "targetFiles": ["src/app.js"],  // Files to modify/create');
        console.log('    "readFiles": ["README.md"],     // Context files to read');
        console.log('    "prompt": "Add error handling", // Instructions for Copilot');
        console.log('    "autoCommit": true,             // Auto-commit changes');
        console.log('    "autoAccept": true,             // Auto-accept suggestions');
        console.log('    "commitMessage": "",            // Custom commit message');
        console.log('    "squashOnSuccess": true         // Squash commits on goal completion');
        console.log('  }');
        console.log('');
        console.log('Prerequisites:');
        console.log('  - npm install -g @github/copilot-language-server');
        console.log('  - GitHub Copilot subscription');
        console.log('  - Authenticated GitHub CLI (gh auth login)');
    }
}

// Run CLI if called directly
if (require.main === module) {
    const cli = new PilotAgentCLI();
    cli.run(process.argv.slice(2));
}

module.exports = PilotAgentCLI;
