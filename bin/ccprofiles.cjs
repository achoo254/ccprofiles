#!/usr/bin/env node
'use strict';

/**
 * ccprofiles CLI — entry point
 * Thin wrapper dispatching commands to lib/profile-manager.cjs
 */

const pm = require('../lib/profile-manager.cjs');

const args = process.argv.slice(2);
const command = args[0];
const name = args[1];

// Parse --email flag
const emailIdx = args.indexOf('--email');
const email = emailIdx !== -1 ? args[emailIdx + 1] : null;

// Flags
if (args.includes('--version') || args.includes('-v')) {
  const { version } = require('../package.json');
  console.log(version);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h') || !command) {
  pm.showHelp();
  process.exit(0);
}

// Command dispatch
switch (command) {
  case 'setup':     pm.cmdSetup(); break;
  case 'uninstall': pm.cmdUninstall(); break;
  case 'add':       pm.cmdAdd(name, email); break;
  case 'save':      pm.cmdSave(name); break;
  case 'switch':    pm.cmdSwitch(name); break;
  case 'list':      pm.cmdList(); break;
  case 'status':    pm.cmdStatus(); break;
  case 'delete':    pm.cmdDelete(name); break;
  case 'restore':   pm.cmdRestore(); break;
  default:
    console.error(`Unknown command: ${command}\n`);
    pm.showHelp();
    process.exit(1);
}
