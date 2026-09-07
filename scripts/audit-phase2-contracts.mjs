#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const files = [
  'apps/web/server/routers/customers.ts',
  'apps/web/server/routers/executions.ts',
  'apps/web/server/routers/onboarding.ts',
  'apps/web/server/routers/whatsapp.ts',
  'apps/web/server/routers/ai.ts',
  'apps/web/server/routers/dashboard.ts',
  'apps/web/server/routers/operational.ts',
  'apps/web/server/routers/finance.ts',
  'apps/web/server/routers/timeline.ts',
  'apps/web/server/routers/service-orders.ts',
  'apps/api/src/execution/execution.controller.ts',
  'apps/api/src/whatsapp/dto/whatsapp.dto.ts',
]

const patterns = [
  ['z.any()', /z\.any\(\)/g],
  ['z.unknown()', /z\.unknown\(\)/g],
  ['Record<string, any>', /Record<string,\s*any>/g],
  ['TypeScript any', /(?:\bas any\b|:\s*any\b|<any>)/g],
]

let openContractCount = 0
console.log('# Phase 2 contract audit')
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const lines = source.split('\n')
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source))) {
      const line = source.slice(0, match.index).split('\n').length
      console.log(`${file}:${line}\t${label}\t${lines[line - 1].trim()}`)
      openContractCount += 1
    }
  }
}

const routers = files.filter((file) => file.startsWith('apps/web/server/routers/'))
let procedureCount = 0
let outputSchemaCount = 0
for (const file of routers) {
  const source = readFileSync(file, 'utf8')
  procedureCount += (source.match(/protectedProcedure/g) ?? []).length
  outputSchemaCount += (source.match(/\.output\(/g) ?? []).length
}

console.log(`\nopen_contract_markers=${openContractCount}`)
console.log(`protected_procedure_markers=${procedureCount}`)
console.log(`explicit_output_schema_markers=${outputSchemaCount}`)
console.log('NOTE: marker counts are discovery aids; the reviewed classification is docs/audits/2026/PHASE_2_CONTRACTS_ISOLATION_READINESS.md')

if (openContractCount === 0) {
  console.error('Unexpectedly found no open contract markers; review the audit scope or parser.')
  process.exitCode = 1
}
