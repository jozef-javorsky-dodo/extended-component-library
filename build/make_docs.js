/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFileSync, writeFileSync} from 'fs';
import {markdownTable} from 'markdown-table';
import {dirname, join, resolve, sep as pathSep} from 'path';

const BASE_PATH = resolve('.');
const PLACE_BUILDING_BLOCKS_DIR = join('src', 'place_building_blocks');

const GLOBAL_STYLE_TOKENS = new Set([
  '--gmpx-color-surface',
  '--gmpx-color-on-surface',
  '--gmpx-color-on-surface-variant',
  '--gmpx-color-primary',
  '--gmpx-color-on-primary',
  '--gmpx-font-family-base',
  '--gmpx-font-family-headings',
  '--gmpx-font-size-base',
]);
const CSS_CUSTOM_PROPERTY_DEFAULTS = {
  '--gmpx-color-surface': '#fff',
  '--gmpx-color-on-surface': '#212121',
  '--gmpx-color-on-surface-variant': '#757575',
  '--gmpx-color-primary': '#1e88e5',
  '--gmpx-color-on-primary': '#fff',
  '--gmpx-font-family-base': '\'Google Sans Text\', sans-serif',
  '--gmpx-font-family-headings': '--gmpx-font-family-base',
  '--gmpx-font-size-base': '0.875rem',
  '--gmpx-rating-color': '#ffb300',
  '--gmpx-rating-color-empty': '#e0e0e0',
};
const COMPONENTS_STYLED_AS_TEXT = new Set([
  'PlaceAttribution',
  'PlaceFieldLink',
  'PlaceFieldText',
  'PlaceOpeningHours',
  'PlacePriceLevel',
]);
const FRIENDLY_NAMES = {
  'APILoader': 'API Loader',
  'IconButton': 'Icon Button',
  'OverlayLayout': 'Overlay Layout',
  'PlaceOverview': 'Place Overview',
  'PlacePicker': 'Place Picker',
  'SplitLayout': 'Split Layout',
  'PlaceDataProvider': 'Place Data Provider',
  'PlaceAttribution': 'Attribution',
  'PlaceDirectionsButton': 'Directions Button',
  'PlaceFieldBoolean': 'Boolean Place Field',
  'PlaceFieldLink': 'Place Link',
  'PlaceFieldText': 'Textual Place Field',
  'PlaceOpeningHours': 'Opening Hours',
  'PlacePhotoGallery': 'Photo Gallery',
  'PlacePriceLevel': 'Price Level',
  'PlaceRating': 'Rating',
  'PlaceReviews': 'Reviews',
};

/**
 * Replaces characters which won't render properly in a Markdown table.
 * @param {string} text Text to sanitize.
 * @return {string}
 */
function sanitizeForMarkdownTable(text) {
  if (!text) return '';
  return text.replaceAll('|', '\\|')
      .replaceAll('\n\n', '<br/><br/>')
      .replaceAll('\n', ' ');
}

/**
 * Formats the given text as a Markdown inline code segment.
 * @param {string} text
 * @returns {string}
 */
function asCode(text) {
  return '`' + text + '`';
}

/**
 * Creates a new Markdown paragraph for the given text.
 * @param {string} text
 * @returns {string}
 */
function newParagraph(text) {
  return text + '\n\n';
}

/**
 * Generates a Markdown header at the given level.
 * @param {number} level Markdown header level, 1 -> '#', 2 -> '##', etc.
 * @param {string} text Header text
 * @returns {string} a Markdown string
 */
function header(level, text) {
  return '#'.repeat(level) + ' ' + text;
}

/**
 * Returns only the first paragraph of the given text.
 * @param {string} text
 * @returns {string}
 */
function firstParagraphOf(text) {
  return text.split('\n\n')[0];
}

/**
 * Filters objects in the Custom Elements Manifest that we want to include in
 * the README.
 * @param {import('custom-elements-manifest/schema').Declaration} declaration
 * @param {import('custom-elements-manifest/schema').Module} module
 * @returns {boolean}
 */
function shouldDocumentDeclaration(declaration, module) {
  return (
      declaration.kind === 'class' && declaration.customElement &&
      declaration.tagName && !declaration.tagName.endsWith('-internal'));
}

/**
 * Returns publicly-visible members inside the given declaration, corresponding
 * to the specified member kind.
 * @param {import('custom-elements-manifest/schema').Declaration} declaration
 * @param {string} kind
 * @returns
 */
function getPublicMembers(declaration, kind) {
  return (declaration.members || [])
      .filter((x) => x.kind === kind && x.privacy === undefined);
}

/**
 * Determines which README file a module should be documented in.
 * @param {import('custom-elements-manifest/schema').Module} module
 * @returns {string} The path of the README file
 */
function getReadmeForModule(module) {
  const pathParts = module.path.split('/');
  return join(...pathParts.slice(0, -1), 'README.md');
}

/**
 * Reads content from README file with the specified base path and section name.
 * @param {sring} basePath
 * @param {string} section
 * @returns {string} Readme content, or empty string if file is not found
 */
function getStaticContent(basePath, section) {
  const filePath = join(basePath, 'doc_src', `README.${section}.md`);
  try {
    return newParagraph(readFileSync(filePath));
  } catch (e) {
    return '';
  }
}

/**
 * For a given piece of generated content, append a static header and/or
 * footer, if they exist.
 * @param {string} basePath
 * @param {string} generatedContent
 * @returns {string} Readme content
 */
function appendStaticHeaderAndFooter(basePath, generatedContent) {
  return getStaticContent(basePath, 'header') + newParagraph(generatedContent) +
      getStaticContent(basePath, 'footer');
}

let _packageData;

/**
 * Returns data found in package.json (cached).
 */
function getPackageData() {
  if (_packageData) {
    return _packageData;
  }
  _packageData = JSON.parse(readFileSync('package.json'));
  return _packageData;
}

let _exportsLookup;

/**
 * Provides a lookup mapping a JS file path to its NPM export alias.
 * @returns {Map}
 */
function getNpmExportsLookup() {
  if (_exportsLookup) {
    return _exportsLookup;
  }
  const npmExports = getPackageData().exports;
  _exportsLookup = new Map();
  for (let [alias, exportPath] of Object.entries(npmExports)) {
    _exportsLookup.set(exportPath, alias);
  }
  return _exportsLookup;
}

/**
 * Creates instructions for how to import this component.
 * @param {number} headerLevel
 * @param {string} modulePath
 * @param {string} className
 * @param {string} tagName
 * @returns {string}
 */
function makeImportSection(headerLevel, modulePath, className, tagName) {
  let md = '';
  const npmExports = getNpmExportsLookup();
  const npmPath = './' + modulePath.replace(/^src/, 'lib').replace(/ts$/, 'js');

  // Only create a section if this component is specifically exported.
  if (!npmExports.has(npmPath)) {
    return md;
  }

  const npmAlias = npmExports.get(npmPath).replace(/^\.\//, '');
  const packageName = getPackageData().name;

  md += newParagraph(header(headerLevel, 'Importing'));

  md += newParagraph(
      'When loading the library with a &lt;script&gt; tag (referencing the CDN bundle), please refer to the instructions in the root-level Readme. You do not need to take additional steps to use this component.');

  md += newParagraph(
      `When bundling your dependencies and you want to include \`<${
          tagName}>\` on a page:`);
  md += newParagraph(
      '```\n' +
      `import '${packageName}/${npmAlias}';` +
      '\n```');


  md += newParagraph(
      `When bundling your dependencies and you need to access the class \`${
          className}\` directly (less common):`);
  md += newParagraph(
      '```\n' +
      `import { ${className} } from '${packageName}/${npmAlias}';` +
      '\n```');

  return md;
}

/**
 * Creates documentation section on APIs and SKUs used by a component.
 * @param {string} basePath
 * @param {number} headerLevel
 * @returns {string}
 */
function makeApiSkuSection(basePath, headerLevel) {
  const content = getStaticContent(basePath, 'apis');
  if (!content) return '';

  let md = newParagraph(header(headerLevel, 'APIs and Pricing'));

  md += newParagraph(
      'In addition to the [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript?utm_source=github&utm_medium=documentation&utm_campaign=&utm_content=web_components), this component relies on the following Google Maps Platform APIs which may incur cost and must be enabled.');

  md += content;

  return md;
}

/**
 * Creates documentation section for code examples.
 * @param {string} basePath
 * @param {number} headerLevel
 * @returns {string}
 */
function makeExamplesSection(basePath, headerLevel) {
  const content = getStaticContent(basePath, 'examples');
  if (!content) return '';

  return newParagraph(header(headerLevel, 'Examples')) + newParagraph(content);
}

/**
 * Sorts a table (including a header row) by the first column.
 *
 * @param {Array<Array<string>>} table
 * @returns {Array<Array<string>>}
 */
function sortTable(table) {
  const header = table[0];
  const rows = table.slice(1);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return [header, ...rows];
}

/**
 * Adds a row to a components inventory table.
 * @param {Array<Array<string>>} table
 * @param {string} componentName
 * @param {string} docUrl Path to this component's refdoc
 * @param {string} description Component description; only the first paragraph
 *     is used.
 */
function addInventoryRow(table, componentName, docUrl, description) {
  table.push([
    `[${componentName}](${docUrl})`,
    sanitizeForMarkdownTable(firstParagraphOf(description)),
  ]);
}

function generateBreadcrumbs(readmeDir) {
  // Create a relative path without a beginning slash, e.g. "api_loader"
  const relativePath = readmeDir.slice(BASE_PATH.length + 1);
  if (!relativePath) return '';
  const pathSegments = relativePath.split(pathSep);

  const relativeReadmeUrl =
      (toLevel) => {
        let url = '';
        for (let i = 0; i < (pathSegments.length - toLevel); i++) {
          url += '../';
        }
        return url + 'README.md';
      }

  // https://stackoverflow.com/a/64489760
  const titleCase = (s) =>
      s.replace(/^[-_]*(.)/, (_, c) => c.toUpperCase())
          .replace(/[-_]+(.)/g, (_, c) => ' ' + c.toUpperCase());

  const breadcrumbs = [`[Extended Component Library](${relativeReadmeUrl(0)})`];
  for (let i = 0; i < (pathSegments.length - 1); i++) {
    if (pathSegments[i] === 'src') continue;
    breadcrumbs.push(
        `[${titleCase(pathSegments[i])}](${relativeReadmeUrl(i + 1)})`);
  }
  return newParagraph(breadcrumbs.join(' » '));
}

/**
 * Writes a Readme file that contains the provided Markdown.
 * @param {string} basePath
 * @param {string} content Markdown content
 */
function writeReadme(basePath, content) {
  const readmePath = join(basePath, 'README.md');
  const md = generateBreadcrumbs(basePath) +
      appendStaticHeaderAndFooter(basePath, content);
  try {
    writeFileSync(readmePath, md);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}


/**
 * Converts a Custom Elements Manifest declaration (e.g. a custom element class)
 * into a Markdown description.
 * @param {import('custom-elements-manifest/schema').Declaration} declaration
 * @param {import('custom-elements-manifest/schema').Module} module
 * @param {number} headerLevel Markdown header level for the overall element, 1
 *     -> "#", 2 -> "##", etc.
 * @returns {string}
 */
function declarationToMarkdown(declaration, module, headerLevel) {
  let headerName = `${asCode(`<${declaration.tagName}>`)} (as class ${
      asCode(declaration.name)})`;
  if (FRIENDLY_NAMES[declaration.name]) {
    headerName = FRIENDLY_NAMES[declaration.name] + ': ' + headerName;
  }
  let md = newParagraph(header(headerLevel, headerName));
  md += newParagraph(declaration.description);

  if (declaration.superclass &&
      declaration.superclass.name === 'PlaceDataConsumer') {
    md += newParagraph(
        '> This component is designed to work with a Place Data Provider; please see [Place Building Blocks](../README.md) for more information.');
  }

  const importSection = makeImportSection(
      headerLevel + 1, module.path, declaration.name, declaration.tagName);
  if (importSection) {
    md += importSection;
  }

  const fields = getPublicMembers(declaration, 'field');
  if (fields.length > 0) {
    md += newParagraph(header(headerLevel + 1, 'Attributes and properties'));
    const fieldsTable = [
      [
        'Attribute',
        'Property',
        'Property type',
        'Description',
        'Default',
        'Reflects?',
      ],
    ];
    for (const field of fields) {
      fieldsTable.push([
        field.attribute ? asCode(field.attribute) : '',
        field.name ? asCode(field.name) : '',
        field?.type?.text ? asCode(sanitizeForMarkdownTable(field.type.text)) :
                            '',
        sanitizeForMarkdownTable(field.description || ''),
        field.default ? asCode(sanitizeForMarkdownTable(field.default)) : '',
        field.reflects ? '✅' : '❌',
      ]);
    }
    md += newParagraph(markdownTable(fieldsTable));
  }
  if (declaration.slots) {
    md += newParagraph(header(headerLevel + 1, 'Slots'));
    const hasNamedSlot = declaration.slots.some(x => x.name);
    if (hasNamedSlot) {
      md += newParagraph(
          `This component uses [named slots](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots#adding_flexibility_with_slots) to accept custom content. To place content in a named slot, set the content as an HTML child of \`<${
              declaration
                  .tagName}>\` and add the attribute \`slot="SLOT_NAME"\` to it.`);
    }
    const slotsTable = [['Slot name', 'Description']];
    for (const slot of declaration.slots) {
      slotsTable.push([
        slot.name || '*(default)*',
        (slot.summary || '') + (slot.description || ''),
      ]);
    }
    md += newParagraph(markdownTable(slotsTable));
  }
  const methods = getPublicMembers(declaration, 'method');
  if (methods.length > 0) {
    md += newParagraph(header(headerLevel + 1, 'Methods'));
    for (const method of methods) {
      const argsSummary =
          (method.parameters || []).map((x) => x.name).join(', ');
      let fullMethodCall = `${method.name}(${argsSummary})`;
      let staticComment = '';
      if (method.static) {
        fullMethodCall = `${declaration.name}.${fullMethodCall}`;
        staticComment = ' (static method)';
      }
      md += newParagraph(
          header(headerLevel + 2, asCode(fullMethodCall) + staticComment));
      md += newParagraph(method.description);
      if (method.return) {
        md += newParagraph(`**Returns:** ${asCode(method.return.type.text)}`);
      }
      if (method.parameters) {
        md += newParagraph('**Parameters:**');
        const paramsTable = [['Name', 'Optional?', 'Type', 'Description']];
        for (const param of method.parameters) {
          paramsTable.push([
            asCode(param.name),
            param.optional ? 'optional' : '',
            asCode(sanitizeForMarkdownTable(param.type.text)),
            sanitizeForMarkdownTable(param.description),
          ]);
        }
        md += newParagraph(markdownTable(paramsTable));
      }
    }
  }
  if (declaration.events) {
    md += newParagraph(header(headerLevel + 1, 'Events'));
    const eventsTable = [['Name', 'Type', 'Description']];
    for (const event of declaration.events) {
      eventsTable.push([
        asCode(event.name),
        asCode(sanitizeForMarkdownTable(event.type.text)),
        sanitizeForMarkdownTable(event.description),
      ]);
    }
    md += newParagraph(markdownTable(eventsTable));
  }

  const hasCustomStyling =
      !!(declaration.cssProperties || declaration.cssParts);
  const hasSimpleStyling = COMPONENTS_STYLED_AS_TEXT.has(declaration.name);
  if (hasCustomStyling || hasSimpleStyling) {
    md += newParagraph(header(headerLevel + 1, 'Styling'));
    if (hasSimpleStyling) {
      md += newParagraph(
          `This is a low-level component designed to be styled with built-in CSS properties. For most styling purposes, it is equivalent to a \`<span>\` element.`);
      md += newParagraph(
          `For example, by default this component will inherit the color of its parent element. However, you can change the color by writing the following CSS:`);
      md += newParagraph(`
\`\`\`css
${declaration.tagName} {
  color: blue;
}
\`\`\``);
    } else {
      md += newParagraph(
          `You can use most built-in CSS properties to control the positioning or display of this component, similar to a \`<span>\` element. The component also supports the following styling inputs for more customization:`);

      if (declaration.cssProperties) {
        md += newParagraph(header(headerLevel + 2, 'CSS Custom Properties'));
        const cssTable = [['Name', 'Default', 'Description']];
        let usesGlobalStyles = false;
        for (const customProp of declaration.cssProperties) {
          let description = customProp.summary ?? '';
          description += customProp.description ?? '';
          const styleDefault = CSS_CUSTOM_PROPERTY_DEFAULTS[customProp.name];
          let defaultValue = customProp.default || styleDefault || '';
          if (GLOBAL_STYLE_TOKENS.has(customProp.name)) {
            description += ' 🌎';
            usesGlobalStyles |= true;
          }
          cssTable.push([
            asCode(customProp.name), asCode(defaultValue),
            sanitizeForMarkdownTable(description)
          ]);
        }
        md += newParagraph(markdownTable(cssTable));
        if (usesGlobalStyles) {
          md += newParagraph(`🌎 _indicates a global style token shared by
                                    multiple components. Please see the library
                                    Readme for more information._`);
        }
      }
      if (declaration.cssParts) {
        md += newParagraph(header(headerLevel + 2, 'CSS Parts'));
        let partsTable = [['Name', 'Description']];
        for (const part of declaration.cssParts) {
          partsTable.push(
              [asCode(part.name), sanitizeForMarkdownTable(part.description)]);
        }
        md += newParagraph(markdownTable(partsTable));
      }
    }
  }

  return md;
}

/**
 * Generates a set of README documentations for this package based on its
 * Custom Elements Manifest and writes contents to the file system.
 * @param {import('custom-elements-manifest/schema').Package} manifest
 */
function makeDocs(manifest) {
  // Organize modules by the README file they should be documented in.
  const moduleReadmes = new Map();
  for (const module of manifest.modules) {
    const moduleReadme = getReadmeForModule(module);
    if (!moduleReadmes.has(moduleReadme)) {
      moduleReadmes.set(moduleReadme, []);
    }
    moduleReadmes.get(moduleReadme).push(module);
  }

  // For each README file, generate contents from the modules assigned to
  // it. At the same time, add the file's link to a table of contents.
  const rootInventoryTable = [['Component', 'Description']];
  const placeDataProviderInventoryTable = [['Component', 'Description']];
  const placeConsumerInventoryTable = [['Component', 'Description']];
  for (const [filename, modules] of moduleReadmes.entries()) {
    let md = '';
    for (const module of modules) {
      const dirPath = join(BASE_PATH, dirname(module.path));
      const manualHeader = getStaticContent(dirPath, 'header');

      // If there's a header, assume it includes the top-level Markdown
      // title.
      const declHeaderLevel = manualHeader ? 2 : 1;
      md += manualHeader ? newParagraph(manualHeader) : '';

      for (const declaration of module.declarations) {
        if (shouldDocumentDeclaration(declaration, module)) {
          md += newParagraph(declarationToMarkdown(
              declaration, module, /* headerLevel= */ declHeaderLevel));

          const componentName = asCode(
              declaration.tagName ? '<' + declaration.tagName + '>' :
                                    declaration.name);

          // Place Building Block components get their own mini-inventory
          if (filename.startsWith(PLACE_BUILDING_BLOCKS_DIR)) {
            const relativeFilename =
                filename.substring(PLACE_BUILDING_BLOCKS_DIR.length + 1);
            if (declaration.name === 'PlaceDataProvider') {
              addInventoryRow(
                  placeDataProviderInventoryTable, componentName,
                  relativeFilename, declaration.description);
            } else {
              addInventoryRow(
                  placeConsumerInventoryTable, componentName, relativeFilename,
                  declaration.description);
            }
          } else {
            addInventoryRow(
                rootInventoryTable, componentName, filename,
                declaration.description);
          }

          md += makeExamplesSection(
              dirPath, /* headerLevel = */ declHeaderLevel + 1);

          md += makeApiSkuSection(
              dirPath, /* headerLevel= */ declHeaderLevel + 1);
        }
      }
    }
    if (md) {
      md = generateBreadcrumbs(dirname(join(BASE_PATH, filename))) + md;
      try {
        writeFileSync(join(BASE_PATH, filename), md);
      } catch (e) {
        console.error(e);
        process.exit(1);
      }
    }
  }

  // Write a group README for Place Building Blocks components.
  const buildingBlocksInventory = newParagraph(header(2, 'Data provider')) +
      newParagraph(markdownTable(sortTable(placeDataProviderInventoryTable))) +
      newParagraph(header(2, 'Details components')) +
      newParagraph(markdownTable(sortTable(placeConsumerInventoryTable)));
  writeReadme(
      join(BASE_PATH, PLACE_BUILDING_BLOCKS_DIR), buildingBlocksInventory);

  // Finally, write a package-level README with a table of contents.
  writeReadme(
      BASE_PATH, markdownTable([
        ...sortTable(rootInventoryTable),
        [
          `[Place building blocks](${PLACE_BUILDING_BLOCKS_DIR}/README.md)`,
          'The place data provider component, along with individual place details components, lets you choose how to display Google Maps place information like opening hours, star reviews, and photos in a new, custom view. '
        ]
      ]));
}

makeDocs(JSON.parse(readFileSync('custom-elements.json')));
