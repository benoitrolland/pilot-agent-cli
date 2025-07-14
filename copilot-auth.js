const { spawn } = require('child_process');
const readline = require('readline');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const fs = require('fs');
const path = require('path');

let copilotServer = null;
let messageId = 1;
let isPolling = false;
let pollInterval = null;

// Function to detect and start Copilot server
async function startCopilotServer() {
  console.log('🔧 Searching for copilot-language-server...');

  let serverPath = null;
  let serverFound = false;

  // Try different detection methods for cross-platform compatibility
  const detectionMethods = [
    // Method 1: Try npx which works on all platforms
    async () => {
      try {
        await exec('npx copilot-language-server --version', { timeout: 5000 });
        console.log('✅ copilot-language-server found via npx');
        return 'npx';
      } catch (error) {
        return null;
      }
    },

    // Method 2: Try direct command (works if in PATH)
    async () => {
      try {
        await exec('copilot-language-server --version', { timeout: 5000 });
        console.log('✅ copilot-language-server found in PATH');
        return 'direct';
      } catch (error) {
        return null;
      }
    },

    // Method 3: Try where command on Windows / which on Unix
    async () => {
      try {
        const command = process.platform === 'win32' ? 'where copilot-language-server' : 'which copilot-language-server';
        const { stdout } = await exec(command, { timeout: 5000 });
        serverPath = stdout.trim();
        console.log('✅ copilot-language-server found:', serverPath);
        return 'path';
      } catch (error) {
        return null;
      }
    },

    // Method 4: Check npm global directory
    async () => {
      try {
        const { stdout } = await exec('npm root -g', { timeout: 5000 });
        const globalNodeModules = stdout.trim();
        const expectedPath = path.join(globalNodeModules, '@github', 'copilot-language-server');

        if (fs.existsSync(expectedPath)) {
          const binPath = path.join(expectedPath, 'bin', 'copilot-language-server');
          if (fs.existsSync(binPath)) {
            serverPath = binPath;
            console.log('✅ copilot-language-server found in npm global:', serverPath);
            return 'npm-global';
          }
        }
        return null;
      } catch (error) {
        return null;
      }
    }
  ];

  // Try each detection method
  for (const method of detectionMethods) {
    const result = await method();
    if (result) {
      serverFound = true;
      break;
    }
  }

  if (!serverFound) {
    console.error('❌ copilot-language-server not found');
    console.log('📦 Installation required:');
    console.log('   npm install -g @github/copilot-language-server');
    console.log('');
    console.log('🔍 Troubleshooting:');
    console.log('   1. Verify installation: npx copilot-language-server --version');
    console.log('   2. Check npm global path: npm root -g');
    console.log('   3. Restart terminal after installation');
    process.exit(1);
  }

  // Start attempts with different methods - prioritize npx for reliability
  const attempts = [
    () => spawn('npx', ['copilot-language-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' // Use shell on Windows for npx
    }),
    () => spawn('copilot-language-server', ['--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    })
  ];

  // Add path-specific attempt if we found a specific path
  if (serverPath) {
    attempts.push(() => spawn('node', [serverPath, '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe']
    }));
    attempts.push(() => spawn(serverPath, ['--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    }));
  }

  let lastError = null;
  
  for (let i = 0; i < attempts.length; i++) {
    try {
      console.log(`🔧 Attempt ${i + 1}/${attempts.length}...`);
      copilotServer = attempts[i]();
      
      // Wait to see if process starts
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
      
      console.log('✅ Server started successfully');

      // Setup event handlers after successful spawn
      copilotServer.stderr.on('data', (data) => {
        console.error('Server error:', data.toString());
      });

      copilotServer.on('close', (code) => {
        console.log(`Server closed with code: ${code}`);
        process.exit(code);
      });

      copilotServer.on('error', (error) => {
        console.error('❌ Server error:', error.message);
        process.exit(1);
      });
      
      break;
      
    } catch (error) {
      console.log(`❌ Attempt ${i + 1} failed:`, error.message);
      lastError = error;
      
      if (copilotServer) {
        try { copilotServer.kill(); } catch (e) {}
        copilotServer = null;
      }
    }
  }

  if (!copilotServer) {
    console.error('❌ Unable to start server');
    console.log('🔍 Debugging information:');
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Node version: ${process.version}`);
    if (serverPath) {
      console.log(`   Server path: ${serverPath}`);
    }
    throw lastError || new Error('All attempts failed');
  }

  return copilotServer;
}

// Interface to read user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to send JSON-RPC message
function sendMessage(method, params = {}) {
  const message = {
    jsonrpc: '2.0',
    id: messageId++,
    method: method,
    params: params
  };
  
  const content = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
  
  console.log(`→ Sending: ${method}`);
  copilotServer.stdin.write(header + content);
}

// Function to send JSON-RPC notification
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

// Clean shutdown handling
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  if (copilotServer && !copilotServer.killed) {
    copilotServer.kill();
  }
  rl.close();
  process.exit(0);
});

// Initialization sequence
async function initialize() {
  console.log('🚀 Starting GitHub Copilot authentication...\n');

  try {
    await startCopilotServer();
    
    // Setup message handling
    let buffer = '';
    let authenticationConfirmed = false;
    
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
          console.log(`← Received:`, JSON.stringify(parsed, null, 2));

          // Handle status responses - authentication success
          if (parsed.result && parsed.result.status === 'OK' && parsed.result.user) {
            if (!authenticationConfirmed) {
              authenticationConfirmed = true;
              console.log('\n🎉 AUTHENTICATION ALREADY ACTIVE! 🎉');
              console.log('═'.repeat(60));
              console.log(`✅ Connected user: ${parsed.result.user}`);
              console.log('✅ GitHub Copilot is ready to use');
              console.log('✅ No additional authentication required');
              console.log('═'.repeat(60));
              
              // Stop polling if active
              if (isPolling && pollInterval) {
                clearInterval(pollInterval);
                isPolling = false;
                console.log('🛑 Stopping polling - authentication confirmed');
              }
              
              console.log('\n💡 NEXT STEPS:');
              console.log('🔹 GitHub Copilot is now authenticated and ready');
              console.log('🔹 Authentication persists across sessions');
              console.log('🔹 You can now use compatible Copilot clients');
              console.log('🔹 Type "quit" to close this authentication script');

              return; // No need to continue auth process
            }
          }
          
          // Handle "No pending sign in" errors - this is success!
          if (parsed.error && parsed.error.message === 'No pending sign in') {
            if (!authenticationConfirmed) {
              authenticationConfirmed = true;
              console.log('\n🎉 AUTHENTICATION CONFIRMED! 🎉');
              console.log('═'.repeat(60));
              console.log('✅ "No pending sign in" means you are already logged in');
              console.log('✅ GitHub Copilot is ready to use');
              console.log('✅ Authentication completed successfully');
              console.log('═'.repeat(60));
              
              // Stop polling
              if (isPolling && pollInterval) {
                clearInterval(pollInterval);
                isPolling = false;
                console.log('🛑 Stopping polling - authentication confirmed');
              }
              
              console.log('\n💡 NEXT STEPS:');
              console.log('🔹 GitHub Copilot is now authenticated and ready');
              console.log('🔹 Authentication persists across sessions');
              console.log('🔹 You can now use compatible Copilot clients');
              console.log('🔹 Type "quit" to close this authentication script');

              return;
            }
          }
          
          // Special handling for authentication responses (new flow)
          if (parsed.result && parsed.result.verificationUri && parsed.result.userCode) {
            console.log('\n🔗 GITHUB COPILOT AUTHENTICATION REQUIRED 🔗');
            console.log('═'.repeat(60));
            console.log('🌐 Open this URL in your browser:');
            console.log(`   ${parsed.result.verificationUri}`);
            console.log('');
            console.log('🔑 Enter this code on the GitHub page:');
            console.log(`   ${parsed.result.userCode}`);
            console.log('');
            console.log(`⏱️  Code valid for: ${Math.floor(parsed.result.expiresIn / 60)} minutes`);
            console.log('');
            console.log('📋 Steps to follow:');
            console.log('   1. Click the link above or copy it to your browser');
            console.log('   2. Log in to GitHub if necessary');
            console.log('   3. Enter the user code displayed above');
            console.log('   4. Authorize access to GitHub Copilot');
            console.log('   5. Return to this terminal');
            console.log('');
            console.log(`💡 OR use command: confirm ${parsed.result.userCode}`);
            console.log('═'.repeat(60));
            console.log('⏳ Waiting for your authentication...');
            console.log('');
            
            // Start automatic polling
            setTimeout(() => startPolling(parsed.result.userCode), 5000);
          }

          // Handle logout responses - only for real logouts
          if (parsed.result && parsed.method === 'signOut' &&
              (parsed.result.status === 'NotSignedIn' || parsed.result.status === 'SignedOut')) {
            console.log('\n✅ LOGOUT SUCCESSFUL! ✅');
            console.log('═'.repeat(60));
            console.log('🔓 You have been logged out of GitHub Copilot');
            console.log('🔓 Authentication has been revoked');
            console.log('🔓 Use "auth" to reconnect');
            console.log('═'.repeat(60));
            authenticationConfirmed = false;
            return;
          }
          
          // Special handling for successful signOut
          if (parsed.result && !parsed.error &&
              parsed.id && typeof parsed.result === 'object') {
            // Check if this is a signOut response
            const pendingRequest = messageId - 1; // Approximation
            if (parsed.result.status === 'OK' || parsed.result === null || 
                Object.keys(parsed.result).length === 0) {
              console.log('\n✅ LOGOUT COMPLETED! ✅');
              console.log('═'.repeat(60));
              console.log('🔓 GitHub Copilot logged out successfully');
              console.log('🔓 Authentication session closed');
              console.log('🔓 You will need to reconnect with "auth"');
              console.log('═'.repeat(60));
              authenticationConfirmed = false;
              return;
            }
          }
          
          // Handle logout errors for real signOut attempts
          if (parsed.error && parsed.error.message &&
              (parsed.error.message.includes('not signed in') || 
               parsed.error.message.includes('Not signed in') ||
               parsed.error.message.includes('No active session'))) {
            
            // Only treat as logout if we explicitly requested signOut
            console.log('\n🔓 ALREADY LOGGED OUT! 🔓');
            console.log('═'.repeat(60));
            console.log('ℹ️  You were not connected to GitHub Copilot');
            console.log('ℹ️  No active session found');
            console.log('🔐 Use "auth" to connect');
            console.log('═'.repeat(60));
            authenticationConfirmed = false;
            return;
          }
          
          // Handle authentication success via signInConfirm
          if (parsed.result && (parsed.result.status === 'OK' ||
                               parsed.result.status === 'Authorized' ||
                               parsed.result.status === 'SignedIn' ||
                               parsed.result.status === 'AlreadySignedIn')) {
            if (!authenticationConfirmed) {
              authenticationConfirmed = true;
              console.log('\n🎉 AUTHENTICATION SUCCESSFUL VIA SIGNIN! 🎉');
              console.log('═'.repeat(60));
              console.log('✅ GitHub Copilot is now connected');
              console.log('✅ Authentication completed successfully');
              console.log('✅ Session active and ready to use');
              console.log('═'.repeat(60));
              
              // Stop polling
              if (isPolling && pollInterval) {
                clearInterval(pollInterval);
                isPolling = false;
                console.log('🛑 Stopping polling - authentication confirmed');
              }
              
              console.log('\n💡 NEXT STEPS:');
              console.log('🔹 GitHub Copilot is now authenticated and ready');
              console.log('🔹 Authentication persists across sessions');
              console.log('🔹 You can now use compatible Copilot clients');
              console.log('🔹 Type "quit" to close this authentication script');

              return;
            }
          }
          
        } catch (e) {
          console.error('JSON parsing error:', e);
        }
      }
    });

    // 1. Language server initialization with more capabilities
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

    // 2. Wait for initialization then send initialized
    setTimeout(() => {
      sendNotification('initialized', {});
      
      // 3. Wait a bit then ask for authentication status
      setTimeout(() => {
        sendMessage('checkStatus', { dummy: 'value' });
      }, 2000);
    }, 1000);

    // 4. Interactive interface
    setTimeout(() => {
      if (!authenticationConfirmed) {
        console.log('\n📝 Available commands:');
        console.log('- "auth" : Start authentication');
        console.log('- "status" : Check status');
        console.log('- "confirm <code>" : Confirm with user code (after seeing the code)');
        console.log('- "unauth" : Disconnect from GitHub Copilot');
        console.log('- "stop" : Stop automatic polling');
        console.log('- "quit" : Exit');
        console.log('');
        console.log('💡 The "confirm" command is only used if you see an authentication code');
        console.log('💡 The "unauth" command revokes your GitHub Copilot authentication');
        console.log('💡 If you are already connected, just use "quit" to exit');
      }
      
      rl.on('line', (input) => {
        const parts = input.trim().split(' ');
        const command = parts[0].toLowerCase();
        
        switch (command) {
          case 'auth':
            console.log('🔐 Starting authentication...');
            sendMessage('signInInitiate', { dummy: 'value' });
            break;
            
          case 'status':
            console.log('📊 Checking status...');
            sendMessage('checkStatus', { dummy: 'value' });
            break;
            
          case 'confirm':
            if (parts.length > 1) {
              const userCode = parts[1];
              console.log(`🔄 Confirming with code: ${userCode}`);
              console.log('💡 This is only necessary if you received a new authentication code');
              sendMessage('signInConfirm', { userCode: userCode });
            } else {
              console.log('❌ Usage: confirm <user_code>');
              console.log('💡 Example: confirm ABCD-EFGH');
              console.log('💡 Use this command only if you see an authentication code');
            }
            break;
            
          case 'unauth':
          case 'logout':
          case 'signout':
            console.log('🔓 Disconnecting from GitHub Copilot...');
            console.log('⚠️  This will revoke your GitHub Copilot authentication');
            console.log('⚠️  You will need to reconnect with "auth" after this operation');

            // Stop polling if active
            if (isPolling && pollInterval) {
              clearInterval(pollInterval);
              isPolling = false;
              console.log('🛑 Stopping polling before logout');
            }
            
            // Use only signOut - other methods are not supported
            console.log('🔧 Logging out...');
            sendMessage('signOut', { dummy: 'value' });
            
            authenticationConfirmed = false;
            break;
            
          case 'stop':
            if (isPolling && pollInterval) {
              clearInterval(pollInterval);
              isPolling = false;
              console.log('🛑 Automatic polling stopped manually');
            } else {
              console.log('ℹ️  No polling in progress');
            }
            break;
            
          case 'quit':
          case 'exit':
            console.log('👋 Goodbye!');
            console.log('✅ GitHub Copilot remains authenticated for future use');
            console.log('🔧 Authentication will be available for all compatible Copilot clients');
            console.log('💡 Use "unauth" before "quit" if you want to log out');

            // Clean up resources in proper order
            if (pollInterval) {
              clearInterval(pollInterval);
              isPolling = false;
            }
            
            // Close readline interface
            rl.close();
            
            // Kill copilot server
            if (copilotServer && !copilotServer.killed) {
              copilotServer.kill('SIGTERM');
              
              // Force stop after 2 seconds if necessary
              setTimeout(() => {
                if (copilotServer && !copilotServer.killed) {
                  copilotServer.kill('SIGKILL');
                }
                // Ensure process terminates
                process.exit(0);
              }, 2000);
            } else {
              // No server to kill, exit immediately
              process.exit(0);
            }
            break;
            
          default:
            console.log('❌ Unknown command. Use: auth, status, confirm <code>, unauth, stop, or quit');
        }
      });
    }, 3000);
    
  } catch (error) {
    console.error('❌ Error during initialization:', error.message);
    process.exit(1);
  }
}

// Function to start automatic polling
function startPolling(userCode) {
  console.log('🔄 Starting automatic polling...');
  isPolling = true;
  
  pollInterval = setInterval(() => {
    console.log('🔄 Checking authentication...');
    sendMessage('signInConfirm', { userCode: userCode });
  }, 10000); // Every 10 seconds

  // Stop polling after 15 minutes
  setTimeout(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      isPolling = false;
      console.log('⏰ Automatic polling timeout');
    }
  }, 15 * 60 * 1000);
  
  // Allow manual polling stop
  console.log('💡 Type "stop" to stop automatic polling');
}

// Start application
initialize();