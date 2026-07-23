import { validateTaxonomyRegistries } from './validate-taxonomy.js';

const result = validateTaxonomyRegistries();
if (!result.valid) {
    for (const error of result.errors) console.error(`${error.code} ${error.registry} ${error.entryId} ${error.path}: ${error.message}`);
    process.exitCode = 1;
} else {
    console.log('Knowledge taxonomy valid.');
}
