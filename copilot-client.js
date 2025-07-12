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
        // Préparation éventuelle de la connexion Copilot
        if (this.verbose) {
            console.log('🔄 Initialisation du client Copilot...');
        }
        // Rien à faire pour le moment
        return Promise.resolve();
    }

    async stop() {
        // Nettoyage éventuel de la connexion Copilot
        if (this.verbose) {
            console.log('🛑 Arrêt du client Copilot...');
        }
        // Rien à faire pour le moment
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

            // Gestion d'erreur améliorée pour serveur manquant
            copilotProcess.on('error', (err) => {
                if (err.code === 'ENOENT') {
                    reject(new Error('copilot-language-server non disponible. Installez-le avec: npm install -g @github/copilot-language-server'));
                } else {
                    reject(new Error(`Erreur du serveur Copilot: ${err.message}`));
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
        
        // Extraire le contenu du contexte pour l'analyse
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
        // Lecture du contenu du fichier
        const content = fs.readFileSync(filePath, 'utf8');
        // Contexte pour la complétion : contenu + position
        const context = {
            filePath,
            content,
            position: { line, char }
        };
        // Appel des suggestions
        const suggestions = await this.getSuggestions(context);
        // Adapter le format pour compatibilité avec le reste du code
        return suggestions.map(s => ({
            insertText: s.content,
            label: s.description || 'Suggestion Copilot'
        }));
    }

    async checkDependencies() {
        const checks = [];

        // Vérifier copilot-language-server
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

        // Vérifier l'authentification GitHub (si possible)
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

        // Afficher les résultats
        console.log('\n📋 Vérification des dépendances:');
        checks.forEach(check => {
            const icon = check.status === 'OK' ? '✅' : check.status === 'WARNING' ? '⚠️' : '❌';
            console.log(`${icon} ${check.name}: ${check.status}`);
            if (check.solution) {
                console.log(`   💡 Solution: ${check.solution}`);
            }
        });

        const hasErrors = checks.some(check => check.status === 'MISSING');
        if (hasErrors) {
            throw new Error('Des dépendances critiques sont manquantes');
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
    } else {
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

        console.log('📝 Création des fichiers de test...');
        
        for (const testFile of testFiles) {
            try {
                fs.writeFileSync(testFile.name, testFile.content);
                console.log(`\n📄 Test: ${testFile.description}`);
                console.log('Contenu:');
                console.log(testFile.content);
                
                const completions = await client.getCompletions(testFile.name, testFile.line, testFile.char);
                
                if (completions.length > 0) {
                    console.log('\n🎯 Première suggestion:');
                    const first = completions[0];
                    const suggestion = first.insertText || first.label;
                    console.log(suggestion);
                }
                
                console.log('----------------------------------------');
            } catch (error) {
                console.error(`❌ Erreur avec ${testFile.name}: ${error.message}`);
            }
        }
        
        testFiles.forEach(file => {
            try { 
                if (fs.existsSync(file.name)) {
                    fs.unlinkSync(file.name); 
                }
            } catch (e) {
                console.log(`Impossible de supprimer ${file.name}: ${e.message}`);
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur:', error.message);
        if (error.message.includes('copilot-language-server non disponible')) {
            console.log('\n🔧 Instructions d\'installation:');
            console.log('1. Installez le serveur: npm install -g @github/copilot-language-server');
            console.log('2. Vérifiez l\'auth GitHub: gh auth status');
            console.log('3. Si nécessaire: gh auth login');
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
                console.log('Usage: node copilot-client.js complete <fichier> <ligne> <caractère>');
                console.log('Exemple: node copilot-client.js complete script.py 25 0');
                process.exit(1);
            }
            
            const client = new CopilotClient(verbose);
            try {
                await client.start();
                const line = parseInt(args[2]) - 1;
                const char = parseInt(args[3]);
                const completions = await client.getCompletions(args[1], line, char);
                
                if (completions.length > 0) {
                    console.log('\n📋 Suggestions disponibles:');
                    completions.forEach((item, i) => {
                        console.log(`\n--- Suggestion ${i + 1} ---`);
                        console.log(item.insertText || item.label);
                    });
                }
                
            } catch (error) {
                console.error('❌ Erreur:', error.message);
                process.exit(1);
            } finally {
                await client.stop();
            }
            break;

        case 'check':
            const checkClient = new CopilotClient(verbose);
            try {
                await checkClient.checkDependencies();
                console.log('✅ Toutes les dépendances sont disponibles');
            } catch (error) {
                console.error('❌ Vérification échouée:', error.message);
                process.exit(1);
            }
            break;
            
        case 'help':
        default:
            console.log('🚀 Client GitHub Copilot LSP (Node.js)');
            console.log('=====================================');
            console.log('Usage: node copilot-client.js <commande> [options]');
            console.log('');
            console.log('Commandes:');
            console.log('  demo                          - Démonstration avec fichiers de test');
            console.log('  complete <file> <line> <char> - Obtenir des completions');
            console.log('  check                         - Vérifier les dépendances');
            console.log('  help                          - Afficher cette aide');
            console.log('');
            console.log('Options:');
            console.log('  --verbose                     - Activer le mode verbeux');
            console.log('');
            console.log('Exemples:');
            console.log('  node copilot-client.js demo');
            console.log('  node copilot-client.js complete script.py 25 0');
            console.log('  node copilot-client.js check');
            console.log('');
            console.log('Prérequis:');
            console.log('  - npm install -g @github/copilot-language-server');
            console.log('  - Abonnement GitHub Copilot actif');
            console.log('');
            console.log('💡 WORKFLOW D\'AUTHENTIFICATION:');
            console.log('   1. Terminal 1: node copilot-auth.js (authentifiez-vous et laissez ouvert)');
            console.log('   2. Terminal 2: node copilot-client.js demo');
            console.log('');
            console.log('❌ Si vous voyez des erreurs d\'authentification:');
            console.log('   - Vérifiez que copilot-auth.js fonctionne dans un autre terminal');
            console.log('   - L\'authentification doit être active pendant l\'utilisation du client');
    }
}

let client = null;

process.on('SIGINT', async () => {
    console.log('\n🛑 Arrêt du client...');
    if (client) {
        await client.stop();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Arrêt du client...');
    if (client) {
        await client.stop();
    }
    process.exit(0);
});

main().catch((error) => {
    console.error('❌ Erreur fatale:', error.message);
    process.exit(1);
});

