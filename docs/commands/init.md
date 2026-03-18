# `postdoc init`

This command is used to initialize a new PostDoc project. It sets up the necessary directories and files to get you started with PostDoc.

## Usage

```bash
postdoc init [template-name] [project-name]
```

## Arguments

### `template-name`

The name of the template to be used for the new project. This argument is optional. If no template name is provided, the default template `starter` is used. Other available templates are `blog`, `docs`, `portfolio`.

### `project-name`

The name of the new project. This will also be the name of the directory created for the new project.

## Examples

To create a new PostDoc project with the default template, you would run:

```bash
postdoc init my-website
```

To create a new PostDoc project using the `blog` template, you would run:

```bash
postdoc init blog my-blog
```

## Behavior

The `postdoc init` command does the following:

- Creates a new directory named `project-name` in the current directory.
- Copies the template files from the specified `template-name` into the new `project-name` directory.
- Installs the necessary dependencies for the new PostDoc project by running `npm install`.
- Outputs a success message with instructions to navigate into the new project directory and start the development server.

The generated project includes the following directories and files:

- `public/`: This directory is for static assets.
- `src/pages/`: This directory contains your Markdown files.
- `src/layouts/`: This directory contains your EJS templates.
- `src/styles/`: This directory is for your CSS files.
- `postdoc.config.js`: This is the configuration file for your PostDoc project.

Once the `postdoc init` command has completed, you can navigate into your new project directory and start the development server using `postdoc dev`.
