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
        
        // Try to authenticate with Copilot after initialization
        await this.authenticateWithCopilot();
        
        console.log('✅ Serveur LSP initialisé');
        return response.result;
    }

    async authenticateWithCopilot() {
        console.log('🔑 Tentative d\'authentification avec GitHub Copilot...');
        
        try {
            // Try to check if already signed in
            const statusResponse = await this.sendRequest('checkStatus', {});
            console.log('🔧 Status initial:', statusResponse);
            
            if (statusResponse.result && statusResponse.result.status === 'OK') {
                console.log('✅ Déjà authentifié avec Copilot');
                return;
            }
        } catch (error) {
            console.log('🔧 Vérification du status échouée, continuons...');
        }

        try {
            // Try to sign in with existing token
            console.log('🔧 Tentative de connexion avec le token GitHub existant...');
            const signInResponse = await this.sendRequest('signInInitiate', {});
            console.log('🔧 Réponse signInInitiate:', signInResponse);
            
            if (signInResponse.result) {
                // Follow the device flow if needed
                await this.handleDeviceFlow(signInResponse.result);
            }
        } catch (error) {
            console.log('❌ Échec de l\'authentification automatique:', error.message);
            
            // Try alternative authentication methods
            await this.tryAlternativeAuth();
        }
    }

    async handleDeviceFlow(deviceFlowData) {
        if (deviceFlowData.verificationUri && deviceFlowData.userCode) {
            console.log('🔗 Authentification requise:');
            console.log(`   1. Ouvrez: ${deviceFlowData.verificationUri}`);
            console.log(`   2. Entrez le code: ${deviceFlowData.userCode}`);
            console.log('   3. Attendez la confirmation...');
            
            // Poll for completion
            const interval = deviceFlowData.interval || 5;
            const maxAttempts = 60; // 5 minutes max
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                await new Promise(resolve => setTimeout(resolve, interval * 1000));
                
                try {
                    const confirmResponse = await this.sendRequest('signInConfirm', {
                        userCode: deviceFlowData.userCode
                    });
                    
                    if (confirmResponse.result && confirmResponse.result.status === 'OK') {
                        console.log('✅ Authentification Copilot réussie!');
                        return;
                    }
                } catch (error) {
                    // Continue polling
                    if (attempt % 6 === 0) { // Show progress every 30 seconds
                        console.log(`🔧 En attente de l'authentification... (${attempt * interval}s)`);
                    }
                }
            }
            
            throw new Error('Timeout d\'authentification Copilot');
        }
    }

    async tryAlternativeAuth() {
        console.log('🔧 Tentative de méthodes d\'authentification alternatives...');
        
        // Method 1: Try with GitHub CLI token directly
        if (process.env.GITHUB_TOKEN) {
            try {
                console.log('🔧 Tentative avec le token GitHub CLI...');
                const tokenResponse = await this.sendRequest('setEditorInfo', {
                    editorInfo: {
                        name: "copilot-client",
                        version: "1.0.0"
                    },
                    editorPluginInfo: {
                        name: "copilot-node-client", 
                        version: "1.0.0"
                    },
                    authProvider: "github-enterprise",
                    github: {
                        token: process.env.GITHUB_TOKEN
                    }
                });
                
                if (tokenResponse && !tokenResponse.error) {
                    console.log('✅ Authentification par token réussie');
                    return;
                }
            } catch (error) {
                console.log('❌ Échec de l\'authentification par token:', error.message);
            }
        }

        // Method 2: Try to use GitHub CLI authentication
        try {
            console.log('🔧 Tentative d\'utilisation de l\'authentification GitHub CLI...');
            
            // Get GitHub user info to verify CLI auth
            const { stdout: userInfo } = await exec('gh api user');
            const user = JSON.parse(userInfo);
            
            // Try to transfer CLI auth to Copilot
            const authTransferResponse = await this.sendRequest('github/copilot/signInWithGitHubToken', {
                token: process.env.GITHUB_TOKEN,
                user: user.login
            });
            
            if (authTransferResponse && !authTransferResponse.error) {
               