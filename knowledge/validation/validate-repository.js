import { KNOWLEDGE_UNIT_REGISTRY } from '../indexes/manifest.js';
import { validateKnowledgeRepository } from './validate-knowledge.js';

const result = validateKnowledgeRepository(KNOWLEDGE_UNIT_REGISTRY);
if (!result.valid) {
    for (const error of result.errors) console.error(`${error.code} ${error.unitId} ${error.path}: ${error.message}`);
    process.exitCode = 1;
} else {
    console.log(`Knowledge repository valid (${KNOWLEDGE_UNIT_REGISTRY.length} unit).`);
}
