const { spawn } = require('child_process');
const path = require('path');

/**
 * Secure process launcher following security best practices
 * - No shell execution by default
 * - Input validation
 * - Process isolation
 * - Resource management
 */
class SecureProcessLauncher {
    constructor(logger) {
        this.logger = logger;
        this.activeProcesses = new Set();
    }

    /**
     * Launch GitHub Copilot Language Server securely
     * @param {string} serverPath - Path to the language server
     * @param {object} env - Environment variables
     * @returns {ChildProcess} - The spawned process
     */
    async launchCopilotServer(serverPath, env = {}) {
        this.validateServerPath(serverPath);

        const processEnv = this.prepareEnvironment(env);
        const args = ['--stdio'];

        // Attempt multiple secure launch strategies
        const strategies = [
            () => this.spawnDirect(serverPath, args, processEnv),
            () => this.spawnViaNode(serverPath, args, processEnv),
            () => this.spawnViaNpx(['copilot-language-server'].concat(args), processEnv)
        ];

        let lastError = null;

        for (const strategy of strategies) {
            try {
                const process = await strategy();
                this.registerProcess(process);
                return process;
            } catch (error) {
                this.logger?.debug(`Launch strategy failed: ${error.message}`);
                lastError = error;
            }
        }

        throw new Error(`Failed to launch Copilot server: ${lastError?.message || 'All strategies failed'}`);
    }

    /**
     * Validate server path for security
     * @param {string} serverPath - Path to validate
     */
    validateServerPath(serverPath) {
        if (!serverPath || typeof serverPath !== 'string') {
            throw new Error('Invalid server path provided');
        }

        // Basic path traversal protection
        if (serverPath.includes('..') || serverPath.includes('~')) {
            throw new Error('Potentially unsafe server path detected');
        }
    }

    /**
     * Prepare secure environment variables
     * @param {object} env - Environment variables
     * @returns {object} - Sanitized environment
     */
    prepareEnvironment(env) {
        const processEnv = {
            ...process.env,
            ...env
        };

        // Remove potentially dangerous environment variables
        delete processEnv.LD_PRELOAD;
        delete processEnv.DYLD_INSERT_LIBRARIES;

        return processEnv;
    }

    /**
     * Spawn process directly
     * @param {string} command - Command to execute
     * @param {string[]} args - Arguments
     * @param {object} env - Environment
     * @returns {ChildProcess}
     */
    spawnDirect(command, args, env) {
        return spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: env,
            shell: false // Critical: never use shell
        });
    }

    /**
     * Spawn via Node.js
     * @param {string} serverPath - Path to server
     * @param {string[]} args - Arguments
     * @param {object} env - Environment
     * @returns {ChildProcess}
     */
    spawnViaNode(serverPath, args, env) {
        const nodePath = process.execPath;
        return spawn(nodePath, [serverPath].concat(args), {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: env,
            shell: false
        });
    }

    /**
     * Spawn via npx
     * @param {string[]} command - Command with arguments
     * @param {object} env - Environment
     * @returns {ChildProcess}
     */
    spawnViaNpx(command, env) {
        return spawn('npx', command, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: env,
            shell: false
        });
    }

    /**
     * Register and monitor process
     * @param {ChildProcess} process - Process to register
     */
    registerProcess(process) {
        this.activeProcesses.add(process);

        process.on('exit', () => {
            this.activeProcesses.delete(process);
        });

        process.on('error', (error) => {
            this.logger?.error(`Process error: ${error.message}`);
            this.activeProcesses.delete(process);
        });
    }

    /**
     * Cleanup all active processes
     */
    cleanup() {
        for (const process of this.activeProcesses) {
            try {
                if (!process.killed) {
                    process.kill('SIGTERM');
                }
            } catch (error) {
                this.logger?.error(`Failed to terminate process: ${error.message}`);
            }
        }
        this.activeProcesses.clear();
    }
}

module.exports = SecureProcessLauncher;
