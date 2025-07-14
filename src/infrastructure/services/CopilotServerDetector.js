/**
 * CopilotServerDetector - Service for detecting copilot-language-server
 * Follows Single Responsibility Principle (SRP)
 */

const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const fs = require('fs');
const path = require('path');

class CopilotServerDetector {
    constructor() {
        this.detectionMethods = [
            this._detectViaNodePackageManager.bind(this),
            this._detectViaPath.bind(this),
            this._detectViaSystemCommand.bind(this),
            this._detectViaGlobalNodeModules.bind(this)
        ];
    }

    /**
     * Detect copilot-language-server using multiple methods
     * @returns {Promise<{found: boolean, method: string, path?: string}>}
     */
    async detect() {
        console.log('🔧 Searching for copilot-language-server...');

        for (const method of this.detectionMethods) {
            const result = await method();
            if (result.found) {
                console.log(`✅ copilot-language-server found via ${result.method}`);
                return result;
            }
        }

        return this._handleNotFound();
    }

    /**
     * Method 1: Try npx which works on all platforms
     */
    async _detectViaNodePackageManager() {
        try {
            await exec('npx copilot-language-server --version', { timeout: 5000 });
            return { found: true, method: 'npx' };
        } catch (error) {
            return { found: false };
        }
    }

    /**
     * Method 2: Try direct command (works if in PATH)
     */
    async _detectViaPath() {
        try {
            await exec('copilot-language-server --version', { timeout: 5000 });
            return { found: true, method: 'PATH' };
        } catch (error) {
            return { found: false };
        }
    }

    /**
     * Method 3: Try where command on Windows / which on Unix
     */
    async _detectViaSystemCommand() {
        try {
            const command = process.platform === 'win32' ? 'where copilot-language-server' : 'which copilot-language-server';
            const { stdout } = await exec(command, { timeout: 5000 });
            const serverPath = stdout.trim();
            return { found: true, method: 'system-command', path: serverPath };
        } catch (error) {
            return { found: false };
        }
    }

    /**
     * Method 4: Check npm global directory
     */
    async _detectViaGlobalNodeModules() {
        try {
            const { stdout } = await exec('npm root -g', { timeout: 5000 });
            const globalNodeModules = stdout.trim();
            const expectedPath = path.join(globalNodeModules, '@github', 'copilot-language-server');

            if (fs.existsSync(expectedPath)) {
                const binPath = path.join(expectedPath, 'bin', 'copilot-language-server');
                if (fs.existsSync(binPath)) {
                    return { found: true, method: 'npm-global', path: binPath };
                }
            }
            return { found: false };
        } catch (error) {
            return { found: false };
        }
    }

    /**
     * Handle case when server is not found
     */
    _handleNotFound() {
        console.error('❌ copilot-language-server not found');
        console.log('📦 Installation required:');
        console.log('   npm install -g @github/copilot-language-server');
        console.log('');
        console.log('🔍 Troubleshooting:');
        console.log('   1. Verify installation: npx copilot-language-server --version');
        console.log('   2. Check npm global path: npm root -g');
        console.log('   3. Restart terminal after installation');

        return { found: false };
    }

    /**
     * Get recommended spawn options for the detected server
     * @param {string} method - Detection method used
     * @returns {Object} Spawn options
     */
    getSpawnOptions(method) {
        const baseOptions = {
            stdio: ['pipe', 'pipe', 'pipe']
        };

        // Use shell on Windows for npm-based commands
        if (process.platform === 'win32' && (method === 'npx' || method === 'system-command')) {
            return { ...baseOptions, shell: true };
        }

        return baseOptions;
    }

    /**
     * Get spawn command and args based on detection method
     * @param {string} method - Detection method used
     * @param {string} path - Optional path to server
     * @returns {Object} Command and arguments for spawn
     */
    getSpawnCommand(method, path = null) {
        switch (method) {
            case 'npx':
                return { command: 'npx', args: ['copilot-language-server', '--stdio'] };
            case 'PATH':
                return { command: 'copilot-language-server', args: ['--stdio'] };
            case 'system-command':
                return path ?
                    { command: path, args: ['--stdio'] } :
                    { command: 'copilot-language-server', args: ['--stdio'] };
            case 'npm-global':
                return path ?
                    { command: 'node', args: [path, '--stdio'] } :
                    { command: 'copilot-language-server', args: ['--stdio'] };
            default:
                return { command: 'npx', args: ['copilot-language-server', '--stdio'] };
        }
    }
}

module.exports = CopilotServerDetector;
