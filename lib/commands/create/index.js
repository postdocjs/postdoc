/**
 * Creates new files in the project. Its only subcommand is `page`.
 *
 * @name create
 * @since 0.1.0
 */

import PostDocCommand from '../../command.js';
import createPageCommand from './page.js';

export default function createCreateCommand() {
  return new PostDocCommand('create')
    .description('Creates new files in the project, such as a page and its page test.')
    .addCommand(createPageCommand());
}
