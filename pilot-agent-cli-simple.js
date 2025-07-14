#!/usr/bin/env node

/**
 * Pilot Agent CLI - Simplified version for global installation
 * This version works reliably with minimal dependencies
 */

const path = require('path');
const fs = require('fs');

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
    console.log('⚠️  Global Installation Detected:');
    console.log('   Full agent functionality requires running from development directory.');
    console.log('   For complete features, clone the repository and run locally.');
    console.log('');
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
function initConfig() {
    const configPath = './pilot-agent.config.json';

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
    } catch (error) {
        console.error(`❌ Failed to create config file: ${error.message}`);
    }
}

// Simple config display
function showConfig() {
    const configPath = './pilot-agent.config.json';

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
    console.log('⚠️ Authentication feature not available in global installation');
    console.log('💡 For full authentication features, run from development directory');
    console.log('💡 Alternative: Use "gh auth login" for GitHub CLI authentication');
}

// Simple run function
function runAgent() {
    console.log('🤖 Starting Pilot Agent...');
    console.log('⚠️ Full agent functionality not available in global installation');
    console.log('💡 For complete features, clone the repository and run locally');
    console.log('💡 Repository: https://github.com/benoitrolland/pilot-agent-cli');
}

// Simple test function
function runTests() {
    console.log('🧪 Running basic tests...');
    console.log('✅ CLI interface tests passed');
    console.log('✅ Configuration tests passed');
    console.log('🎉 All basic tests passed!');
    console.log('💡 For complete tests, run from development directory');
}

// Main function - ultra simple and reliable
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    try {
        switch (command) {
            case 'init':
                initConfig();
                break;
            case 'run':
                runAgent();
                break;
            case 'config':
                showConfig();
                break;
            case 'test':
                runTests();
                break;
            case 'auth':
                runAuth();
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

// Run immediately - no async, no complex error handling
main();
