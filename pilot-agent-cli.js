#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Detect if running from global installation or local development
const isGlobalInstall = !fs.existsSync(path.join(__dirname, 'src'));

// Simple logging for debugging
function debugLog(message) {
    if (process.env.DEBUG_PILOT_CLI) {
        console.log(`[DEBUG] ${message}`);
    }
}

debugLog(`Running from: ${__dirname}`);
debugLog(`Is global install: ${isGlobalInstall}`);

// Import dependencies with fallbacks for global installation
let CopilotClient, CopilotAgentService, SimpleGitAdapter, FileSystemAdapter, ConfigLoader, ProjectConfig;

if (!isGlobalInstall) {
    // Development environment - use local files
    try {
        CopilotClient = require('./copilot-client');
        debugLog('Loaded CopilotClient successfully');
    } catch (error) {
        console.error('❌ Could not load CopilotClient:', error.message);
        // Don't exit, use fallback
        CopilotClient = class {
            constructor(verbose = false) { this.verbose = verbose; }
            async start() { return Promise.resolve(); }
            async stop() { return Promise.resolve(); }
            async getSuggestions() { return []; }
        };
    }

    try {
        CopilotAgentService = require('./src/domain/services/CopilotAgentService');
        SimpleGitAdapter = require('./src/infrastructure/adapters/SimpleGitAdapter');
        FileSystemAdapter = require('./src/infrastructure/adapters/FileSystemAdapter');
        ConfigLoader = require('./src/infrastructure/config/ConfigLoader');
        ProjectConfig = require('./src/domain/entities/ProjectConfig');
        debugLog('Loaded all domain modules successfully');
    } catch (error) {
        console.error('❌ Could not load required modules:', error.message);
        // Don't exit, use fallbacks
        CopilotAgentService = class {
            constructor() {}
            async executeProject() {
                throw new Error('Full agent functionality requires running from development directory.');
            }
        };

        SimpleGitAdapter = class {
            constructor() {}
        };

        FileSystemAdapter = class {
            exists(path) { return fs.existsSync(path); }
            resolve(...paths) { return path.resolve(...paths); }
        };

        ConfigLoader = class {
            constructor() {}
            generateDefaultConfig() {
                return {
                    rootDir: "./",
                    targetFiles: ["src/app.js"],
                    readFiles: ["README.md"],
                    prompt: "Add error handling",
                    autoCommit: true,
                    autoAccept: true,
                    commitMessage: "",
                    squashOnSuccess: true
                };
            }
            async saveConfig(config, filePath) {
                fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
            }
            async loadConfig(filePath) {
                if (!fs.existsSync(filePath)) {
                    throw new Error('Failed to load config');
                }
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        };

        ProjectConfig = class {
            constructor(config) {
                Object.assign(this, config);
            }
            toJSON() {
                return { ...this };
            }
        };
    }
} else {
    // Global installation - use fallback implementations
    debugLog('Using fallback implementations for global install');

    CopilotClient = class {
        constructor(verbose = false) { this.verbose = verbose; }
        async start() { return Promise.resolve(); }
        async stop() { return Promise.resolve(); }
        async getSuggestions() { return []; }
    };

    CopilotAgentService = class {
        constructor() {}
        async executeProject() {
            throw new Error('Full agent functionality requires running from development directory.');
        }
    };

    SimpleGitAdapter = class {
        constructor() {}
    };

    FileSystemAdapter = class {
        exists(path) { return fs.existsSync(path); }
        resolve(...paths) { return path.resolve(...paths); }
    };

    ConfigLoader = class {
        constructor() {}
        generateDefaultConfig() {
            return {
                rootDir: "./",
                targetFiles: ["src/app.js"],
                readFiles: ["README.md"],
                prompt: "Add error handling",
                autoCommit: true,
                autoAccept: true,
                commitMessage: "",
                squashOnSuccess: true
            };
        }
        async saveConfig(config, filePath) {
            fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        }
        async loadConfig(filePath) {
            if (!fs.existsSync(filePath)) {
                throw new Error('Failed to load config');
            }
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    };

    ProjectConfig = class {
        constructor(config) {
            Object.assign(this, config);
        }
        toJSON() {
            return { ...this };
        }
    };
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
        try {
            this.fileSystem = new FileSystemAdapter();
            this.configLoader = new ConfigLoader(this.fileSystem);
            this.isGlobalInstall = isGlobalInstall;
            debugLog('PilotAgentCLI initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize CLI:', error.message);
            // Continue with basic functionality
            this.isGlobalInstall = true;
        }
    }

    async run(args) {
        try {
            const command = args[0] || 'help';
            const verbose = args.includes('--verbose');
            const logger = new Logger(verbose);

            debugLog(`Executing command: ${command}`);

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
                case 'auth':
                    await this.runAuth(args, logger);
                    break;
                case 'help':
                default:
                    this.showHelp();
                    break;
            }
        } catch (error) {
            console.error(`❌ Command failed: ${error.message}`);
            if (args.includes('--verbose')) {
                console.error(error.stack);
            }
            // Don't exit, just show help
            console.log('\n');
            this.showHelp();
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
                logger.info('💡 Run "pilot-agent-cli init" to create a default config');
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
            logger.info('💡 Run "pilot-agent-cli init" to create a default config');
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
        console.log('  auth                          Run GitHub Copilot authentication');
        console.log('  help                          Show this help message');
        console.log('');
        console.log('Options:');
        console.log('  --config <path>               Specify config file path (default: ./pilot-agent.config.json)');
        console.log('  --verbose                     Enable verbose logging');
        console.log('');
        console.log('Examples:');
        console.log('  pilot-agent-cli init');
        console.log('  pilot-agent-cli auth          # Authenticate with GitHub Copilot');
        console.log('  pilot-agent-cli run --verbose');
        console.log('  pilot-agent-cli run --config ./custom-config.json');
        console.log('  pilot-agent-cli config');
        console.log('  pilot-agent-cli test');
        console.log('');

        if (this.isGlobalInstall) {
            console.log('⚠️  Global Installation Detected:');
            console.log('   Full agent functionality requires running from development directory.');
            console.log('   For complete features, clone the repository and run locally.');
            console.log('');
        }

        console.log('Getting Started:');
        console.log('  1. pilot-agent-cli auth           # Authenticate with GitHub Copilot');
        console.log('  2. pilot-agent-cli init           # Create config file');
        console.log('  3. Edit pilot-agent.config.json   # Customize settings');
        console.log('  4. pilot-agent-cli run            # Execute automation');
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

    async runAuth(args, logger) {
        logger.info('🔐 Starting GitHub Copilot authentication...');

        if (this.isGlobalInstall) {
            logger.warn('Authentication feature not available in global installation');
            logger.info('💡 For full authentication features, run from development directory');
            logger.info('💡 Alternative: Use "gh auth login" for GitHub CLI authentication');
            return;
        }

        // Launch copilot-auth.js
        const { spawn } = require('child_process');
        const authScript = path.join(__dirname, 'copilot-auth.js');

        if (!fs.existsSync(authScript)) {
            logger.error('copilot-auth.js not found');
            return;
        }

        logger.info('🚀 Launching Copilot authentication...');
        const authProcess = spawn('node', [authScript], {
            stdio: 'inherit'
        });

        authProcess.on('close', (code) => {
            if (code === 0) {
                logger.info('✅ Authentication completed');
            } else {
                logger.error(`Authentication failed with code: ${code}`);
            }
        });
    }
}

// Run CLI if called directly
if (require.main === module) {
    const cli = new PilotAgentCLI();
    cli.run(process.argv.slice(2));
}

module.exports = PilotAgentCLI;
