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
            // Check GitHub authentication with more detailed validation
            console.log('🔧 Vérification de l\'authentification GitHub CLI...');
            const { stdout, stderr } = await exec('gh auth status', { encoding: 'utf8' });
            console.log('✅ Authentification GitHub CLI OK');
            console.log('GitHub CLI status:', stdout);
            
            // Get and validate GitHub token for Copilot
            try {
                const { stdout: tokenOutput } = await exec('gh auth token');
                let token = tokenOutput.trim();
                
                if (!token) {
                    throw new Error('Token vide');
                }
                
                console.log('✅ Token GitHub CLI disponible (longueur:', token.length, ')');
                console.log('🔧 Début du token:', token.substring(0, 8) + '...');
                
                // Validate token format and potentially convert it
                if (token.startsWith('gho_')) {
                    console.log('✅ Token OAuth détecté');
                } else if (token.startsWith('ghp_')) {
                    console.log('✅ Token Personal Access détecté');
                } else if (token.startsWith('github_pat_')) {
                    console.log('✅ Token PAT Fine-grained détecté');
                } else if (token.startsWith('ghs_')) {
                    console.log('✅ Token Server-to-server détecté');
                } else {
                    console.warn('⚠️  Format de token non reconnu, continuons quand même');
                }
                
                // Store the original token
                this.githubToken = token;
                
                // Set comprehensive environment variables for all possible authentication methods
                process.env.GITHUB_TOKEN = token;
                process.env.GITHUB_ACCESS_TOKEN = token;
                process.env.COPILOT_TOKEN = token;
                process.env.GH_TOKEN = token;
                process.env.GITHUB_COPILOT_TOKEN = token;
                
                // Also try to get user info to verify token validity
                try {
                    const { stdout: userInfo } = await exec('gh api user');
                    const user = JSON.parse(userInfo);
                    console.log(`✅ Token valide pour l'utilisateur: ${user.login}`);
                    process.env.GITHUB_USER = user.login;
                    process.env.GITHUB_LOGIN = user.login;
                    this.githubUser = user.login;
                } catch (userError) {
                    console.warn('⚠️  Impossible de vérifier les informations utilisateur:', userError.message);
                    // Try alternative user info method
                    try {
                        const { stdout: altUserInfo } = await exec('gh api user --jq .login');
                        const login = altUserInfo.trim();
                        if (login) {
                            console.log(`✅ Login utilisateur récupéré: ${login}`);
                            process.env.GITHUB_USER = login;
                            process.env.GITHUB_LOGIN = login;
                            this.githubUser = login;
                        }
                    } catch (altError) {
                        console.warn('⚠️  Méthode alternative échouée aussi');
                    }
                }
                
                // Test Copilot API access directly with the token
                try {
                    console.log('🔧 Test direct de l\'API Copilot...');
                    const testResult = await exec(`gh api -H "Authorization: Bearer ${token}" -H "Accept: application/vnd.github+json" user/copilot/billing`);
                    console.log('✅ Test API Copilot réussi');
                } catch (testError) {
                    console.warn('⚠️  Test API Copilot échoué:', testError.message);
                    if (testError.stderr && testError.stderr.includes('404')) {
                        console.log('ℹ️  404 peut indiquer Copilot Business (normal)');
                    }
                }
                
            } catch (tokenError) {
                console.error('❌ Impossible de récupérer le token GitHub CLI:', tokenError.message);
                console.log('🔧 Tentative de rafraîchissement du token...');
                
                try {
                    // Force refresh with all scopes
                    await exec('gh auth refresh --scopes "read:user,user:email,repo,workflow,copilot"');
                    console.log('✅ Tentative de rafraîchissement terminée');
                    
                    // Retry getting token
                    const { stdout: newTokenOutput } = await exec('gh auth token');
                    const newToken = newTokenOutput.trim();
                    
                    if (!newToken) {
                        throw new Error('Token toujours vide après rafraîchissement');
                    }
                    
                    // Store and set all environment variables again
                    this.githubToken = newToken;
                    process.env.GITHUB_TOKEN = newToken;
                    process.env.GITHUB_ACCESS_TOKEN = newToken;
                    process.env.COPILOT_TOKEN = newToken;
                    process.env.GH_TOKEN = newToken;
                    process.env.GITHUB_COPILOT_TOKEN = newToken;
                    
                    console.log('✅ Token rafraîchi avec succès (longueur:', newToken.length, ')');
                } catch (refreshError) {
                    console.error('❌ Échec du rafraîchissement du token:', refreshError.message);
                    throw new Error('Token GitHub CLI non disponible - authentification requise');
                }
            }
            
        } catch (error) {
            console.error('❌ Authentification GitHub CLI requise');
            console.log('🔧 Connectez-vous avec toutes les permissions:');
            console.log('   gh auth logout');
            console.log('   gh auth login --scopes "read:user,user:email,repo,workflow,copilot"');
            console.log('   ou si déjà connecté: gh auth refresh --scopes "read:user,user:email,repo,workflow,copilot"');
            throw new Error('Authentification GitHub CLI requise');
        }

        // Vérifier l'accès à Copilot avec validation améliorée
        try {
           console.log('🔧 Vérification de l\'accès GitHub Copilot...');
           const { stdout } = await exec('gh api user/copilot/billing');
           const billing = JSON.parse(stdout);
           console.log('✅ Copilot access OK - Plan:', billing.plan || 'unknown');
        } catch (error) {
            console.warn('⚠️  Erreur lors de la vérification Copilot:', error.message);
            if (error.stderr && error.stderr.includes('404')) {
                console.warn('⚠️  API billing non disponible (possiblement Copilot Business)');
                
                // Try alternative Copilot validation
                try {
                    await exec('gh api user/copilot/licenses');
                    console.log('✅ Accès Copilot confirmé via API licenses');
                } catch (licenseError) {
                    console.warn('⚠️  API licenses aussi inaccessible - continuons quand même');
                }
            } else {
                console.warn('⚠️  Vérification Copilot échouée - continuons quand même');
                console.log('🔧 Si vous rencontrez des problèmes:');
                console.log('   1. Vérifiez votre abonnement: https://github.com/settings/copilot');
                console.log('   2. Rafraîchissez: gh auth refresh --scopes "copilot"');
                console.log('   3. Reconnectez-vous avec les bons scopes');
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
            
            // Enhanced environment setup with all possible authentication variables
            const env = {
                ...process.env,
                // Core GitHub tokens
                GITHUB_TOKEN: process.env.GITHUB_TOKEN,
                GITHUB_ACCESS_TOKEN: process.env.GITHUB_TOKEN, // Fix typo: was GITHUB_ACCESS_TOKEN_TOKEN
                GH_TOKEN: process.env.GITHUB_TOKEN,
                
                // Copilot-specific tokens
                COPILOT_TOKEN: process.env.GITHUB_TOKEN,
                GITHUB_COPILOT_TOKEN: process.env.GITHUB_TOKEN,
                
                // User information
                GITHUB_USER: process.env.GITHUB_USER,
                GITHUB_LOGIN: process.env.GITHUB_LOGIN,
                
                // Authentication method hints
                GITHUB_COPILOT_AUTH_METHOD: 'token',
                GITHUB_COPILOT_AUTH_PROVIDER: 'github',
                
                // Force specific behavior
                NODE_ENV: 'production',
                FORCE_COLOR: '0',
                
                // Additional environment hints that might help
                XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || path.join(require('os').homedir(), '.config'),
                HOME: process.env.HOME || require('os').homedir()
            };
            
            // Log environment variables (without showing token values)
            console.log('🔧 Variables d\'environnement configurées:');
            console.log('   GITHUB_TOKEN:', env.GITHUB_TOKEN ? `[${env.GITHUB_TOKEN.length} chars]` : 'undefined');
            console.log('   GITHUB_USER:', env.GITHUB_USER || 'undefined');
            console.log('   HOME:', env.HOME);
            
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
                // Remove direct token passing from initialization
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
        
        // Wait a bit before sending configuration
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Send Copilot-specific authentication through signInInitiate
        console.log('🔧 Initiation de l\'authentification Copilot...');
        try {
            await this.initiateCopilotSignIn();
        } catch (authError) {
            console.warn('⚠️  Erreur lors de l\'authentification Copilot:', authError.message);
        }
        
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

    async initiateCopilotSignIn() {
        console.log('🔑 Initiation de la connexion GitHub Copilot...');
        
        try {
            // Method 1: Try signInInitiate (Copilot-specific authentication)
            const signInResponse = await this.sendRequest('signInInitiate', {
                dummy: 'value'
            });
            
            if (signInResponse && !signInResponse.error) {
                console.log('✅ signInInitiate réussi');
                
                // If we have a verification URI and user code, show them
                if (signInResponse.result && signInResponse.result.verificationUri) {
                    console.log('\n🔗 AUTHENTIFICATION GITHUB COPILOT REQUISE 🔗');
                    console.log('═'.repeat(60));
                    console.log('🌐 Ouvrez cette URL dans votre navigateur:');
                    console.log(`   ${signInResponse.result.verificationUri}`);
                    console.log('');
                    console.log('🔑 Saisissez ce code sur la page GitHub:');
                    console.log(`   ${signInResponse.result.userCode}`);
                    console.log('');
                    console.log(`⏱️  Code valide pendant: ${Math.floor(signInResponse.result.expiresIn / 60)} minutes`);
                    console.log('');
                    console.log('📋 Étapes à suivre:');
                    console.log('   1. Cliquez sur le lien ci-dessus ou copiez-le dans votre navigateur');
                    console.log('   2. Connectez-vous à GitHub si nécessaire');
                    console.log('   3. Saisissez le code utilisateur affiché ci-dessus');
                    console.log('   4. Autorisez l\'accès à GitHub Copilot');
                    console.log('   5. Revenez à ce terminal - l\'authentification se poursuivra automatiquement');
                    console.log('═'.repeat(60));
                    console.log('⏳ Attente de votre authentification...');
                    console.log('');
                    
                    // Poll for authentication completion with retry logic
                    let authResult = null;
                    let retryCount = 0;
                    const maxRetries = 3;
                    
                    while (retryCount < maxRetries) {
                        try {
                            authResult = await this.pollForAuthentication(
                                signInResponse.result.userCode, 
                                signInResponse.result.interval || 5, 
                                signInResponse.result.expiresIn
                            );
                            
                            // If we get a restart result, it means a new flow was initiated
                            if (authResult && authResult.status === 'Restarted') {
                                console.log('✅ Authentification redémarrée avec succès');
                                break;
                            } else if (authResult) {
                                console.log('✅ Authentification terminée avec succès');
                                break;
                            }
                        } catch (pollError) {
                            retryCount++;
                            console.error(`❌ Tentative ${retryCount}/${maxRetries} échouée:`, pollError.message);
                            
                            if (retryCount >= maxRetries) {
                                console.error('❌ Toutes les tentatives d\'authentification ont échoué');
                                throw pollError;
                            } else {
                                console.log('🔄 Nouvelle tentative dans 5 secondes...');
                                await new Promise(resolve => setTimeout(resolve, 5000));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.isPolling = false;
            console.log('ℹ️  signInInitiate non disponible ou échoué:', error.message);
            
            // Method 2: Try setEditorInfo with authentication (remove authProvider parameter)
            try {
                await this.sendRequest('setEditorInfo', {
                    editorInfo: {
                        name: "copilot-client",
                        version: "1.0.0"
                    },
                    editorPluginInfo: {
                        name: "copilot-node-client",
                        version: "1.0.0"
                    }
                    // Remove authProvider and githubToken - these are not supported
                });
                console.log('✅ setEditorInfo envoyé');
            } catch (setEditorError) {
                console.log('ℹ️  setEditorInfo échoué:', setEditorError.message);
            }
            
            // Method 3: Try checkStatus to see if we're already authenticated
            try {
                const statusResponse = await this.sendRequest('checkStatus', {
                    dummy: 'value'
                });
                
                if (statusResponse && statusResponse.result) {
                    console.log('🔧 Status Copilot:', statusResponse.result);
                    
                    // If already authenticated, great!
                    if (statusResponse.result.status === 'OK' || 
                        statusResponse.result.status === 'Authorized' ||
                        statusResponse.result.status === 'SignedIn' ||
                        statusResponse.result.status === 'AlreadySignedIn') {
                        console.log('✅ Authentification déjà active détectée!');
                        this.authenticationFailed = false;
                    }
                }
            } catch (statusError) {
                console.log('ℹ️  checkStatus échoué:', statusError.message);
            }
        } finally {
            this.isPolling = false;
        }
    }

    async pollForAuthentication(userCode, interval = 5, expiresIn = 900) {
        const maxAttempts = Math.floor(expiresIn / interval);
        let attempts = 0;
        let consecutiveErrors = 0;
        let lastSuccessfulCheck = Date.now();
        
        console.log(`🔄 Polling d'authentification toutes les ${interval} secondes (max ${maxAttempts} tentatives)...`);
        
        // Set polling flag to reduce log noise
        this.isPolling = true;
        
        return new Promise((resolve, reject) => {
            const poll = async () => {
                attempts++;
                
                try {
                    console.log(`🔄 Tentative ${attempts}/${maxAttempts} - Vérification de l'authentification...`);
                    
                    // Check if we should stop polling
                    if (attempts > maxAttempts) {
                        console.log('❌ Timeout d\'authentification atteint');
                        this.isPolling = false;
                        clearInterval(pollInterval);
                        clearInterval(fastStatusChecker);
                        reject(new Error('Timeout d\'authentification'));
                        return;
                    }
                    
                    // Show reminder every 10 attempts (approximately every 50 seconds)
                    if (attempts % 10 === 0) {
                        console.log('\n💡 RAPPEL: Authentification en attente');
                        console.log('   🌐 Ouvrez: https://github.com/login/device');
                        console.log(`   🔑 Code: ${userCode}`);
                        console.log('   ⏳ En attente de votre autorisation...\n');
                    }
                    
                    // Always check status first - this is more reliable for detecting success
                    try {
                        const statusResponse = await this.sendRequest('checkStatus', {
                            dummy: 'value'
                        });
                        
                        if (statusResponse && statusResponse.result) {
                            const status = statusResponse.result.status;
                            if (status === 'OK' || status === 'Authorized' || status === 'SignedIn' || status === 'AlreadySignedIn') {
                                console.log('\n✅ AUTHENTIFICATION DÉTECTÉE VIA STATUS CHECK! 🎉');
                                console.log('🔐 GitHub Copilot est maintenant connecté');
                                this.isPolling = false;
                                clearInterval(pollInterval);
                                clearInterval(fastStatusChecker);
                                this.authenticationFailed = false;
                                
                                // Send authentication refresh notifications
                                console.log('🔧 Actualisation de l\'état d\'authentification du serveur...');
                                await this.refreshServerAuthentication();
                                
                                resolve(statusResponse.result);
                                return;
                            }
                        }
                    } catch (statusError) {
                        // Status check failed, continue with signInConfirm
                    }
                    
                    // Try to confirm the sign-in
                    const confirmResponse = await this.sendRequest('signInConfirm', {
                        userCode: userCode
                    });
                    
                    if (confirmResponse && !confirmResponse.error) {
                        // Reset consecutive errors counter on successful response
                        consecutiveErrors = 0;
                        lastSuccessfulCheck = Date.now();
                        
                        // Check the result status
                        if (confirmResponse.result && confirmResponse.result.status) {
                            const status = confirmResponse.result.status;
                            
                            if (status === 'OK' || status === 'Authorized' || status === 'SignedIn') {
                                console.log('\n✅ AUTHENTIFICATION RÉUSSIE VIA SIGNIN CONFIRM! 🎉');
                                console.log('🔐 GitHub Copilot est maintenant connecté');
                                this.isPolling = false;
                                clearInterval(pollInterval);
                                clearInterval(fastStatusChecker);
                                this.authenticationFailed = false;
                                
                                // Send authentication refresh notifications to the LSP server
                                console.log('🔧 Actualisation de l\'état d\'authentification du serveur...');
                                await this.refreshServerAuthentication();
                                
                                resolve(confirmResponse.result);
                                return;
                            } else if (status === 'NotAuthorized' || status === 'PromptUserDeviceFlow') {
                                // Only show this message occasionally to avoid spam
                                if (attempts % 5 === 0) {
                                    console.log('⏳ En attente de votre autorisation sur GitHub...');
                                    console.log('   💡 N\'oubliez pas de visiter le lien et d\'entrer le code!');
                                }
                                // Continue polling - this is expected during authentication
                            } else if (status === 'AlreadySignedIn') {
                                console.log('\n✅ DÉJÀ AUTHENTIFIÉ DÉTECTÉ! 🎉');
                                console.log('🔐 GitHub Copilot est maintenant connecté');
                                this.isPolling = false;
                                clearInterval(pollInterval);
                                clearInterval(fastStatusChecker);
                                this.authenticationFailed = false;
                                
                                // Send authentication refresh notifications
                                console.log('🔧 Actualisation de l\'état d\'authentification du serveur...');
                                await this.refreshServerAuthentication();
                                
                                resolve(confirmResponse.result);
                                return;
                            } else {
                                if (attempts % 5 === 0) {
                                    console.log(`ℹ️  Status reçu: ${status} - continuation du polling...`);
                                }
                            }
                        } else {
                            // No status in result, might be success - be more aggressive in checking
                            console.log('ℹ️  Réponse sans status spécifique - vérification supplémentaire...');
                            
                            // Double-check with status request
                            try {
                                const doubleCheckResponse = await this.sendRequest('checkStatus', {
                                    dummy: 'value'
                                });
                                
                                if (doubleCheckResponse && doubleCheckResponse.result) {
                                    const doubleCheckStatus = doubleCheckResponse.result.status;
                                    if (doubleCheckStatus === 'OK' || doubleCheckStatus === 'Authorized' || 
                                        doubleCheckStatus === 'SignedIn' || doubleCheckStatus === 'AlreadySignedIn') {
                                        console.log('\n✅ AUTHENTIFICATION CONFIRMÉE PAR DOUBLE VÉRIFICATION! 🎉');
                                        console.log('🔐 GitHub Copilot est maintenant connecté');
                                        this.isPolling = false;
                                        clearInterval(pollInterval);
                                        clearInterval(fastStatusChecker);
                                        this.authenticationFailed = false;
                                        
                                        await this.refreshServerAuthentication();
                                        resolve(doubleCheckResponse.result);
                                        return;
                                    }
                                }
                            } catch (doubleCheckError) {
                                // Continue with normal flow
                            }
                            
                            // If no clear success but no error, assume success
                            console.log('✅ Authentification semble réussie (pas de status spécifique)');
                            this.isPolling = false;
                            clearInterval(pollInterval);
                            clearInterval(fastStatusChecker);
                            this.authenticationFailed = false;
                            
                            // Send authentication refresh notifications
                            console.log('🔧 Actualisation de l\'état d\'authentification du serveur...');
                            await this.refreshServerAuthentication();
                            
                            resolve(confirmResponse.result);
                            return;
                        }
                    }
                    
                    // Check the response for specific error states
                    if (confirmResponse && confirmResponse.error) {
                        const errorCode = confirmResponse.error.code;
                        const errorMessage = confirmResponse.error.message;
                        
                        console.log(`🔧 Debug - Error message: "${errorMessage}"`); // Debug log
                        
                        if (errorMessage.includes('authorization_pending')) {
                            // Reset consecutive errors counter for expected pending state
                            consecutiveErrors = 0;
                            lastSuccessfulCheck = Date.now();
                            if (attempts % 5 === 0) {
                                console.log('⏳ En attente de votre autorisation sur GitHub...');
                            }
                            // Continue polling - this is the normal state while waiting
                        } else if (errorMessage.includes('slow_down')) {
                            consecutiveErrors = 0;
                            lastSuccessfulCheck = Date.now();
                            console.log('🐌 Ralentissement demandé, augmentation de l\'intervalle...');
                            interval = Math.min(interval * 2, 30); // Max 30 seconds
                        } else if (errorMessage.includes('expired_token') || 
                                   errorMessage.includes('device code has expired')) {
                            console.log('\n❌ Code d\'authentification officiellement expiré');
                            this.isPolling = false;
                            clearInterval(pollInterval);
                            clearInterval(fastStatusChecker);
                            
                            // Only restart if the code has actually expired according to GitHub
                            try {
                                console.log('🔄 Code expiré confirmé par GitHub - redémarrage...');
                                const restartResult = await this.restartAuthentication();
                                resolve(restartResult);
                            } catch (restartError) {
                                reject(new Error('Code d\'authentification expiré et impossible de redémarrer: ' + restartError.message));
                            }
                            return;
                        } else if (errorMessage.includes('access_denied')) {
                            console.log('❌ Accès refusé par l\'utilisateur');
                            this.isPolling = false;
                            clearInterval(pollInterval);
                            clearInterval(fastStatusChecker);
                            reject(new Error('Authentification refusée'));
                            return;
                        } else if (errorMessage.includes('No pending sign in') || 
                                   errorMessage.includes('no pending sign in')) {
                            consecutiveErrors++;
                            
                            // IMPORTANT: When we get "No pending sign in", it often means authentication succeeded
                            // but the device flow session is cleaned up. Let's check status immediately.
                            if (consecutiveErrors <= 2) {
                                console.log('🔧 "No pending sign in" - vérification immédiate du statut d\'authentification...');
                                try {
                                    const immediateStatusResponse = await this.sendRequest('checkStatus', {
                                        dummy: 'value'
                                    });
                                    
                                    if (immediateStatusResponse && immediateStatusResponse.result) {
                                        const immediateStatus = immediateStatusResponse.result.status;
                                        if (immediateStatus === 'OK' || immediateStatus === 'Authorized' || 
                                            immediateStatus === 'SignedIn' || immediateStatus === 'AlreadySignedIn') {
                                            console.log('\n✅ AUTHENTIFICATION TROUVÉE APRÈS "NO PENDING SIGN IN"! 🎉');
                                            console.log('🔐 L\'authentification a réussi - la session device flow était simplement fermée');
                                            this.isPolling = false;
                                            clearInterval(pollInterval);
                                            clearInterval(fastStatusChecker);
                                            this.authenticationFailed = false;
                                            
                                            await this.refreshServerAuthentication();
                                            resolve(immediateStatusResponse.result);
                                            return;
                                        }
                                    }
                                } catch (immediateStatusError) {
                                    console.log('ℹ️  Vérification immédiate échouée');
                                }
                            }
                            
                            // Be much more conservative about restarting authentication
                            // Only restart if we have MANY consecutive errors AND sufficient time has passed
                            const timeSinceLastSuccess = Date.now() - lastSuccessfulCheck;
                            const shouldRestart = (
                                consecutiveErrors >= 8 && // Increase threshold even more
                                attempts > 16 && // Much more attempts required
                                timeSinceLastSuccess > 120000 // At least 2 minutes since last successful check
                            );
                            
                            if (shouldRestart) {
                                console.log('\n❌ Session d\'authentification semble vraiment expirée après de nombreuses vérifications');
                                console.log(`🔧 Erreurs consécutives: ${consecutiveErrors}, Tentatives: ${attempts}`);
                                console.log(`🔧 Temps depuis dernier succès: ${Math.round(timeSinceLastSuccess/1000)}s`);
                                
                                // Extensive verification before restarting
                                let authConfirmed = false;
                                for (let i = 0; i < 5; i++) { // More checks
                                    try {
                                        console.log(`🔧 Vérification finale ${i + 1}/5...`);
                                        const finalStatusResponse = await this.sendRequest('checkStatus', {
                                            dummy: 'value'
                                        });
                                        
                                        if (finalStatusResponse && finalStatusResponse.result) {
                                            const finalStatus = finalStatusResponse.result.status;
                                            if (finalStatus === 'OK' || finalStatus === 'Authorized' || 
                                                finalStatus === 'SignedIn' || finalStatus === 'AlreadySignedIn') {
                                                console.log('✅ Authentification trouvée lors de la vérification finale!');
                                                this.isPolling = false;
                                                clearInterval(pollInterval);
                                                clearInterval(fastStatusChecker);
                                                this.authenticationFailed = false;
                                                
                                                await this.refreshServerAuthentication();
                                                resolve(finalStatusResponse.result);
                                                authConfirmed = true;
                                                return;
                                            }
                                        }
                                        // Wait longer between checks
                                        if (i < 4) await new Promise(resolve => setTimeout(resolve, 3000));
                                    } catch (finalStatusError) {
                                        console.log(`ℹ️  Vérification finale ${i + 1} échouée`);
                                    }
                                }
                                
                                if (!authConfirmed) {
                                    console.log('ℹ️  Toutes les vérifications finales ont échoué - redémarrage de l\'authentification');
                                    this.isPolling = false;
                                    clearInterval(pollInterval);
                                    clearInterval(fastStatusChecker);
                                    
                                    try {
                                        const restartResult = await this.restartAuthentication();
                                        resolve(restartResult);
                                    } catch (restartError) {
                                        reject(new Error('Session expirée et impossible de redémarrer: ' + restartError.message));
                                    }
                                    return;
                                }
                            } else {
                                // Just continue polling - be very patient
                                if (attempts % 3 === 0) {
                                    console.log(`ℹ️  "No pending sign in" détecté (${consecutiveErrors}/8) - patience...`);
                                    console.log('   💡 Cela peut signifier que l\'authentification a réussi et que la session est fermée');
                                    console.log('   ⏰ Vérifications en cours...');
                                }
                            }
                        } else {
                            // Other unknown errors - be more tolerant
                            consecutiveErrors++;
                            if (attempts % 5 === 0) {
                                console.log('⚠️  Erreur inconnue:', errorMessage);
                            }
                        }
                    }
                    
                } catch (error) {
                    consecutiveErrors++;
                    
                    // Handle timeout errors gracefully during polling
                    if (error.message.includes('Timeout')) {
                        if (attempts % 10 === 0) {
                            console.log('⏳ Timeout de requête (normal pendant le polling)...');
                        }
                    } else {
                        console.log('⚠️  Erreur lors du polling:', error.message);
                        
                        // Only consider restart after many errors and sufficient time
                        const timeSinceLastSuccess = Date.now() - lastSuccessfulCheck;
                        if (consecutiveErrors >= 10 && timeSinceLastSuccess > 180000) { // 3 minutes
                            console.log('\n❌ Erreurs persistantes détectées');
                            this.isPolling = false;
                            clearInterval(pollInterval);
                            clearInterval(fastStatusChecker);
                            
                            try {
                                const restartResult = await this.restartAuthentication();
                                resolve(restartResult);
                            } catch (restartError) {
                                reject(new Error('Erreurs persistantes et impossible de redémarrer'));
                            }
                            return;
                        }
                    }
                }
            };
            
            // Start polling immediately, then at intervals
            poll();
            const pollInterval = setInterval(poll, interval * 1000);
            
            // Also set up a faster status checker every 2 seconds to be more responsive
            const fastStatusChecker = setInterval(async () => {
                if (!this.isPolling) {
                    clearInterval(fastStatusChecker);
                    return;
                }
                
                try {
                    const quickStatusResponse = await this.sendRequest('checkStatus', {
                        dummy: 'value'
                    });
                    
                    if (quickStatusResponse && quickStatusResponse.result) {
                        const quickStatus = quickStatusResponse.result.status;
                        if (quickStatus === 'OK' || quickStatus === 'Authorized' || 
                            quickStatus === 'SignedIn' || quickStatus === 'AlreadySignedIn') {
                            console.log('\n✅ AUTHENTIFICATION DÉTECTÉE PAR VÉRIFICATION RAPIDE! 🎉');
                            console.log('🔐 GitHub Copilot est maintenant connecté');
                            this.isPolling = false;
                            clearInterval(pollInterval);
                            clearInterval(fastStatusChecker);
                            this.authenticationFailed = false;
                            
                            await this.refreshServerAuthentication();
                            resolve(quickStatusResponse.result);
                            return;
                        }
                    }
                } catch (quickStatusError) {
                    // Ignore errors in fast checker
                }
            }, 2000); // Check every 2 seconds
            
            // Set overall timeout
            setTimeout(() => {
                this.isPolling = false;
                clearInterval(pollInterval);
                clearInterval(fastStatusChecker);
                if (attempts <= maxAttempts) {
                    console.log('❌ Timeout global d\'authentification');
                    reject(new Error('Timeout global d\'authentification'));
                }
            }, expiresIn * 1000);
        });
    }

    async refreshServerAuthentication() {
        console.log('🔧 Actualisation de l\'authentification du serveur LSP...');
        
        try {
            // Wait a moment for the authentication to settle
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Method 1: Try to check the current authentication status
            try {
                console.log('🔧 Vérification du statut d\'authentification...');
                const statusResponse = await this.sendRequest('checkStatus', {
                    dummy: 'value'
                });
                
                if (statusResponse && statusResponse.result) {
                    console.log('🔧 Status après authentification:', statusResponse.result);
                    
                    // If status shows we're authenticated, great!
                    if (statusResponse.result.status === 'OK' || 
                        statusResponse.result.status === 'Authorized' ||
                        statusResponse.result.status === 'SignedIn') {
                        console.log('✅ Serveur confirme l\'authentification réussie');
                        return;
                    }
                }
            } catch (statusError) {
                console.log('ℹ️  Vérification du statut échouée:', statusError.message);
            }
            
            // Method 2: Send a workspace configuration change to refresh authentication
            console.log('🔧 Envoi de notification de changement de configuration...');
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
            
            // Method 3: Try to force refresh authentication state
            try {
                console.log('🔧 Tentative de rafraîchissement forcé...');
                await this.sendRequest('notifySignedIn', {
                    dummy: 'value'
                });
                console.log('✅ Notification de connexion envoyée');
            } catch (notifyError) {
                console.log('ℹ️  Notification de connexion non supportée:', notifyError.message);
            }
            
            // Method 4: Wait and check if authentication error messages stop
            console.log('🔧 Attente de stabilisation de l\'authentification...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log('✅ Actualisation de l\'authentification terminée');
            
        } catch (error) {
            console.warn('⚠️  Erreur lors de l\'actualisation de l\'authentification:', error.message);
            console.log('ℹ️  L\'authentification peut prendre quelques instants à se propager...');
        }
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

            // Only log detailed info for non-polling requests to reduce noise
            if (method !== 'signInConfirm' || !this.isPolling) {
                console.log(`🔧 Envoi de la requête ${method} avec ID ${id}`);
                console.log('🔧 Message JSON:', JSON.stringify(message, null, 2));
            }

            this.pendingRequests.set(id, { resolve, reject, method });
            this.sendMessage(message);

            // Timeout plus long pour les requêtes de completion et d'authentification
            let timeout = 30000; // Default 30s
            if (method === 'textDocument/inlineCompletion') {
                timeout = 60000; // 60s for completions
            } else if (method === 'signInConfirm') {
                timeout = 10000; // 10s for auth polling
            } else if (method === 'signInInitiate') {
                timeout = 60000; // 60s for initial auth
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
        console.log(`🔧 Envoi de la notification ${method}`);
        this.sendMessage(message);
    }

    sendMessage(message) {
        const content = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
        const fullMessage = header + content;
        
        // Only log detailed message info for non-polling requests to reduce noise
        if (message.method !== 'signInConfirm' || !this.isPolling) {
            console.log('🔧 Message LSP complet à envoyer:');
            console.log('Header:', JSON.stringify(header));
            console.log('Content:', content);
            console.log('Full message length:', fullMessage.length);
        }
        
        if (this.process && this.process.stdin && !this.process.stdin.destroyed) {
            try {
                this.process.stdin.write(fullMessage, 'utf8');
                if (message.method !== 'signInConfirm' || !this.isPolling) {
                    console.log('✅ Message envoyé avec succès');
                }
            } catch (error) {
                console.error('❌ Erreur lors de l\'envoi du message:', error);
            }
        } else {
            console.error('❌ Process stdin non disponible');
        }
    }

    handleMessage(message) {
        // Only log detailed message info for non-status messages to reduce noise
        if (!message.method || 
            (message.method !== 'statusNotification' && 
             message.method !== 'didChangeStatus' && 
             message.method !== 'window/logMessage')) {
            
            // Don't log responses to signInConfirm during polling to reduce noise
            if (!(message.id && this.isPolling && 
                  this.pendingRequests.has(message.id) && 
                  this.pendingRequests.get(message.id).method === 'signInConfirm')) {
                console.log('🔧 Message reçu du serveur LSP:', JSON.stringify(message, null, 2));
            }
        }
        
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
            const { resolve, method } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);
            
            if (message.error) {
                if (method !== 'signInConfirm' || !this.isPolling) {
                    console.error(`❌ Erreur LSP pour ${method}:`, message.error);
                }
            } else {
                if (method !== 'signInConfirm' || !this.isPolling) {
                    console.log(`✅ Réponse LSP réussie pour ${method}`);
                }
            }
            
            resolve(message);
        } else if (message.method) {
            // Gérer les notifications et requêtes du serveur
            this.handleServerRequest(message);
        } else {
            // Don't show "non géré" messages during polling to reduce noise
            if (!this.isPolling) {
                console.log('🔧 Message LSP non géré:', message);
            }
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
        console.log('🔧 Items demandés:', request.params.items);
        
        // Configuration par défaut pour GitHub Copilot avec authentification améliorée
        const config = request.params.items.map(item => {
            console.log('🔧 Configuration pour section:', item.section);
            
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
                        }
                        // Remove authProvider from here
                    };
                case 'github-enterprise':
                case 'github':
                    return {
                        uri: "https://github.com"
                        // Don't include token in configuration response
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
                    console.log('🔧 Section non reconnue:', item.section);
                    return {};
            }
        });

        console.log('🔧 Configuration finale à envoyer:', JSON.stringify(config, null, 2));

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
        
        // Only show important status changes, and reduce noise during polling
        if (!this.isPolling || status === 'Normal' || status === 'OK') {
            if (status === 'Error') {
                console.log(`❌ Status: ${status} - ${message}`);
            } else if (status === 'Normal' || status === 'OK') {
                console.log(`✅ Status: ${status} - ${message}`);
            } else {
                console.log(`ℹ️  Status: ${status} - ${message}`);
            }
        }
        
        if ((params.status === 'Error' || params.kind === 'Error') && 
            (params.message.includes('not signed into GitHub') || 
             params.message.includes('Invalid copilot token') ||
             params.message.includes('missing token') ||
             params.message.includes('User not authorized'))) {
            
            // Don't show error details during initial auth flow or immediately after successful auth
            if (!this.isPolling && !this.recentlyAuthenticated) {
                console.log('🔧 Détails de l\'erreur:', params.message);
                console.log('ℹ️  Ceci peut être normal - l\'authentification est peut-être en cours...');
            } else if (this.recentlyAuthenticated) {
                console.log('ℹ️  Erreur d\'authentification après connexion - attente de propagation...');
            }
            
            // Set a flag to indicate authentication is needed (but be more lenient after recent auth)
            if (!this.recentlyAuthenticated) {
                this.authenticationFailed = true;
            }
        } else if (status === 'Normal' || message.includes('signed in') || message.includes('Signed in')) {
            // Clear authentication failure flag on success
            this.authenticationFailed = false;
            this.recentlyAuthenticated = true;
            
            // Clear the recently authenticated flag after a delay
            setTimeout(() => {
                this.recentlyAuthenticated = false;
            }, 30000); // 30 seconds grace period
            
            if (!this.isPolling) {
                console.log('✅ Authentification Copilot réussie!');
            }
            
            // If we were polling, stop it
            if (this.isPolling) {
                console.log('\n✅ AUTHENTIFICATION DÉTECTÉE VIA STATUS! 🎉');
                console.log('🔐 GitHub Copilot est maintenant connecté');
                this.isPolling = false;
            }
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

        // Check if we had authentication failures but allow some retry
        if (this.authenticationFailed && !this.hasTriedAuth) {
            console.log('⚠️  Authentification requise - tentative d\'authentification automatique...');
            try {
                this.hasTriedAuth = true;
                await this.initiateCopilotSignIn();
                
                // Wait a bit for authentication to complete
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // If still failed, throw error
                if (this.authenticationFailed) {
                    throw new Error('Authentification GitHub Copilot requise - veuillez compléter l\'authentification dans votre navigateur');
                }
            } catch (authError) {
                throw new Error(`Authentification échouée: ${authError.message}`);
            }
        } else if (this.authenticationFailed) {
            throw new Error('Authentification GitHub Copilot requise - veuillez redémarrer le script et compléter l\'authentification');
        }

        const uri = await this.openDocument(filePath);
        
        console.log(`🔍 Recherche de completions pour ${path.basename(filePath)} à la ligne ${line + 1}, caractère ${character}`);
        console.log(`🔧 URI utilisé: ${uri}`);

        // Wait a bit more for the server to be ready after opening document
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check authentication status before proceeding
        if (this.authenticationFailed) {
            console.error('❌ Authentification échouée détectée - abandon de la requête');
            throw new Error('Authentification GitHub Copilot requise');
        }

        console.log('🔧 Vérification de l\'état d\'authentification...');
        
        // Set polling flag to reduce noise
        this.isPolling = false;
        
        // Try different completion methods for Copilot
        const completionMethods = [
            'textDocument/inlineCompletion',  // GitHub Copilot specific
            'getCompletions',                 // Alternative Copilot method
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
                        response.error.message.includes('Not authenticated') ||
                        response.error.message.includes('not signed into GitHub') ||
                        response.error.message.includes('authentication') ||
                        response.error.message.includes('User not authorized')) {
                        console.error('❌ Erreur d\'authentification GitHub Copilot détectée dans la réponse!');
                        authError = true;
                        this.authenticationFailed = true;
                    }
                }
            } catch (error) {
                console.log(`❌ Erreur avec la méthode ${method}:`, error.message);
                continue;
            }
        }

        if (authError || this.authenticationFailed) {
            console.error('❌ Problème d\'authentification détecté!');
            console.log('🔧 L\'authentification GitHub Copilot est requise.');
            console.log('🔧 Redémarrez le script pour relancer le processus d\'authentification.');
            
            throw new Error('Authentification GitHub Copilot requise - redémarrez le script');
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

    async restartAuthentication() {
        console.log('🔄 Redémarrage du processus d\'authentification GitHub Copilot...');
        this.isPolling = false;
        
        // Wait a moment before restarting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            // Try to get a new device code
            console.log('🔧 Demande d\'un nouveau code d\'authentification...');
            const signInResponse = await this.sendRequest('signInInitiate', {
                dummy: 'value'
            });
            
            if (signInResponse && !signInResponse.error && signInResponse.result) {
                console.log('\n🔗 NOUVELLE AUTHENTIFICATION GITHUB COPILOT 🔗');
                console.log('═'.repeat(60));
                console.log('🚨 IMPORTANT: UTILISEZ LE NOUVEAU CODE CI-DESSOUS 🚨');
                console.log('');
                console.log('🌐 Ouvrez cette URL dans votre navigateur:');
                console.log(`   ${signInResponse.result.verificationUri}`);
                console.log('');
                console.log('🔑 Saisissez ce NOUVEAU code sur la page GitHub:');
                console.log(`   ${signInResponse.result.userCode}`);
                console.log('');
                console.log(`⏱️  Code valide pendant: ${Math.floor(signInResponse.result.expiresIn / 60)} minutes`);
                console.log('');
                console.log('📋 Étapes à suivre:');
                console.log('   1. ❗ IGNOREZ l\'ancien code - utilisez le NOUVEAU code ci-dessus');
                console.log('   2. Ouvrez le lien dans votre navigateur');
                console.log('   3. Connectez-vous à GitHub si nécessaire');
                console.log('   4. Saisissez le NOUVEAU code dans le formulaire');
                console.log('   5. Autorisez l\'accès à GitHub Copilot');
                console.log('═'.repeat(60));
                console.log('⏳ Attente de votre authentification avec le nouveau code...');
                console.log('');
                
                // Start polling with the new code
                return await this.pollForAuthentication(
                    signInResponse.result.userCode, 
                    signInResponse.result.interval || 5, 
                    signInResponse.result.expiresIn
                );
            } else {
                const errorMsg = signInResponse?.error?.message || 'Réponse invalide';
                throw new Error(`Impossible d'obtenir un nouveau code d'authentification: ${errorMsg}`);
            }
        } catch (error) {
            console.error('❌ Erreur lors du redémarrage de l\'authentification:', error.message);
            throw error;
        }
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