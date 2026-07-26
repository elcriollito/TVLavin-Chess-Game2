import { spawnSync } from 'node:child_process';
import { runOptionalIntegration } from './regression-contracts.mjs';

const kind=process.argv[2];
const result=runOptionalIntegration(kind,{
  run:args=>spawnSync(process.execPath,args,{stdio:'inherit',env:process.env}).status??1
});
if(result.status==='skipped-external-dependency'){
  console.log(result.contract.skip);
  console.log(`Run: ${result.contract.run}`);
  console.log(`Dependency: ${result.contract.dependency}`);
}else if(result.status==='failed'){
  console.error(`${kind} integration failed after its required dependency was configured.`);
}
process.exitCode=result.exitCode;
