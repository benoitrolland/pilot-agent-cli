#!/usr/bin/env node

/**
 * Pilot Agent CLI - Entry point for global installation
 * This file serves as the main executable when installed globally via npm
 */

const path = require('path');

// Import the main CLI module
const mainCli = path.join(__dirname, '..', 'pilot-agent-cli.js');

// Execute the main CLI with all passed arguments
require(mainCli);
