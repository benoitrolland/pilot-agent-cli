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
          if (parsed.method === 'copilot/requestSignIn') {
            console.log('\n🔑 URL d\'authentification:', parsed.params.userCode);
            console.log('📋 Code utilisateur:', parsed.params.verificationUri);
            console.log('\n👆 Ouvrez cette URL dans votre navigateur et entrez le code');
          }
          
        } catch (e) {
          console.error('Erreur parsing JSON:', e);
        }
      }
    });

    // 1. Initialisation du serveur de langage
    sendMessage('initialize', {
      processId: process.pid,
      rootPath: process.cwd(),
      rootUri: `file://${process.cwd()}`,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true
            }
          }
        }
      }
    });

    // 2. Attendre un peu puis demander le statut d'authentification
    setTimeout(() => {
      sendMessage('copilot/checkStatus');
    }, 1000);

    // 3. Interface interactive
    setTimeout(() => {
      console.log('\n📝 Commandes disponibles:');
      console.log('- "auth" : Démarrer l\'authentification');
      console.log('- "status" : Vérifier le statut');
      console.log('- "quit" : Quitter');
      
      rl.on('line', (input) => {
        const command = input.trim().toLowerCase();
        
        switch (command) {
          case 'auth':
            console.log('🔐 Démarrage de l\'authentification...');
            sendMessage('copilot/signIn');
            break;
            
          case 'status':
            console.log('📊 Vérification du statut...');
            sendMessage('copilot/checkStatus');
            break;
            
          case 'quit':
            console.log('👋 Au revoir!');
            copilotServer.kill();
            rl.close();
            break;
            
          default:
            console.log('❌ Commande inconnue. Utilisez: auth, status, ou quit');
        }
      });
    }, 2000);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation:', error.message);
    process.exit(1);
  }
}

// Démarrer l'application
initialize();