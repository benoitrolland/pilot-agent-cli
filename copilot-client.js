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

// Create src/core directory if it doesn't exist
const coreDir = path.join(__dirname, 'src', 'core');
if (!fs.existsSync(coreDir)) {
    fs.mkdirSync(coreDir, { recursive: true });
}

// Import FeatureAnalyzer if available, otherwise create inline
let FeatureAnalyzer;
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
    };
}

class CopilotClient {
    constructor(verbose = false) {
        this.process = null;
        this.requestId = 1;
        this.pendingRequests = new Map();
        this.isInitialized = false;
        this.serverPath = null;
        this.verbose = verbose;
        this.featureAnalyzer = new FeatureAnalyzer(verbose);
    }

    log(message, force = false) {
        if (this.verbose || force) {
            console.log(message);
        }
    }

    async checkDependencies() {
        try {
            const { stdout } = await exec('which copilot-language-server');
            let serverPath = stdout.trim();
            this.log(`🔧 Chemin original trouvé: ${serverPath}`);
            
            if (process.platform === 'win32' && serverPath.startsWith('/')) {
                serverPath = serverPath.replace(/^\/([a-zA-Z])\//, '$1:/').replace(/\//g, '\\');
                this.log(`🔧 Chemin converti: ${serverPath}`);
            }
            
            this.serverPath = serverPath;
            this.log(`✅ copilot-language-server trouvé: ${this.serverPath}`);
            
            if (process.platform === 'win32') {
                if (!fs.existsSync(this.serverPath)) {
                    this.log('⚠️  Chemin converti non trouvé, tentative avec where command...');
                    try {
                        const { stdout: whereOutput } = await exec('where copilot-language-server');
                        this.serverPath = whereOutput.trim().split('\n')[0];
                        this.log(`✅ Nouveau chemin trouvé avec where: ${this.serverPath}`);
                    } catch (whereError) {
                        this.log(`❌ where command failed: ${whereError.message}`);
                        const possibleCmdPath = serverPath.replace(/\.js$/, '.cmd');
                        this.log(`🔧 Tentative avec .cmd: ${possibleCmdPath}`);
                        if (fs.existsSync(possibleCmdPath)) {
                            this.serverPath = possibleCmdPath;
                            this.log(`✅ Fichier .cmd trouvé: ${this.serverPath}`);
                        } else {
                            this.log('⚠️  Continuons avec le chemin original malgré l\'absence du fichier');
                        }
                    }
                } else {
                    this.log('✅ Chemin converti vérifié et trouvé');
                }
            }
        } catch (error) {
            console.error('❌ copilot-language-server non trouvé');
            console.log('🔧 Installation requise:');
            console.log('   npm install -g @github/copilot-language-server');
            throw new Error('copilot-language-server non disponible');
        }

        this.log('✅ Dépendances vérifiées - copilot-language-server disponible');
        this.log('💡 Assurez-vous d\'être authentifié avec: node copilot-auth.js');
    }

    async start() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.checkDependencies();
            } catch (error) {
                reject(error);
                return;
            }

            this.log('🚀 Démarrage du serveur Copilot LSP...');
            this.log(`🔧 Chemin du serveur à utiliser: ${this.serverPath}`);
            
            const env = {
                ...process.env,
                NODE_ENV: 'production',
                FORCE_COLOR: '0',
                HOME: process.env.HOME || require('os').homedir(),
                NODE_NO_WARNINGS: '1'
            };
            
            this.log('🔧 Variables d\'environnement configurées:');
            this.log(`   HOME: ${env.HOME}`);
            
            const attempts = [
                // ...existing code...
                () => {
                    this.log('🔧 Tentative 1: Via npx');
                    return spawn('npx', ['copilot-language-server', '--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env,
                        shell: true
                    });
                },
                () => {
                    this.log('🔧 Tentative 2: Nom de commande avec shell');
                    return spawn('copilot-language-server', ['--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env,
                        shell: true
                    });
                },
                () => {
                    this.log('🔧 Tentative 3: Via node direct');
                    return spawn('node', [this.serverPath, '--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env
                    });
                },
                () => {
                    this.log('🔧 Tentative 4: Exécution directe');
                    return spawn(this.serverPath, ['--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env
                    });
                }
            ];

            let lastError = null;
            
            for (let i = 0; i < attempts.length; i++) {
                try {
                    this.process = attempts[i]();
                    
                    await new Promise((resolveWait, rejectWait) => {
                        const timeout = setTimeout(() => {
                            resolveWait();
                        }, 5000);

                        this.process.on('error', (error) => {
                            clearTimeout(timeout);
                            lastError = error;
                            rejectWait(error);
                        });

                        this.process.on('spawn', () => {
                            clearTimeout(timeout);
                            resolveWait();
                        });
                    });

                    this.log('✅ Serveur démarré avec succès');
                    break;
                    
                } catch (error) {
                    this.log(`❌ Tentative ${i + 1} échouée: ${error.message}`);
                    lastError = error;
                    
                    if (this.process) {
                        try {
                            this.process.kill();
                        } catch (e) {
                            // Ignore kill errors
                        }
                        this.process = null;
                    }
                    continue;
                }
            }

            if (!this.process) {
                console.error('❌ Impossible de démarrer le serveur Copilot');
                reject(lastError || new Error('Impossible de démarrer le serveur'));
                return;
            }

            this.process.on('error', (error) => {
                console.error('❌ Erreur du serveur LSP:', error.message);
                reject(error);
            });

            this.process.stderr.on('data', (data) => {
                const message = data.toString().trim();
                if (message && !message.includes('DEP0132') && !message.includes('worker.terminate()')) {
                    this.log(`LSP stderr: ${message}`);
                }
            });

            let buffer = '';
            this.process.stdout.on('data', (data) => {
                buffer += data.toString();
                
                while (true) {
                    const headerEnd = buffer.indexOf('\r\n\r\n');
                    if (headerEnd === -1) break;
                    
                    const header = buffer.substring(0, headerEnd);
                    const contentLengthMatch = header.match(/Content-Length: (\d+)/);
                    
                    if (!contentLengthMatch) {
                        buffer = buffer.substring(headerEnd + 4);
                        continue;
                    }
                    
                    const contentLength = parseInt(contentLengthMatch[1]);
                    const messageStart = headerEnd + 4;
                    
                    if (buffer.length < messageStart + contentLength) break;
                    
                    const messageContent = buffer.substring(messageStart, messageStart + contentLength);
                    buffer = buffer.substring(messageStart + contentLength);
                    
                    try {
                        const message = JSON.parse(messageContent);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('❌ Erreur de parsing JSON:', error);
                        this.log(`Message brut: ${messageContent}`);
                    }
                }
            });

            try {
                await this.initialize();
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async initialize() {
        this.log('🔧 Initialisation du serveur LSP...');
        
        const initParams = {
            // ...existing code...
            processId: process.pid,
            rootUri: `file://${process.cwd().replace(/\\/g, '/')}`,
            capabilities: {
                textDocument: {
                    completion: {
                        completionItem: {
                            snippetSupport: true,
                            commitCharactersSupport: true,
                            documentationFormat: ['markdown', 'plaintext'],
                            resolveSupport: {
                                properties: ['documentation', 'detail', 'additionalTextEdits']
                            }
                        },
                        contextSupport: true,
                        dynamicRegistration: true
                    },
                    synchronization: {
                        dynamicRegistration: true,
                        willSave: true,
                        willSaveWaitUntil: true,
                        didSave: true
                    }
                },
                workspace: {
                    configuration: true,
                    workspaceFolders: true,
                    didChangeConfiguration: {
                        dynamicRegistration: true
                    }
                }
            },
            initializationOptions: {
                editorInfo: {
                    name: "copilot-client",
                    version: "1.0.0"
                },
                editorPluginInfo: {
                    name: "copilot-node-client", 
                    version: "1.0.0"
                }
            },
            workspaceFolders: [{
                uri: `file://${process.cwd().replace(/\\/g, '/')}`,
                name: path.basename(process.cwd())
            }]
        };

        const response = await this.sendRequest('initialize', initParams);
        
        if (response.error) {
            throw new Error(`Erreur d'initialisation: ${response.error.message}`);
        }

        this.log(`🔧 Capacités du serveur: ${JSON.stringify(response.result.capabilities, null, 2)}`);

        this.sendNotification('initialized', {});
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        this.sendNotification('workspace/didChangeConfiguration', {
            settings: {
                "github.copilot": {
                    "enable": {
                        "*": true
                    },
                    "inlineSuggest": {
                        "enable": true
                    }
                }
            }
        });
        
        this.isInitialized = true;
        this.serverCapabilities = response.result.capabilities;
        
        this.log('✅ Serveur LSP initialisé');
        this.log('💡 Authentification gérée par copilot-auth.js');
        return response.result;
    }

    sendRequest(method, params) {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.process.stdin) {
                reject(new Error('Serveur LSP non disponible'));
                return;
            }

            const id = this.requestId++;
            const message = {
                jsonrpc: '2.0',
                id: id,
                method: method,
                params: params
            };

            this.log(`🔧 Envoi de la requête ${method} avec ID ${id}`);
            this.pendingRequests.set(id, { resolve, reject, method });
            this.sendMessage(message);

            let timeout = 30000;
            if (method === 'textDocument/inlineCompletion') {
                timeout = 60000;
            }
            
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Timeout pour la requête ${method} (${timeout/1000}s)`));
                }
            }, timeout);
        });
    }

    sendNotification(method, params) {
        const message = {
            jsonrpc: '2.0',
            method: method,
            params: params
        };
        this.log(`🔧 Envoi de la notification ${method}`);
        this.sendMessage(message);
    }

    sendMessage(message) {
        const content = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
        const fullMessage = header + content;
        
        if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
            try {
                this.process.stdin.write(fullMessage, 'utf8');
                this.log('✅ Message envoyé avec succès');
            } catch (error) {
                console.error('❌ Erreur lors de l\'envoi du message:', error);
            }
        } else {
            console.error('❌ Process stdin non disponible');
        }
    }

    handleMessage(message) {
        this.log(`🔧 Message reçu du serveur LSP: ${JSON.stringify(message, null, 2)}`);
        
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
            const { resolve, method } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);
            
            if (message.error) {
                console.error(`❌ Erreur LSP pour ${method}:`, message.error);
                
                if (message.error.code === 1000 || 
                    message.error.message.includes('Not authenticated') ||
                    message.error.message.includes('not signed into GitHub') ||
                    message.error.message.includes('authentication') ||
                    message.error.message.includes('User not authorized')) {
                    console.error('❌ Erreur d\'authentification détectée!');
                    console.log('💡 Exécutez: node copilot-auth.js pour vous authentifier');
                }
            } else {
                this.log(`✅ Réponse LSP réussie pour ${method}`);
            }
            
            resolve(message);
        } else if (message.method) {
            this.handleServerRequest(message);
        } else {
            this.log(`🔧 Message LSP non géré: ${JSON.stringify(message)}`);
        }
    }

    handleServerRequest(message) {
        switch (message.method) {
            case 'workspace/configuration':
                this.sendConfigurationResponse(message);
                break;
            case 'window/logMessage':
                this.log(`[LSP Log] ${message.params.message}`);
                break;
            case 'window/showMessage':
                this.log(`[LSP Message] ${message.params.message}`);
                break;
            case 'statusNotification':
                this.handleStatusNotification(message.params);
                break;
            case 'didChangeStatus':
                this.handleStatusNotification(message.params);
                break;
            case 'window/showMessageRequest':
                this.handleShowMessageRequest(message);
                break;
            case 'featureFlagsNotification':
                this.handleFeatureFlagsNotification(message.params);
                break;
            case 'conversation/preconditionsNotification':
                this.handlePreconditionsNotification(message.params);
                break;
            default:
                this.log(`🔧 Notification LSP: ${message.method}`);
                break;
        }
    }

    handleFeatureFlagsNotification(params) {
        this.log(`🔧 Feature flags reçus: ${JSON.stringify(params, null, 2)}`);
        
        // Always show feature analysis (not just in verbose mode)
        const analysis = this.featureAnalyzer.analyzeFeatureFlags(params);
        
        // Show implementation suggestions if verbose
        if (this.verbose) {
            const suggestions = this.featureAnalyzer.getImplementationSuggestions();
            if (suggestions.length > 0) {
                console.log('\n🛠️  Implementation Suggestions:');
                suggestions.forEach(suggestion => {
                    console.log(`   ${suggestion.feature}:`);
                    console.log(`      Method: ${suggestion.method}`);
                    console.log(`      Example: ${suggestion.example}`);
                });
            }
        }
    }

    handlePreconditionsNotification(params) {
        this.log(`🔧 Preconditions notification: ${JSON.stringify(params, null, 2)}`);
        this.featureAnalyzer.handlePreconditions(params);
    }

    sendConfigurationResponse(request) {
        this.log('🔧 Réponse à workspace/configuration');
        this.log(`🔧 Items demandés: ${JSON.stringify(request.params.items)}`);
        
        const config = request.params.items.map(item => {
            this.log(`🔧 Configuration pour section: ${item.section}`);
            
            switch (item.section) {
                // ...existing code...
                case 'github.copilot':
                    return {
                        enable: {
                            "*": true
                        },
                        inlineSuggest: {
                            enable: true
                        }
                    };
                    
                case 'github-enterprise':
                case 'github':
                    return {
                        uri: "https://github.com"
                    };
                    
                case 'http':
                    return {
                        proxy: "",
                        proxyStrictSSL: true
                    };
                case 'telemetry':
                    return {
                        enableCrashReporter: false,
                        enableTelemetry: false
                    };
                case 'editor':
                    return {
                        tabSize: 4,
                        insertSpaces: true
                    };
                default:
                    this.log(`🔧 Section non reconnue: ${item.section}`);
                    return {};
            }
        });

        this.log(`🔧 Configuration finale à envoyer: ${JSON.stringify(config, null, 2)}`);

        const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: config
        };

        this.sendMessage(response);
    }

    handleStatusNotification(params) {
        const status = params.status || params.kind;
        const message = params.message;
        
        if (status === 'Error') {
            console.log(`❌ Status: ${status} - ${message}`);
            
            if (message.includes('not signed into GitHub') || 
                message.includes('Invalid copilot token') ||
                message.includes('missing token') ||
                message.includes('User not authorized')) {
                console.log('💡 Erreur d\'authentification détectée');
                console.log('💡 Exécutez: node copilot-auth.js pour vous authentifier');
            }
        } else if (status === 'Normal' || status === 'OK') {
            this.log(`✅ Status: ${status} - ${message}`);
        } else {
            this.log(`ℹ️  Status: ${status} - ${message}`);
        }
    }

    handleShowMessageRequest(request) {
        this.log(`🔧 Message request du serveur: ${request.params.message}`);
        
        const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: null
        };
        
        this.sendMessage(response);
    }

    async openDocument(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Fichier non trouvé: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const languageId = this.getLanguageId(filePath);
        const absolutePath = path.resolve(filePath);
        const uri = `file://${absolutePath.replace(/\\/g, '/')}`;

        this.log(`🔧 Ouverture du document: ${filePath}`);
        this.log(`🔧 URI: ${uri}`);
        this.log(`🔧 Language ID: ${languageId}`);
        this.log(`🔧 Taille du contenu: ${content.length} caractères`);
        this.log(`🔧 Nombre de lignes: ${content.split('\n').length}`);

        this.sendNotification('textDocument/didOpen', {
            textDocument: {
                uri: uri,
                languageId: languageId,
                version: 1,
                text: content
            }
        });

        this.sendNotification('workspace/didChangeWatchedFiles', {
            changes: [{
                uri: uri,
                type: 1
            }]
        });

        this.log('⏳ Attente du traitement du document...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        return uri;
    }

    async getCompletions(filePath, line, character) {
        if (!this.isInitialized) {
            throw new Error('Serveur LSP non initialisé');
        }

        const uri = await this.openDocument(filePath);
        
        this.log(`🔍 Recherche de completions pour ${path.basename(filePath)} à la ligne ${line + 1}, caractère ${character}`);
        this.log(`🔧 URI utilisé: ${uri}`);

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        this.log('🔧 Contexte du fichier:');
        this.log(`   Ligne ${line + 1}: "${lines[line] || ''}"`);
        this.log(`   Position du curseur: ${character}`);
        this.log(`   Caractère à cette position: "${(lines[line] || '')[character] || '<fin de ligne>'}"`);

        this.log('⏳ Attente de traitement du document par le serveur...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        this.log('🔧 Envoi de la requête de completion...');
        
        const completionMethods = [
            // ...existing code...
            {
                name: 'textDocument/inlineCompletion',
                params: {
                    textDocument: { uri: uri },
                    position: { line: line, character: character },
                    context: {
                        triggerKind: 1
                    }
                }
            },
            {
                name: 'getCompletions',
                params: {
                    doc: {
                        uri: uri,
                        version: 1,
                        position: { line: line, character: character }
                    }
                }
            },
            {
                name: 'textDocument/completion',
                params: {
                    textDocument: { uri: uri },
                    position: { line: line, character: character },
                    context: {
                        triggerKind: 1
                    }
                }
            },
            {
                name: 'getCompletionsCycling',
                params: {
                    doc: {
                        uri: uri,
                        version: 1,
                        position: { line: line, character: character }
                    }
                }
            }
        ];

        let response = null;
        let usedMethod = null;
        let lastError = null;

        for (const method of completionMethods) {
            try {
                this.log(`🔧 Essai de la méthode: ${method.name}`);
                this.log(`🔧 Paramètres: ${JSON.stringify(method.params, null, 2)}`);

                response = await this.sendRequest(method.name, method.params);
                
                if (response && !response.error) {
                    usedMethod = method.name;
                    this.log(`✅ Méthode ${method.name} réussie (requête traitée)`);
                    break;
                } else if (response && response.error) {
                    this.log(`❌ Méthode ${method.name} échouée: ${response.error.message}`);
                    lastError = response.error;
                    
                    if (response.error.code === 1000 || 
                        response.error.message.includes('Not authenticated') ||
                        response.error.message.includes('not signed into GitHub') ||
                        response.error.message.includes('authentication') ||
                        response.error.message.includes('User not authorized')) {
                        console.error('❌ Erreur d\'authentification GitHub Copilot détectée!');
                        console.log('💡 Exécutez: node copilot-auth.js pour vous authentifier');
                        throw new Error('Authentification GitHub Copilot requise - exécutez: node copilot-auth.js');
                    }
                    continue;
                }
            } catch (error) {
                this.log(`❌ Erreur avec la méthode ${method.name}: ${error.message}`);
                lastError = error;
                
                if (error.message.includes('Authentification GitHub Copilot requise')) {
                    throw error;
                }
                continue;
            }
        }

        if (!response || response.error) {
            console.error('❌ Toutes les méthodes de completion ont échoué');
            if (lastError) {
                console.error('❌ Dernière erreur:', lastError);
            }
            
            this.log('🔧 Vérification des capacités du serveur...');
            if (this.serverCapabilities) {
                this.log(`🔧 Capacités disponibles: ${JSON.stringify(this.serverCapabilities, null, 2)}`);
            }
            
            return [];
        }

        this.log(`🔧 Réponse brute: ${JSON.stringify(response, null, 2)}`);

        let items = [];
        if (response.result) {
            if (usedMethod === 'textDocument/inlineCompletion') {
                if (Array.isArray(response.result.items)) {
                    items = response.result.items.map(item => ({
                        label: item.insertText || item.text || '',
                        insertText: item.insertText || item.text || '',
                        kind: 1,
                        detail: 'GitHub Copilot'
                    }));
                } else if (response.result.items) {
                    items = [response.result.items].map(item => ({
                        label: item.insertText || item.text || '',
                        insertText: item.insertText || item.text || '',
                        kind: 1,
                        detail: 'GitHub Copilot'
                    }));
                }
            } else if (Array.isArray(response.result)) {
                items = response.result;
            } else if (response.result.items) {
                items = response.result.items;
            } else if (response.result.completions) {
                items = response.result.completions;
            }
        }
        
        if (items.length === 0) {
            console.log('ℹ️  Aucune suggestion Copilot disponible à cette position');
            if (this.verbose) {
                console.log('💡 Raisons possibles:');
                console.log('   - Le contexte actuel ne nécessite pas de suggestion');
                console.log('   - Copilot n\'a pas de suggestion pertinente pour ce code');
                console.log('   - La position du curseur ne permet pas de suggestion');
                console.log('   - Essayez une position différente ou ajoutez plus de contexte');
                console.log('   - Le serveur peut ne pas être correctement authentifié');
                
                console.log('🔧 Debug supplémentaire:');
                console.log(`   - Méthode utilisée: ${usedMethod}`);
                console.log(`   - Type de réponse: ${typeof response.result}`);
                console.log(`   - Contenu de result: ${JSON.stringify(response.result)}`);
            }
            return [];
        }

        console.log(`🤖 ${items.length} suggestion(s) Copilot trouvée(s):`);
        items.forEach((item, index) => {
            const text = item.insertText || item.text || item.label || '';
            const kind = this.getCompletionKindName(item.kind);
            const preview = text.split('\n')[0];
            const hasMoreLines = text.includes('\n');
            
            console.log(`  ${index + 1}. [${kind}] ${preview}${hasMoreLines ? '...' : ''}`);
            
            if (item.detail && this.verbose) {
                console.log(`      Detail: ${item.detail}`);
            }
        });

        return items;
    }

    getLanguageId(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const langMap = {
            '.py': 'python',
            '.js': 'javascript',
            '.mjs': 'javascript',
            '.jsx': 'javascriptreact',
            '.ts': 'typescript',
            '.tsx': 'typescriptreact',
            '.java': 'java',
            '.cpp': 'cpp',
            '.cc': 'cpp',
            '.cxx': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.hpp': 'cpp',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php',
            '.cs': 'csharp',
            '.sh': 'shellscript',
            '.bash': 'shellscript',
            '.zsh': 'shellscript',
            '.fish': 'fish',
            '.html': 'html',
            '.htm': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.sass': 'sass',
            '.less': 'less',
            '.json': 'json',
            '.xml': 'xml',
            '.md': 'markdown',
            '.markdown': 'markdown',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.toml': 'toml',
            '.ini': 'ini',
            '.cfg': 'ini',
            '.conf': 'conf',
            '.dockerfile': 'dockerfile',
            '.sql': 'sql',
            '.r': 'r',
            '.R': 'r',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.scala': 'scala',
            '.clj': 'clojure',
            '.hs': 'haskell',
            '.elm': 'elm',
            '.dart': 'dart',
            '.lua': 'lua',
            '.perl': 'perl',
            '.pl': 'perl'
        };
        return langMap[ext] || 'plaintext';
    }

    getCompletionKindName(kind) {
        const kindMap = {
            1: 'Text', 2: 'Method', 3: 'Function', 4: 'Constructor',
            5: 'Field', 6: 'Variable', 7: 'Class', 8: 'Interface',
            9: 'Module', 10: 'Property', 11: 'Unit', 12: 'Value',
            13: 'Enum', 14: 'Keyword', 15: 'Snippet', 16: 'Color',
            17: 'File', 18: 'Reference', 19: 'Folder', 20: 'EnumMember',
            21: 'Constant', 22: 'Struct', 23: 'Event', 24: 'Operator',
            25: 'TypeParameter'
        };
        return kindMap[kind] || 'Unknown';
    }

    async stop() {
        this.log('🛑 Arrêt du serveur LSP...');
        
        if (this.isInitialized) {
            try {
                await this.sendRequest('shutdown', null);
                this.sendNotification('exit', null);
            } catch (error) {
                this.log(`Erreur lors de l'arrêt propre: ${error.message}`);
            }
        }

        if (this.process && !this.process.killed) {
            try {
                this.process.kill('SIGTERM');
                
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        if (this.process && !this.process.killed) {
                            try {
                                this.process.kill('SIGKILL');
                            } catch (e) {
                                // Ignore errors on force kill
                            }
                        }
                        resolve();
                    }, 5000);
                    
                    if (this.process) {
                        this.process.on('exit', () => {
                            clearTimeout(timeout);
                            resolve();
                        });
                    } else {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            } catch (error) {
                this.log(`Erreur lors de l'arrêt du processus: ${error.message}`);
            }
        }
        
        this.log('✅ Serveur LSP arrêté');
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
    if n <= 1:
        return n
    else:
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