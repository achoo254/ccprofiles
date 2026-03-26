#!/usr/bin/env node
'use strict';

/**
 * ccprofiles - Profile Manager (facade)
 *
 * Re-exports all commands from modular files.
 * Kept as single entry point for CLI binary and package.json "main".
 */

const commands = require('./profile-commands.cjs');
const extras = require('./profile-extras.cjs');

module.exports = { ...commands, ...extras };
