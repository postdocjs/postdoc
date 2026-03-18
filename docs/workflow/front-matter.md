# Working with Front-Matter

Front-matter is a section at the top of a Markdown file that can be used to store metadata for the page. The section is surrounded by `---` lines and uses YAML syntax. PostDoc can extract and use this metadata to customize the rendering of your pages.

## Basic Structure

Here's an example of a file with front-matter:

```markdown
---
title: My Page
description: This is a brief description of my page.
date: 2023-05-20
---

# This is my page

This is the content of my page.
```

In this example, the front-matter defines a `title`, `description`, and `date` for the page.

## Using Front-Matter in Templates

In your PostDoc templates, you can access the front-matter values of the current page using the `page` object. For example, you could use the `title` value in a template like this:

```ejs
<h1><%= page.title %></h1>
```

This will render the title of the page as an H1 heading.

## Available Front-Matter Variables

PostDoc defines a few standard front-matter variables:

- `title`: The title of the page. This will be used as the HTML `<title>` by default.
- `description`: A brief description of the page. This can be used for SEO purposes, or just to give users a preview of the page's content.
- `date`: The date associated with the page. This could be the publication date, last update date, or any other date you find relevant.

You're not limited to these variables though. You can define any variables you like in the front-matter, and they will be available in your templates through the `page` object. This gives you a lot of flexibility to customize your pages based on the metadata.

## Default Values

You can set default values for front-matter variables in your PostDoc configuration file. If a page doesn't define a particular variable in its front-matter, the default value will be used.

For example, you could define a default `author` like this:

```javascript
// postdoc.config.js
module.exports = {
  frontmatterDefaults: {
    author: 'John Doe',
  },
  // ...
};
```

In this case, if a page doesn't define an `author` in its front-matter, `'John Doe'` will be used as the author.