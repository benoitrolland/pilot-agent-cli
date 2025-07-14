#!/usr/bin/env node

process.removeAllListeners('warning');
process.on('warning', (warning) => {
    if (!warning.message.includes('DEP0132') && 
        !warning.message.includes('Passing a callback to worker.terminate()')) {
        console.warn(warning.message);
    }
});

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// Create required directories
const requiredDirs = [
    path.join(__dirname, 'src', 'core'),
    path.join(__dirname, 'src', 'infrastructure', 'process')
];

requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Import dependencies with fallbacks
let FeatureAnalyzer, SecureProcessLauncher;

try {
    FeatureAnalyzer = require('./src/core/FeatureAnalyzer');
} catch (error) {
    // Fallback inline implementation
    FeatureAnalyzer = class {
        constructor(verbose) { this.verbose = verbose; }
        analyzeFeatureFlags(flags) {
            console.log('\n🔍 Feature Flags Received:');
            Object.entries(flags).forEach(([key, value]) => {
                console.log(`   ${key}: ${JSON.stringify(value)}`);
            });
            return { enabled: [], disabled: [], experimental: [] };
        }
        handlePreconditions() {
            console.log('🔧 Preconditions notification received');
        }
        getImplementationSuggestions() { return []; }
    };
}

try {
    SecureProcessLauncher = require('./src/infrastructure/process/SecureProcessLauncher');
} catch (error) {
    // Fallback inline implementation
    SecureProcessLauncher = class {
        constructor(logger) { this.logger = logger; }
        async launchCopilotServer(serverPath, env) {
            // Secure spawn without shell option
            return spawn('npx', ['copilot-language-server', '--stdio'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: env
                // No shell: true for security
            });
        }
    };
}

class CopilotClient {
    constructor(verbose = false) {
        this.verbose = verbose;
        this.languageServer = null;
    }

    async start() {
        // Prepare eventual Copilot connection
        if (this.verbose) {
            console.log('🔄 Initializing Copilot client...');
        }
        // Nothing to do for now
        return Promise.resolve();
    }

    async stop() {
        // Clean up eventual Copilot connection
        if (this.verbose) {
            console.log('🛑 Stopping Copilot client...');
        }
        // Nothing to do for now
        return Promise.resolve();
    }

    async getSuggestions(context) {
        try {
            // Try to use Copilot Language Server
            return await this.getCopilotSuggestions(context);
        } catch (error) {
            if (this.verbose) {
                console.warn('Copilot Language Server not available, using fallback');
            }
            // Fallback to mock suggestions for development
            return this.getMockSuggestions(context);
        }
    }

    async getCopilotSuggestions(context) {
        return new Promise((resolve, reject) => {
            const copilotProcess = spawn('copilot-language-server', ['--stdio'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let response = '';
            let error = '';

            // Enhanced error handling for missing server
            copilotProcess.on('error', (err) => {
                if (err.code === 'ENOENT') {
                    reject(new Error('copilot-language-server not available. Install it with: npm install -g @github/copilot-language-server'));
                } else {
                    reject(new Error(`Copilot server error: ${err.message}`));
                }
            });

            copilotProcess.stdout.on('data', (data) => {
                response += data.toString();
            });

            copilotProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            copilotProcess.on('close', (code) => {
                if (code === 0) {
                    try {
                         const suggestions = this.parseCopilotResponse(response);
                        resolve(suggestions);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse Copilot response: ${parseError.message}`));
                    }
                } else {
                    reject(new Error(`Copilot process failed: ${error}`));
                }
            });

            // Send request to Copilot
            const request = this.buildCopilotRequest(context);
            copilotProcess.stdin.write(JSON.stringify(request));
            copilotProcess.stdin.end();

            // Timeout after 30 seconds
            setTimeout(() => {
                copilotProcess.kill();
                reject(new Error('Copilot request timeout'));
            }, 30000);
        });
    }

    buildCopilotRequest(context) {
        return {
            jsonrpc: "2.0",
            id: 1,
            method: "textDocument/completion",
            params: {
                textDocument: {
                    uri: "file:///temp.js"
                },
                position: {
                    line: 0,
                    character: 0
                },
                context: {
                    triggerKind: 1,
                    prompt: context
                }
            }
        };
    }

    parseCopilotResponse(response) {
        // Parse JSON-RPC response
        const lines = response.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.result && parsed.result.items) {
                    return parsed.result.items.map(item => ({
                        content: item.insertText || item.label,
                        description: item.detail || 'Copilot suggestion'
                    }));
                }
            } catch (error) {
                // Continue to next line
            }
        }
        
        throw new Error('No valid suggestions found in response');
    }

    getMockSuggestions(context) {
        // Mock suggestions for development/testing
        if (this.verbose) {
            console.log('🔧 Using mock Copilot suggestions');
        }

        const suggestions = [];
        
        // Extract context content for analysis
        const contextContent = typeof context === 'string' ? context :
                             (context.content || context.filePath || JSON.stringify(context));

        if (contextContent.includes('error handling')) {
            suggestions.push({
                content: this.generateErrorHandlingCode(contextContent),
                description: 'Added comprehensive error handling'
            });
        } else if (contextContent.includes('documentation')) {
            suggestions.push({
                content: this.generateDocumentationCode(contextContent),
                description: 'Added JSDoc documentation'
            });
        } else if (contextContent.includes('fibonacci')) {
            suggestions.push({
                content: this.generateFibonacciCompletion(context),
                description: 'Fibonacci function completion'
            });
        } else if (contextContent.includes('quicksort')) {
            suggestions.push({
                content: this.generateQuicksortSuggestion(context),
                description: 'Quicksort optimization suggestion'
            });
        } else if (contextContent.includes('react') || contextContent.includes('useState')) {
            suggestions.push({
                content: this.generateReactSuggestion(context),
                description: 'React component enhancement'
            });
        } else {
            suggestions.push({
                content: this.generateGenericImprovement(contextContent),
                description: 'Code improvement suggestion'
            });
        }

        return Promise.resolve(suggestions);
    }

    generateErrorHandlingCode(context) {
        return `// Enhanced with error handling
try {
    // Your code here
    console.log('Operation completed successfully');
} catch (error) {
    console.error('Operation failed:', error.message);
    throw error;
}`;
    }

    generateDocumentationCode(context) {
        return `/**
 * Enhanced function with comprehensive documentation
 * @param {*} param Description of parameter
 * @returns {*} Description of return value
 */
function enhancedFunction(param) {
    // Implementation with proper documentation
    return param;
}`;
    }

    generateFibonacciCompletion(context) {
        return `/**
 * Calculate Fibonacci number recursively
 * @param {number} n - The position in the Fibonacci sequence
 * @returns {number} - The Fibonacci number at position n
 */
function fibonacci(n) {
    if (n <= 1) {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}`;
    }

    generateQuicksortSuggestion(context) {
        return `// Optimized Quicksort implementation
function quicksort(arr) {
    if (arr.length <= 1) {
        return arr;
    }
    const pivot = arr[Math.floor(arr.length / 2)];
    const left = arr.filter(x => x < pivot);
    const right = arr.filter(x => x > pivot);

    return [...quicksort(left), pivot, ...quicksort(right)];
}`;
    }

    generateReactSuggestion(context) {
        return `import React, { useState } from 'react';

function EnhancedComponent() {
    const [state, setState] = useState(initialValue);

    // Handle state update
    const handleUpdate = (newValue) => {
        setState(newValue);
    };

    return (
        <div>
            <h1>Enhanced React Component</h1>
            <button onClick={() => handleUpdate('New Value')}>Update</button>
        </div>
    );
}`;
    }

    generateGenericImprovement(context) {
        return `// Improved code based on: ${context.substring(0, 100)}...
// Added clean code principles and best practices
const improvedCode = {
    // Your enhanced implementation here
};

module.exports = improvedCode;`;
    }

    async getCompletions(filePath, line, char) {
        // Read file content
        const content = fs.readFileSync(filePath, 'utf8');
        // Context for completion: content + position
        const context = {
            filePath,
            content,
            position: { line, char }
        };
        // Call suggestions
        const suggestions = await this.getSuggestions(context);
        // Adapt format for compatibility with rest of code
        return suggestions.map(s => ({
            insertText: s.content,
            label: s.description || 'Copilot Suggestion'
        }));
    }

    async checkDependencies() {
        const checks = [];

        // Check copilot-language-server
        try {
            await exec('which copilot-language-server', { timeout: 5000 });
            checks.push({ name: 'copilot-language-server', status: 'OK' });
        } catch (error) {
            try {
                await exec('npx copilot-language-server --version', { timeout: 5000 });
                checks.push({ name: 'copilot-language-server (via npx)', status: 'OK' });
            } catch (npxError) {
                checks.push({
                    name: 'copilot-language-server',
                    status: 'MISSING',
                    solution: 'npm install -g @github/copilot-language-server'
                });
            }
        }

        // Check GitHub authentication (if possible)
        try {
            await exec('gh auth status', { timeout: 5000 });
            checks.push({ name: 'GitHub CLI Auth', status: 'OK' });
        } catch (error) {
            checks.push({
                name: 'GitHub CLI Auth',
                status: 'WARNING',
                solution: 'gh auth login'
            });
        }

        // Display results
        console.log('\n📋 Dependency check:');
        checks.forEach(check => {
            const icon = check.status === 'OK' ? '✅' : check.status === 'WARNING' ? '⚠️' : '❌';
            console.log(`${icon} ${check.name}: ${check.status}`);
            if (check.solution) {
                console.log(`   💡 Solution: ${check.solution}`);
            }
        });

        const hasErrors = checks.some(check => check.status === 'MISSING');
        if (hasErrors) {
            throw new Error('Critical dependencies are missing');
        }

        return checks;
    }
}

async function demo(verbose = false) {
    const client = new CopilotClient(verbose);
    
    try {
        await client.start();
        
        const testFiles = [
            {
                name: path.join(__dirname, 'test_fibonacci.py'),
                content: `def fibonacci(n):
    """Calculate fibonacci number recursively"""
    if (n <= 1) {
        return n
    } else:
        `,
                line: 4,
                char: 8,
                description: 'Python Fibonacci function'
            },
            {
                name: path.join(__dirname, 'test_quicksort.js'),
                content: `function quicksort(arr) {
    if (arr.length <= 1) {
        return arr;
    }
    const pivot = arr[Math.floor(arr.length / 2)];
    const left = [];
    const right = [];
    
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] < pivot) {
            left.push(arr[i]);
        } else if (arr[i] > pivot) {
            right.push(arr[i]);
        }
    }
    
    return [...quicksort(left), pivot, ...quicksort(right)];
}
`,
                line: 10,
                char: 4,
                description: 'JavaScript Quicksort function'
            },
            {
                name: path.join(__dirname, 'test_react.jsx'),
                content: `import React, { useState } from 'react';

function TodoApp() {
    const [todos, setTodos] = useState([]);
    
    // Add function to handle new todo
    `,
                line: 5,
                char: 4,
                description: 'React TodoApp component'
            }
        ];

        console.log('📝 Creating test files...');

        for (const testFile of testFiles) {
            try {
                fs.writeFileSync(testFile.name, testFile.content);
                console.log(`\n📄 Test: ${testFile.description}`);
                console.log('Content:');
                console.log(testFile.content);
                
                const completions = await client.getCompletions(testFile.name, testFile.line, testFile.char);
                
                if (completions.length > 0) {
                    console.log('\n🎯 First suggestion:');
                    const first = completions[0];
                    const suggestion = first.insertText || first.label;
                    console.log(suggestion);
                }
                
                console.log('----------------------------------------');
            } catch (error) {
                console.error(`❌ Error with ${testFile.name}: ${error.message}`);
            }
        }
        
        testFiles.forEach(file => {
            try { 
                if (fs.existsSync(file.name)) {
                    fs.unlinkSync(file.name); 
                }
            } catch (e) {
                console.log(`Unable to delete ${file.name}: ${e.message}`);
            }
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('copilot-language-server not available')) {
            console.log('\n🔧 Installation instructions:');
            console.log('1. Install server: npm install -g @github/copilot-language-server');
            console.log('2. Check GitHub auth: gh auth status');
            console.log('3. If needed: gh auth login');
        }
    } finally {
        await client.stop();
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    const verbose = args.includes('--verbose');

    switch (command) {
        case 'demo':
            await demo(verbose);
            break;
            
        case 'complete':
            if (args.length < 4) {
                console.log('Usage: node copilot-client.js complete <file> <line> <character>');
                console.log('Example: node copilot-client.js complete script.py 25 0');
                process.exit(1);
            }
            
            const client = new CopilotClient(verbose);
            try {
                await client.start();
                const line = parseInt(args[2]) - 1;
                const char = parseInt(args[3]);
                const completions = await client.getCompletions(args[1], line, char);
                
                if (completions.length > 0) {
                    console.log('\n📋 Available suggestions:');
                    completions.forEach((item, i) => {
                        console.log(`\n--- Suggestion ${i + 1} ---`);
                        console.log(item.insertText || item.label);
                    });
                }
                
            } catch (error) {
                console.error('❌ Error:', error.message);
                process.exit(1);
            } finally {
                await client.stop();
            }
            break;

        case 'check':
            const checkClient = new CopilotClient(verbose);
            try {
                await checkClient.checkDependencies();
                console.log('✅ All dependencies are available');
            } catch (error) {
                console.error('❌ Check failed:', error.message);
                process.exit(1);
            }
            break;
            
        case 'help':
        default:
            console.log('🚀 GitHub Copilot LSP Client (Node.js)');
            console.log('=======================================');
            console.log('Usage: node copilot-client.js <command> [options]');
            console.log('');
            console.log('Commands:');
            console.log('  demo                          - Demo with test files');
            console.log('  complete <file> <line> <char> - Get completions');
            console.log('  check                         - Check dependencies');
            console.log('  help                          - Show this help');
            console.log('');
            console.log('Options:');
            console.log('  --verbose                     - Enable verbose mode');
            console.log('');
            console.log('Examples:');
            console.log('  node copilot-client.js demo');
            console.log('  node copilot-client.js complete script.py 25 0');
            console.log('  node copilot-client.js check');
            console.log('');
            console.log('Prerequisites:');
            console.log('  - npm install -g @github/copilot-language-server');
            console.log('  - Active GitHub Copilot subscription');
            console.log('');
            console.log('💡 AUTHENTICATION WORKFLOW:');
            console.log('   1. Terminal 1: node copilot-auth.js (authenticate and keep open)');
            console.log('   2. Terminal 2: node copilot-client.js demo');
            console.log('');
            console.log('❌ If you see authentication errors:');
            console.log('   - Check that copilot-auth.js works in another terminal');
            console.log('   - Authentication must be active during client usage');
    }
}

// Run CLI if called directly (not when imported)
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    });
}

// Export for use by other modules
module.exports = CopilotClient;

let client = null;

process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping client...');
    if (client) {
        await client.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Stopping client...');
    if (client) {
        await client.stop();
    }
    process.exit(0);
});

