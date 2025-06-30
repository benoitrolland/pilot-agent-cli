const { spawn } = require('child_process');
const readline = require('readline');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const fs = require('fs');

let copilotServer = null;
let messageId = 1;

// Fonction pour détecter et démarrer le serveur Copilot
async function startCopilotServer() {
  console.log('🔧 Recherche de copilot-language-server...');
  
  let serverPath = null;
  
  try {
    // Détecter le chemin du serveur
    const { stdout } = await exec('which copilot-language-server');
    serverPath = stdout.trim();
    console.log('✅ copilot-language-server trouvé:', serverPath);
    
    // Conversion pour Windows si nécessaire
    if (process.platform === 'win32' && serverPath.startsWith('/')) {
      serverPath = serverPath.replace(/^\/([a-zA-Z])\//, '$1:/').replace(/\//g, '\\');
      console.log('🔧 Chemin converti:', serverPath);
    }
  } catch (error) {
    console.error('❌ copilot-language-server non trouvé');
    console.log('📦 Installation requise:');
    console.log('   npm install -g @github/copilot-language-server');
    process.exit(1);
  }

  // Tentatives de démarrage avec différentes méthodes
  const attempts = [
    () => spawn('npx', ['copilot-language-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'], shell: true }),
    () => spawn('copilot-language-server', ['--stdio'], { stdio: ['pipe', 'pipe', 'pipe'], shell: true }),
    () => spawn('node', [serverPath, '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] }),
    () => spawn(serverPath, ['--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] })
  ];

  let lastError = null;
  
  for (let i = 0; i < attempts.length; i++) {
    try {
      console.log(`🔧 Tentative ${i + 1}/${attempts.length}...`);
      copilotServer = attempts[i]();
      
      // Attendre pour voir si le processus démarre
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 3000);
        
        copilotServer.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        
        copilotServer.on('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      console.log('✅ Serveur démarré avec succès');
      
      // Setup event handlers after successful spawn
      copilotServer.stderr.on('data', (data) => {
        console.error('Erreur serveur:', data.toString());
      });

      copilotServer.on('close', (code) => {
        console.log(`Serveur fermé avec le code: ${code}`);
        process.exit(code);
      });

      copilotServer.on('error', (error) => {
        console.error('❌ Erreur du serveur:', error.message);
        process.exit(1);
      });
      
      break;
      
    } catch (error) {
      console.log(`❌ Tentative ${i + 1} échouée:`, error.message);
      lastError = error;
      
      if (copilotServer) {
        try { copilotServer.kill(); } catch (e) {}
        copilotServer = null;
      }
    }
  }

  if (!copilotServer) {
    console.error('❌ Impossible de démarrer le serveur');
    throw lastError || new Error('Toutes les tentatives ont échoué');
  }

  return copilotServer;
}

// Interface pour lire les entrées utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Fonction pour envoyer un message JSON-RPC
function sendMessage(method, params = {}) {
  const message = {
    jsonrpc: '2.0',
    id: messageId++,
    method: method,
    params: params
  };
  
  const content = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
  
  console.log(`→ Envoi: ${method}`);
  copilotServer.stdin.write(header + content);
}

// Fonction pour envoyer une notification JSON-RPC
function sendNotification(method, params = {}) {
  const message = {
    jsonrpc: '2.0',
    method: method,
    params: params
  };
  
  const content = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
  
  console.log(`→ Notification: ${method}`);
  copilotServer.stdin.write(header + content);
}

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n👋 Arrêt en cours...');
  if (copilotServer && !copilotServer.killed) {
    copilotServer.kill();
  }
  rl.close();
  process.exit(0);
});

// Séquence d'initialisation
async function initialize() {
  console.log('🚀 Démarrage de l\'authentification GitHub Copilot...\n');

  try {
    await startCopilotServer();
    
    // Setup message handling
    let buffer = '';
    copilotServer.stdout.on('data', (data) => {
      buffer += data.toString();
      
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        
        const header = buffer.substring(0, headerEnd);
        const contentLengthMatch = header.match(/Content-Length: (\d+)/);
        
        if (!contentLengthMatch) break;
        
        const contentLength = parseInt(contentLengthMatch[1]);
        const messageStart = headerEnd + 4;
        const messageEnd = messageStart + contentLength;
        
        if (buffer.length < messageEnd) break;
        
        const message = buffer.substring(messageStart, messageEnd);
        buffer = buffer.substring(messageEnd);
        
        try {
          const parsed = JSON.parse(message);
          console.log(`← Reçu:`, JSON.stringify(parsed, null, 2));
          
          // Gestion spéciale pour les réponses d'authentification
          if (parsed.result && parsed.result.verificationUri && parsed.result.userCode) {
            console.log('\n🔗 AUTHENTIFICATION GITHUB COPILOT REQUISE 🔗');
            console.log('═'.repeat(60));
            console.log('🌐 Ouvrez cette URL dans votre navigateur:');
            console.log(`   ${parsed.result.verificationUri}`);
            console.log('');
            console.log('🔑 Saisissez ce code sur la page GitHub:');
            console.log(`   ${parsed.result.userCode}`);
            console.log('');
            console.log(`⏱️  Code valide pendant: ${Math.floor(parsed.result.expiresIn / 60)} minutes`);
            console.log('');
            console.log('📋 Étapes à suivre:');
            console.log('   1. Cliquez sur le lien ci-dessus ou copiez-le dans votre navigateur');
            console.log('   2. Connectez-vous à GitHub si nécessaire');
            console.log('   3. Saisissez le code utilisateur affiché ci-dessus');
            console.log('   4. Autorisez l\'accès à GitHub Copilot');
            console.log('   5. Revenez à ce terminal');
            console.log('═'.repeat(60));
            console.log('⏳ Attente de votre authentification...');
            console.log('');
            
            // Démarrer le polling automatique
            setTimeout(() => startPolling(parsed.result.userCode), 5000);
          }
          
        } catch (e) {
          console.error('Erreur parsing JSON:', e);
        }
      }
    });

    // 1. Initialisation du serveur de langage avec plus de capacités
    sendMessage('initialize', {
      processId: process.pid,
      rootUri: `file://${process.cwd().replace(/\\/g, '/')}`,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext']
            },
            contextSupport: true,
            dynamicRegistration: true
          }
        },
        workspace: {
          configuration: true,
          workspaceFolders: true
        }
      },
      initializationOptions: {
        editorInfo: {
          name: "copilot-auth-client",
          version: "1.0.0"
        },
        editorPluginInfo: {
          name: "copilot-auth-plugin", 
          version: "1.0.0"
        }
      }
    });

    // 2. Attendre l'initialisation puis envoyer initialized
    setTimeout(() => {
      sendNotification('initialized', {});
      
      // 3. Attendre un peu puis demander le statut d'authentification
      setTimeout(() => {
        sendMessage('checkStatus', { dummy: 'value' });
      }, 2000);
    }, 1000);

    // 4. Interface interactive
    setTimeout(() => {
      console.log('\n📝 Commandes disponibles:');
      console.log('- "auth" : Démarrer l\'authentification');
      console.log('- "status" : Vérifier le statut');
      console.log('- "confirm <code>" : Confirmer avec code utilisateur');
      console.log('- "quit" : Quitter');
      
      rl.on('line', (input) => {
        const parts = input.trim().split(' ');
        const command = parts[0].toLowerCase();
        
        switch (command) {
          case 'auth':
            console.log('🔐 Démarrage de l\'authentification...');
            sendMessage('signInInitiate', { dummy: 'value' });
            break;
            
          case 'status':
            console.log('📊 Vérification du statut...');
            sendMessage('checkStatus', { dummy: 'value' });
            break;
            
          case 'confirm':
            if (parts.length > 1) {
              const userCode = parts[1];
              console.log(`🔄 Confirmation avec code: ${userCode}`);
              sendMessage('signInConfirm', { userCode: userCode });
            } else {
              console.log('❌ Usage: confirm <code_utilisateur>');
            }
            break;
            
          case 'quit':
            console.log('👋 Au revoir!');
            copilotServer.kill();
            rl.close();
            break;
            
          default:
            console.log('❌ Commande inconnue. Utilisez: auth, status, confirm <code>, ou quit');
        }
      });
    }, 3000);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error.message);
    process.exit(1);
  }
}

// Fonction pour démarrer le polling automatique
function startPolling(userCode) {
  console.log('🔄 Démarrage du polling automatique...');
  
  const pollInterval = setInterval(() => {
    console.log('🔄 Vérification de l\'authentification...');
    sendMessage('signInConfirm', { userCode: userCode });
  }, 10000); // Toutes les 10 secondes
  
  // Arrêter le polling après 15 minutes
  setTimeout(() => {
    clearInterval(pollInterval);
    console.log('⏰ Timeout du polling automatique');
  }, 15 * 60 * 1000);
  
  // Permettre l'arrêt manuel du polling
  console.log('💡 Tapez "stop" pour arrêter le polling automatique');
  const originalHandler = rl.listeners('line')[0];
  
  const stopPollingHandler = (input) => {
    if (input.trim().toLowerCase() === 'stop') {
      clearInterval(pollInterval);
      console.log('🛑 Polling automatique arrêté');
      rl.removeListener('line', stopPollingHandler);
      if (originalHandler) {
        rl.on('line', originalHandler);
      }
    }
  };
  
  rl.on('line', stopPollingHandler);
}

// Démarrer l'application
initialize();