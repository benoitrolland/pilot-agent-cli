#!/usr/bin/env node

/**
 * Pilot Agent CLI - Ultra-minimal version that always works
 */

const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const command = args[0];

// Better detection of global vs local installation
const isGlobalInstall = !fs.existsSync(path.join(__dirname, 'src')) ||
                       !fs.existsSync(path.join(__dirname, 'copilot-auth.js'));

// Handle auth command first
if (command === 'auth') {
    console.log('🔐 GitHub Copilot Authentication');
    console.log('=================================');
    console.log('');

    if (isGlobalInstall) {
        console.log('⚠️  Authentication requires running from development directory.');
        console.log('💡 Please clone the repository and run:');
        console.log('');
        console.log('   git clone https://github.com/benoitrolland/pilot-agent-cli.git');
        console.log('   cd pilot-agent-cli');
        console.log('   node copilot-auth.js');
        console.log('');
        console.log('🔗 Alternative: Use GitHub CLI authentication:');
        console.log('   gh auth login');
        console.log('');
    } else {
        // We're in development directory - launch copilot-auth.js
        console.log('🚀 Launching Copilot authentication from development directory...');
        console.log('');

        const authScript = path.join(__dirname, 'copilot-auth.js');
        if (fs.existsSync(authScript)) {
            const { spawn } = require('child_process');
            const authProcess = spawn('node', [authScript], {
                stdio: 'inherit'
            });

            authProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('\n✅ Authentication completed successfully');
                } else {
                    console.error(`\n❌ Authentication failed with code: ${code}`);
                }
            });

            authProcess.on('error', (error) => {
                console.error(`❌ Failed to launch authentication: ${error.message}`);
            });
        } else {
            console.error('❌ copilot-auth.js not found in development directory');
        }
    }
    return;
}

// Show help for all other commands or no command
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
console.log('   Repository: https://github.com/benoitrolland/pilot-agent-cli');
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

if (command && command !== 'help') {
    console.log('');
    console.log(`💡 Command "${command}" received but limited functionality in global install.`);
    console.log('💡 For full functionality, run from development directory.');
}
