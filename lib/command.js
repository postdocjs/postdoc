import { Command, Help } from 'commander';

import Logger from './logger.js';

class PostDocHelp extends Help {
  #typography = Logger.get().typography;

  formatHelp(command, helper) {
    const helpText = super.formatHelp(command, helper);

    return helpText
      .replace(/Commands:/g, this.#typography.grey('Commands:'))
      .replace(/Options:/g, this.#typography.gray('Options:'))
      .replace(/  help.+/g, '')
      .replace(/Usage:([^\n]+)/g, (_, text) => {
        const words = this.#typography.reset(text.trim()).split(' ');
        // The command's names, such as `postdoc create page`, come before its arguments.
        const nameCount = words.findIndex((word) => /^[[<]/.test(word));
        const names = nameCount === -1 ? words : words.slice(0, nameCount);
        const argumentPatterns = nameCount === -1 ? [] : words.slice(nameCount);

        return `Usage: ${this.#typography.bold(this.#typography.cyan(names.join(' ')))} ${this.#typography.magenta(argumentPatterns.join(' '))}`;
      });
  }

  subcommandDescription(command) {
    return this.#typography.gray(command.description());
  }

  // With commander's additions, such as "(default: 1280)".
  optionDescription(option) {
    return this.#typography.gray(super.optionDescription(option));
  }

  // Such as `--port <port> / -p`.
  optionTerm(option) {
    const value = option.flags.match(/[<[][^>\]]*[>\]]/)?.[0];
    const longFlag = option.long + (value ? ` ${value}` : '');
    const shortFlag = option.short ? option.short.replace(/(-\w+),?/, ' / $1') : '';
    const combinedFlag = longFlag + shortFlag;

    return combinedFlag.padEnd(35, ' ');
  }

  // Such as `postdoc create page [options]`, with the names of the commands it's under.
  commandUsage(cmd) {
    const names = [];

    for (let command = cmd; command; command = command.parent) {
      names.unshift(command.name());
    }

    const usage = cmd.usage();
    const commandUsage = usage ? ' ' + this.#typography.magenta(usage) : '';

    return (this.#typography.bold(this.#typography.cyan(names.join(' '))) + commandUsage);
  }

  subcommandTerm(cmd) {
    const hasAliases = cmd.alias() && cmd.alias().length > 0;

    return cmd.name() + (hasAliases ? ' / ' + cmd.alias() : '');
  }
}

export default class PostDocCommand extends Command {
  createHelp() {
    return new PostDocHelp();
  }
}
