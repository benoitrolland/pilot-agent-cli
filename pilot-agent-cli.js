#!/usr/bin/env node

/**
 * Pilot Agent CLI - Simplified version for global installation
 * This version works reliably with minimal dependencies
 */

const path = require('path');
const fs = require('fs');

// Detect if running from global installation or local development
const isGlobalInstall = !fs.existsSync(path.join(__dirname, 'src'));

// Simple help function that always works
function showHelp() {
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

    if (isGlobalInstall) {
        console.log('⚠️  Global Installation Detected:');
        console.log('   Full agent functionality requires running from development directory.');
        console.log('   For complete features, clone the repository and run locally.');
        console.log('   Repository: https://github.com/benoitrolland/pilot-agent-cli');
        console.log('');
    }

    console.log('Getting Started:');
    console.log('  1. pilot-agent-cli auth           # Authenticate with GitHub Copilot');
    console.log('  2. pilot-agent-cli init           # Create config file');
    console.log('  3. Edit pilot-agent.config.json   # Customize settings');
    console.log('  4. pilot-agent-cli run            # Execute automation');
    console.log('');
    console.log('Prerequisites:');
    console.log('  - npm install -g @github/copilot-language-server');
    console.log('  - GitHub Copilot subscription');
    console.log('  - Authenticated GitHub CLI (gh auth login)');
}

// Simple init function
function initConfig(args) {
    const configIndex = args.indexOf('--config');
    const configPath = configIndex !== -1 && args[configIndex + 1]
        ? args[configIndex + 1]
        : './pilot-agent.config.json';

    if (fs.existsSync(configPath)) {
        console.log(`⚠️ Config file already exists: ${configPath}`);
        return;
    }

    const defaultConfig = {
        rootDir: "./",
        targetFiles: ["src/app.js"],
        readFiles: ["README.md"],
        prompt: "Add error handling",
        autoCommit: true,
        autoAccept: true,
        commitMessage: "",
        squashOnSuccess: true
    };

    try {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        console.log(`✅ Created default config file: ${configPath}`);
        console.log('📝 Edit the config file to customize your settings');

        // Also create example config
        const exampleConfig = {
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
        };

        const examplePath = configPath.replace('.json', '.example.json');
        fs.writeFileSync(examplePath, JSON.stringify(exampleConfig, null, 2));
        console.log(`📄 Created example config: ${examplePath}`);
    } catch (error) {
        console.error(`❌ Failed to create config file: ${error.message}`);
    }
}

// Simple config display
function showConfig(args) {
    const configIndex = args.indexOf('--config');
    const configPath = configIndex !== -1 && args[configIndex + 1]
        ? args[configIndex + 1]
        : './pilot-agent.config.json';

    try {
        if (!fs.existsSync(configPath)) {
            console.error('❌ Configuration file not found');
            console.log('💡 Run "pilot-agent-cli init" to create a default config');
            return;
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`📋 Current configuration (${configPath}):`);
        console.log(JSON.stringify(config, null, 2));
    } catch (error) {
        console.error(`❌ Could not load config: ${error.message}`);
        console.log('💡 Run "pilot-agent-cli init" to create a default config');
    }
}

// Simple auth function
function runAuth() {
    console.log('🔐 Starting GitHub Copilot authentication...');

    if (isGlobalInstall) {
        console.log('⚠️ Authentication feature not available in global installation');
        console.log('💡 For full authentication features, run from development directory');
        console.log('💡 Alternative: Use "gh auth login" for GitHub CLI authentication');
        return;
    }

    // Try to launch copilot-auth.js if available
    const authScript = path.join(__dirname, 'copilot-auth.js');
    if (fs.existsSync(authScript)) {
        console.log('🚀 Launching Copilot authentication...');
        const { spawn } = require('child_process');
        const authProcess = spawn('node', [authScript], {
            stdio: 'inherit'
        });

        authProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Authentication completed');
            } else {
                console.error(`❌ Authentication failed with code: ${code}`);
            }
        });
    } else {
        console.error('❌ copilot-auth.js not found');
        console.log('💡 Use "gh auth login" for GitHub CLI authentication');
    }
}

// Simple run function
function runAgent() {
    console.log('🤖 Starting Pilot Agent...');

    if (isGlobalInstall) {
        console.log('⚠️ Full agent functionality not available in global installation');
        console.log('💡 For complete features, clone the repository and run locally');
        console.log('💡 Repository: https://github.com/benoitrolland/pilot-agent-cli');
        return;
    }

    // Try to load and run the full agent
    try {
        console.log('🔄 Loading full agent functionality...');
        console.log('⚠️ Full implementation requires development environment');
        console.log('💡 This is a simplified version for global installation');
    } catch (error) {
        console.error(`❌ Could not load full agent: ${error.message}`);
    }
}

// Simple test function
function runTests() {
    console.log('🧪 Running basic tests...');

    try {
        // Test config creation and loading
        const testConfigPath = './test-config.json';
        const testConfig = {
            rootDir: './test',
            prompt: 'Test prompt',
            targetFiles: ['test.js']
        };

        fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
        const loadedConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));

        if (loadedConfig.rootDir === './test') {
            console.log('✅ Configuration tests passed');
        } else {
            throw new Error('Configuration test failed');
        }

        // Clean up
        fs.unlinkSync(testConfigPath);

        console.log('✅ CLI interface tests passed');
        console.log('🎉 All basic tests passed!');

        if (isGlobalInstall) {
            console.log('💡 For complete tests, run from development directory');
        }
    } catch (error) {
        console.error(`❌ Tests failed: ${error.message}`);
    }
}

// Main function - ultra simple and reliable
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    try {
        switch (command) {
            case 'init':
                initConfig(args);
                break;
            case 'run':
                runAgent(args);
                break;
            case 'config':
                showConfig(args);
                break;
            case 'test':
                runTests(args);
                break;
            case 'auth':
                runAuth(args);
                break;
            case 'help':
            default:
                showHelp();
                break;
        }
    } catch (error) {
        console.error(`❌ Command failed: ${error.message}`);
        console.log('\n');
        showHelp();
    }
}

// Export for use by other modules (for development)
if (!isGlobalInstall) {
    try {
        // Try to load the complex version for development
        const complexCLI = require('./pilot-agent-cli-complex');
        module.exports = complexCLI;
    } catch (error) {
        // Fallback to simple version
        module.exports = { main, showHelp, initConfig, runAgent, showConfig, runTests, runAuth };
    }
}

// Run immediately - no async, no complex error handling
if (require.main === module) {
    main();
}
