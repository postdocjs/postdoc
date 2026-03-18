# Directory Structure and File Naming

Understanding the PostDoc's directory structure and file naming conventions is key to creating and managing your documentation site effectively. This section provides an overview of the standard PostDoc project structure and explains the purpose of each directory and file.

## Standard Directory Structure

A typical PostDoc project might look something like this:

```bash
├── src/
│   ├── _layouts/
│   ├── _includes/
│   ├── _data/
│   ├── guide/
│   │   ├── index.md
│   │   ├── getting-started.md
│   ├── api/
│   │   ├── index.md
│   │   ├── [slug].md
│   ├── index.md
│   ├── 404.md
├── static/
├── package.json
├── postdoc.config.js
```

### `src` Directory

The `src` directory is the heart of your PostDoc site. It contains all the Markdown and HTML files that make up your site content. The directory structure inside `src` defines the routing of your website as explained in the [How Routing Works in a PostDoc Website](#how-routing-works-in-a-postdoc-website) section.

### `_layouts` Directory

This directory contains EJS templates used to structure the pages of your site. PostDoc uses these layouts to wrap your Markdown or HTML content.

### `_includes` Directory

This directory holds EJS partials, reusable snippets of code to be used across different layouts or pages.

### `_data` Directory

This directory is for storing data files in JSON or YAML format. These files can be used to supply data to your templates.

### `guide` and `api` Directories

These are just examples of content directories. You can create directories that suit your content structure. Remember, the structure of these directories determines the URL structure of your website.

### `index.md` and `404.md`

These are special files. `index.md` serves as the homepage of your site. `404.md` is the page that users see when they navigate to a non-existing route on your website.

## `static` Directory

This directory is for storing static files like images, stylesheets, and scripts. The content of this directory is copied to the root of the built site as is.

## `package.json`

This is a standard Node.js file that holds metadata relevant to the project and lists its dependencies.

## `postdoc.config.js`

This is the configuration file for your PostDoc site. Here you can specify options like the site's title, description, base URL, and much more.

Remember, this is just a standard structure. PostDoc is flexible and allows you to organize your project in a way that best suits your needs. You can add more directories or files as your project requires.