#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

class CopilotClient {
    constructor() {
        this.process = null;
        this.requestId = 1;
        this.pendingRequests = new Map();
        this.isInitialized = false;
        this.serverPath = null;
    }

    async checkDependencies() {
        try {
            // Check if copilot-language-server is available and get its path
            const { stdout } = await exec('which copilot-language-server');
            let serverPath = stdout.trim();
            console.log('🔧 Chemin original trouvé:', serverPath);
            
            // Convert Unix-style path to Windows path if needed
            if (process.platform === 'win32' && serverPath.startsWith('/')) {
                // Convert /c/Users/... to C:/Users/...
                serverPath = serverPath.replace(/^\/([a-zA-Z])\//, '$1:/').replace(/\//g, '\\');
                console.log('🔧 Chemin converti:', serverPath);
            }
            
            this.serverPath = serverPath;
            console.log('✅ copilot-language-server trouvé:', this.serverPath);
            
            // Verify the converted path exists
            if (process.platform === 'win32') {
                if (!fs.existsSync(this.serverPath)) {
                    console.log('⚠️  Chemin converti non trouvé, tentative avec where command...');
                    try {
                        const { stdout: whereOutput } = await exec('where copilot-language-server');
                        this.serverPath = whereOutput.trim().split('\n')[0];
                        console.log('✅ Nouveau chemin trouvé avec where:', this.serverPath);
                    } catch (whereError) {
                        console.log('❌ where command failed:', whereError.message);
                        // Try alternative: look for the .cmd file
                        const possibleCmdPath = serverPath.replace(/\.js$/, '.cmd');
                        console.log('🔧 Tentative avec .cmd:', possibleCmdPath);
                        if (fs.existsSync(possibleCmdPath)) {
                            this.serverPath = possibleCmdPath;
                            console.log('✅ Fichier .cmd trouvé:', this.serverPath);
                        } else {
                            console.log('⚠️  Continuons avec le chemin original malgré l\'absence du fichier');
                        }
                    }
                } else {
                    console.log('✅ Chemin converti vérifié et trouvé');
                }
            }
        } catch (error) {
            console.error('❌ copilot-language-server non trouvé');
            console.log('🔧 Installation requise:');
            console.log('   npm install -g @github/copilot-language-server');
            throw new Error('copilot-language-server non disponible');
        }

        try {
            // Check GitHub authentication
            const { stdout } = await exec('gh auth status');
            console.log('✅ Authentification GitHub CLI OK');
            
            // Get and set GitHub token for Copilot
            try {
                const { stdout: tokenCheck } = await exec('gh auth token');
                const token = tokenCheck.trim();
                if (token) {
                    console.log('✅ Token GitHub CLI disponible');
                    // Set multiple environment variables that Copilot might use
                    process.env.GITHUB_TOKEN = token;
                    process.env.GITHUB_ACCESS_TOKEN = token;
                    process.env.COPILOT_TOKEN = token;
                    
                    // Also try to get user info to verify token validity
                    try {
                        const { stdout: userInfo } = await exec('gh api user');
                        const user = JSON.parse(userInfo);
                        console.log(`✅ Token valide pour l'utilisateur: ${user.login}`);
                        process.env.GITHUB_USER = user.login;
                    } catch (userError) {
                        console.warn('⚠️  Impossible de vérifier les informations utilisateur');
                    }
                } else {
                    console.warn('⚠️  Token GitHub CLI vide');
                    throw new Error('Token GitHub CLI vide');
                }
            } catch (tokenError) {
                console.error('❌ Impossible de récupérer le token GitHub CLI');
                console.log('🔧 Tentative de rafraîchissement du token...');
                try {
                    await exec('gh auth refresh');
                    const { stdout: newToken } = await exec('gh auth token');
                    if (newToken.trim()) {
                        process.env.GITHUB_TOKEN = newToken.trim();
                        process.env.GITHUB_ACCESS_TOKEN = newToken.trim();
                        process.env.COPILOT_TOKEN = newToken.trim();
                        console.log('✅ Token rafraîchi avec succès');
                    } else {
                        throw new Error('Token toujours vide après rafraîchissement');
                    }
                } catch (refreshError) {
                    console.error('❌ Échec du rafraîchissement du token');
                    throw new Error('Token GitHub CLI non disponible - veuillez vous reconnecter');
                }
            }
            
        } catch (error) {
            console.error('❌ Authentification GitHub CLI requise');
            console.log('🔧 Connectez-vous avec:');
            console.log('   gh auth login --scopes "copilot"');
            console.log('   ou si déjà connecté: gh auth refresh');
            throw new Error('Authentification GitHub CLI requise');
        }

        // Vérifier l'accès à Copilot
        try {
           // Check Copilot access
           const { stdout } = await exec('gh api user/copilot/billing');
           console.log('✅ Copilot access OK');
        } catch (error) {
            console.warn(error.stderr)
            if (error.stderr && error.stderr.includes('404')) {
                console.warn('⚠️  Impossible de vérifier l\'accès Copilot (abonnement Business détecté)');
                // Continuer, car Copilot Business ne répond pas à cette API
            } else {
                console.warn('⚠️  Erreur lors de la vérification Copilot - continuons quand même');
                console.log('🔧 Si vous rencontrez des problèmes d\'authentification:');
                console.log('   1. gh auth refresh');
                console.log('   2. gh auth logout && gh auth login --scopes "copilot"');
            }
        }
    }

    async start() {
        return new Promise(async (resolve, reject) => {
            try {
                await this.checkDependencies();
            } catch (error) {
                reject(error);
                return;
            }

            console.log('🚀 Démarrage du serveur Copilot LSP...');
            console.log('🔧 Chemin du serveur à utiliser:', this.serverPath);
            
            // Enhanced environment setup for authentication
            const env = {
                ...process.env,
                // Ensure all possible token variables are set
                GITHUB_TOKEN: process.env.GITHUB_TOKEN,
                GITHUB_ACCESS_TOKEN: process.env.GITHUB_TOKEN,
                COPILOT_TOKEN: process.env.GITHUB_TOKEN,
                // Add any other environment variables that might be needed
                NODE_ENV: 'production',
                // Force authentication method
                GITHUB_COPILOT_AUTH_METHOD: 'token'
            };
            
            // Improved Windows/Cygwin compatibility - avoid shell argument deprecation
            const attempts = [
                // 1. Use npm global command (most reliable)
                () => {
                    console.log('🔧 Tentative 1: Via npx');
                    return spawn('npx', ['copilot-language-server', '--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env,
                        shell: true
                    });
                },
                // 2. Use command name with shell
                () => {
                    console.log('🔧 Tentative 2: Nom de commande avec shell');
                    return spawn('copilot-language-server', ['--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env,
                        shell: true
                    });
                },
                // 3. Use node to run the .js file directly
                () => {
                    console.log('🔧 Tentative 3: Via node direct');
                    return spawn('node', [this.serverPath, '--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env
                    });
                },
                // 4. Use cmd.exe with proper escaping (Windows)
                () => {
                    console.log('🔧 Tentative 4: Via cmd.exe avec échappement');
                    return spawn('cmd', ['/c', '"' + this.serverPath + '"', '--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env
                    });
                },
                // 5. Direct execution without shell (Windows)
                () => {
                    console.log('🔧 Tentative 5: Exécution directe');
                    return spawn(this.serverPath, ['--stdio'], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env
                    });
                },
                // 6. Try PowerShell with proper command
                () => {
                    console.log('🔧 Tentative 6: Via PowerShell');
                    return spawn('powershell', ['-Command', `& "${this.serverPath}" --stdio`], {
                        stdio: ['pipe', 'pipe', 'pipe'],
                        env: env
                    });
                }
            ];

            let lastError = null;
            
            for (let i = 0; i < attempts.length; i++) {
                try {
                    this.process = attempts[i]();
                    
                    // Wait a bit to see if the process starts successfully
                    await new Promise((resolveWait, rejectWait) => {
                        const timeout = setTimeout(() => {
                            resolveWait(); // Success if no immediate error
                        }, 1000);

                        this.process.on('error', (error) => {
                            clearTimeout(timeout);
                            lastError = error;
                            rejectWait(error);
                        });

                        this.process.on('spawn', () => {
                            clearTimeout(timeout);
                            resolveWait(); // Success
                        });
                    });

                    // If we get here, the process started successfully
                    console.log('✅ Serveur démarré avec succès');
                    break;
                    
                } catch (error) {
                    console.log(`❌ Tentative ${i + 1} échouée:`, error.message);
                    lastError = error;
                    
                    if (this.process) {
                        try {
                            this.process.kill();
                        } catch (e) {
                            // Ignore kill errors
                        }
                        this.process = null;
                    }
                    
                    // Try next approach
                    continue;
                }
            }

            if (!this.process) {
                console.error('❌ Toutes les tentatives ont échoué');
                reject(lastError || new Error('Impossible de démarrer le serveur'));
                return;
            }

            this.process.on('error', (error) => {
                console.error('❌ Erreur du serveur LSP:', error.message);
                reject(error);
            });

            this.process.stderr.on('data', (data) => {
                const message = data.toString().trim();
                if (message) {
                    console.log('LSP stderr:', message);
                }
            });

            // Parser les réponses LSP
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
                        console.error('Message brut:', messageContent);
                    }
                }
            });

            // Initialiser le serveur
            try {
                await this.initialize();
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async initialize() {
        console.log('🔧 Initialisation du serveur LSP...');
        
        const initParams = {
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
                },
                // Add authentication information
                authProvider: "github-enterprise",
                github: {
                    token: process.env.GITHUB_TOKEN
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

        console.log('🔧 Capacités du serveur:', JSON.stringify(response.result.capabilities, null, 2));

        // Send initialized notification
        this.sendNotification('initialized', {});
        
        // Send additional configuration for authentication
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
        
        console.log('✅ Serveur LSP initialisé');
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

            console.log(`🔧 Envoi de la requête ${method} avec ID ${id}`);
            console.log('🔧 Message JSON:', JSON.stringify(message, null, 2));

            this.pendingRequests.set(id, { resolve, reject, method });
            this.sendMessage(message);

            // Timeout plus long pour les requêtes de completion
            const timeout = method === 'textDocument/completion' ? 60000 : 30000;
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
        console.log(`🔧 Envoi de la notification ${method}`);
        this.sendMessage(message);
    }

    sendMessage(message) {
        const content = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
        const fullMessage = header + content;
        
        console.log('🔧 Message LSP complet à envoyer:');
        console.log('Header:', JSON.stringify(header));
        console.log('Content:', content);
        console.log('Full message length:', fullMessage.length);
        
        if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
            try {
                this.process.stdin.write(fullMessage, 'utf8');
                console.log('✅ Message envoyé avec succès');
            } catch (error) {
                console.error('❌ Erreur lors de l\'envoi du message:', error);
            }
        } else {
            console.error('❌ Process stdin non disponible');
        }
    }

    handleMessage(message) {
        console.log('🔧 Message reçu du serveur LSP:', JSON.stringify(message, null, 2));
        
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
            const { resolve, method } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);
            
            if (message.error) {
                console.error(`❌ Erreur LSP pour ${method}:`, message.error);
            } else {
                console.log(`✅ Réponse LSP réussie pour ${method}`);
            }
            
            resolve(message);
        } else if (message.method) {
            // Gérer les notifications et requêtes du serveur
            this.handleServerRequest(message);
        } else {
            console.log('🔧 Message LSP non géré:', message);
        }
    }

    handleServerRequest(message) {
        switch (message.method) {
            case 'workspace/configuration':
                // Répondre à la demande de configuration
                this.sendConfigurationResponse(message);
                break;
            case 'window/logMessage':
                console.log(`[LSP Log] ${message.params.message}`);
                break;
            case 'window/showMessage':
                console.log(`[LSP Message] ${message.params.message}`);
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
            default:
                console.log(`🔧 Notification LSP: ${message.method}`);
                break;
        }
    }

    sendConfigurationResponse(request) {
        console.log('🔧 Réponse à workspace/configuration');
        
        // Configuration par défaut pour GitHub Copilot avec authentification
        const config = request.params.items.map(item => {
            switch (item.section) {
                case 'github.copilot':
                    return {
                        enable: {
                            "*": true
                        },
                        advanced: {
                            debug: {
                                overrideEngine: "",
                                testOverrideProxyUrl: "",
                                overrideProxyUrl: ""
                            }
                        },
                        inlineSuggest: {
                            enable: true
                        },
                        authProvider: "github-enterprise"
                    };
                case 'github-enterprise':
                    return {
                        uri: "https://github.com",
                        token: process.env.GITHUB_TOKEN
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
                default:
                    return {};
            }
        });

        const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: config
        };

        this.sendMessage(response);
    }

    handleStatusNotification(params) {
        console.log(`🔧 Status: ${params.status || params.kind} - ${params.message}`);
        
        if ((params.status === 'Error' || params.kind === 'Error') && 
            params.message.includes('not signed into GitHub')) {
            console.error('❌ Erreur d\'authentification GitHub Copilot détectée!');
            console.log('🔧 Solutions recommandées:');
            console.log('1. Vérifiez votre token: gh auth token');
            console.log('2. Rafraîchissez: gh auth refresh');
            console.log('3. Reconnectez-vous: gh auth logout && gh auth login --scopes "copilot"');
            console.log('4. Redémarrez ce script après la reconnexion');
        }
    }

    handleShowMessageRequest(request) {
        console.log('🔧 Message request du serveur:', request.params.message);
        
        // Respond to the message request
        const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: null // or the selected action
        };
        
        this.sendMessage(response);
    }

    async initiateCopilotAuth() {
        console.log('🔑 Démarrage de l\'authentification GitHub Copilot...');
        
        try {
            // First try to refresh the token
            console.log('🔧 Tentative de rafraîchissement du token GitHub...');
            await exec('gh auth refresh');
            
            // Get the refreshed token
            const { stdout: newToken } = await exec('gh auth token');
            if (newToken.trim()) {
                process.env.GITHUB_TOKEN = newToken.trim();
                process.env.GITHUB_ACCESS_TOKEN = newToken.trim();
                process.env.COPILOT_TOKEN = newToken.trim();
                console.log('✅ Token rafraîchi et mis à jour');
                
                // Send updated configuration to the server
                this.sendNotification('workspace/didChangeConfiguration', {
                    settings: {
                        "github-enterprise": {
                            uri: "https://github.com",
                            token: process.env.GITHUB_TOKEN
                        }
                    }
                });
                
                return;
            }
        } catch (error) {
            console.log('❌ Échec du rafraîchissement automatique:', error.message);
        }
        
        console.log('🔧 Action manuelle requise:');
        console.log('1. Exécutez: gh auth logout');
        console.log('2. Puis: gh auth login --scopes "copilot"');
        console.log('3. Redémarrez ce script');
        console.log('4. Ou si vous utilisez Copilot Business, contactez votre administrateur');
    }

    async openDocument(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Fichier non trouvé: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const languageId = this.getLanguageId(filePath);
        const absolutePath = path.resolve(filePath);
        const uri = `file://${absolutePath.replace(/\\/g, '/')}`;

        console.log(`🔧 Ouverture du document: ${filePath}`);
        console.log(`🔧 URI: ${uri}`);
        console.log(`🔧 Language ID: ${languageId}`);

        this.sendNotification('textDocument/didOpen', {
            textDocument: {
                uri: uri,
                languageId: languageId,
                version: 1,
                text: content
            }
        });

        // Attendre un peu pour que le serveur traite le document
        await new Promise(resolve => setTimeout(resolve, 1000));

        return uri;
    }

    async getCompletions(filePath, line, character) {
        if (!this.isInitialized) {
            throw new Error('Serveur LSP non initialisé');
        }

        const uri = await this.openDocument(filePath);
        
        console.log(`🔍 Recherche de completions pour ${path.basename(filePath)} à la ligne ${line + 1}, caractère ${character}`);
        console.log(`🔧 URI utilisé: ${uri}`);

        // Wait a bit more for the server to be ready after opening document
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if we need authentication first
        console.log('🔧 Vérification de l\'état d\'authentification...');
        
        // Try different completion methods for Copilot
        const completionMethods = [
            'textDocument/inlineCompletion',  // GitHub Copilot specific
            // 'getCompletions',                 // Alternative Copilot method
            // 'textDocument/completion',        // Standard LSP
            // 'copilot/getCompletions'          // Another possible method
        ];

        let response = null;
        let usedMethod = null;
        let authError = false;

        for (const method of completionMethods) {
            try {
                console.log(`🔧 Essai de la méthode: ${method}`);
                
                let completionParams;
                if (method === 'textDocument/inlineCompletion') {
                    completionParams = {
                        textDocument: { uri: uri },
                        position: { line: line, character: character },
                        context: {
                            triggerKind: 1 // Invoked
                        }
                    };
                } else if (method === 'getCompletions') {
                    completionParams = {
                        doc: {
                            uri: uri,
                            version: 1,
                            position: { line: line, character: character }
                        }
                    };
                } else {
                    completionParams = {
                        textDocument: { uri: uri },
                        position: { line: line, character: character },
                        context: {
                            triggerKind: 1 // Invoked
                        }
                    };
                }

                console.log(`🔧 Paramètres pour ${method}:`, JSON.stringify(completionParams, null, 2));

                response = await this.sendRequest(method, completionParams);
                
                if (response && !response.error) {
                    usedMethod = method;
                    console.log(`✅ Méthode ${method} réussie`);
                    break;
                } else if (response && response.error) {
                    console.log(`❌ Méthode ${method} échouée:`, response.error.message);
                    
                    // Check for authentication errors specifically
                    if (response.error.code === 1000 || 
                        (response.error.message && response.error.message.includes('Not authenticated'))) {
                        console.error('❌ Erreur d\'authentification GitHub Copilot détectée dans la réponse!');
                        authError = true;
                    }
                }
            } catch (error) {
                console.log(`❌ Erreur avec la méthode ${method}:`, error.message);
                continue;
            }
        }

        if (authError) {
            console.error('❌ Problème d\'authentification détecté!');
            console.log('🔧 Solutions possibles:');
            console.log('1. Redémarrez votre terminal et relancez le script');
            console.log('2. Exécutez: gh auth refresh');
            console.log('3. Reconnectez-vous: gh auth logout && gh auth login --scopes "copilot"');
            console.log('4. Vérifiez votre abonnement Copilot sur https://github.com/settings/copilot');
            console.log('5. Si vous utilisez Copilot Business, contactez votre administrateur');
            
            // Try to initiate authentication
            await this.initiateCopilotAuth();
            
            throw new Error('Authentification GitHub Copilot requise - veuillez suivre les instructions ci-dessus');
        }

        if (!response || response.error) {
            console.error('❌ Toutes les méthodes de completion ont échoué');
            if (response && response.error) {
                console.error('❌ Dernière erreur:', response.error);
            }
            return [];
        }

        console.log(`✅ Completion réussie avec la méthode: ${usedMethod}`);
        console.log('🔧 Réponse brute:', JSON.stringify(response, null, 2));

        // Gérer les différents formats de réponse selon la méthode
        let items = [];
        if (response.result) {
            if (usedMethod === 'textDocument/inlineCompletion') {
                // Format pour inlineCompletion
                if (Array.isArray(response.result.items)) {
                    items = response.result.items.map(item => ({
                        label: item.insertText || item.text || '',
                        insertText: item.insertText || item.text || '',
                        kind: 1, // Text kind
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
            console.log('ℹ️  Aucune suggestion Copilot disponible');
            return [];
        }

        console.log(`🤖 ${items.length} suggestion(s) Copilot trouvée(s):`);
        items.forEach((item, index) => {
            const text = item.insertText || item.text || item.label || '';
            const kind = this.getCompletionKindName(item.kind);
            const preview = text.split('\n')[0];
            const hasMoreLines = text.includes('\n');
            
            console.log(`  ${index + 1}. [${kind}] ${preview}${hasMoreLines ? '...' : ''}`);
            
            if (item.detail) {
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
        console.log('🛑 Arrêt du serveur LSP...');
        
        // Envoyer shutdown request
        if (this.isInitialized) {
            try {
                await this.sendRequest('shutdown', null);
                this.sendNotification('exit', null);
            } catch (error) {
                console.log('Erreur lors de l\'arrêt propre:', error.message);
            }
        }

        if (this.process && !this.process.killed) {
            this.process.kill('SIGTERM');
            
            // Forcer l'arrêt après 2 secondes
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.process.kill('SIGKILL');
                }
            }, 2000);
        }
        
        console.log('✅ Serveur LSP arrêté');
    }
}

// Fonction de démonstration
async function demo() {
    const client = new CopilotClient();
    
    try {
        await client.start();
        
        // Créer des fichiers de test plus réalistes
        const testFiles = [
            {
                name: path.join(__dirname, 'test_fibonacci.py'),
                content: `def fibonacci(n):
    """Calculate fibonacci number recursively"""
    if (n <= 1:
        return n
    # Add recursive implementation here
    `,
                line: 4,
                char: 4
            },
            {
                name: path.join(__dirname, 'test_quicksort.js'),
                content: `function quicksort(arr) {
    if (arr.length <= 1) {
        return arr;
    }
    const pivot = arr[0];
    // Implement partitioning logic
    `,
                line: 5,
                char: 4
            },
            {
                name: path.join(__dirname, 'test_react.jsx'),
                content: `import React, { useState } from 'react';

function TodoApp() {
    const [todos, setTodos] = useState([]);
    
    // Add function to handle new todo
    `,
                line: 5,
                char: 4
            }
        ];

        console.log('📝 Création des fichiers de test...');
        
        for (const testFile of testFiles) {
            try {
                fs.writeFileSync(testFile.name, testFile.content);
                console.log(`\n📄 Test: ${path.basename(testFile.name)}`);
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
                console.error(`❌ Erreur avec ${testFile.name}:`, error.message);
            }
        }
        
        // Nettoyer les fichiers de test
        testFiles.forEach(file => {
            try { 
                if (fs.existsSync(file.name)) {
                    fs.unlinkSync(file.name); 
                }
            } catch (e) {
                console.log(`Impossible de supprimer ${file.name}:`, e.message);
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

// Interface CLI améliorée
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    switch (command) {
        case 'demo':
            await demo();
            break;
            
        case 'complete':
            if (args.length < 4) {
                console.log('Usage: node copilot-client.js complete <fichier> <ligne> <caractère>');
                console.log('Exemple: node copilot-client.js complete script.py 25 0');
                process.exit(1);
            }
            
            const client = new CopilotClient();
            try {
                await client.start();
                const line = parseInt(args[2]) - 1; // Convertir en index 0
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
            const checkClient = new CopilotClient();
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
            console.log('Exemples:');
            console.log('  node copilot-client.js demo');
            console.log('  node copilot-client.js complete script.py 25 0');
            console.log('  node copilot-client.js check');
            console.log('');
            console.log('Prérequis:');
            console.log('  - npm install -g @github/copilot-language-server');
            console.log('  - gh auth login (authentification GitHub)');
            console.log('  - Abonnement GitHub Copilot actif');
    }
}

// Gestion propre de l'arrêt
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