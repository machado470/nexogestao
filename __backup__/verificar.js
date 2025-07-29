const fs = require('fs');

const arquivos = [
  'src/App.tsx',
  'src/routes/index.ts',
  'src/pages/Auth.tsx',
  'src/pages/Dashboard.tsx',
];

console.log('📦 Verificando arquivos essenciais:\\n');

arquivos.forEach((arquivo) => {
  if (fs.existsSync(arquivo)) {
    console.log(`✅ ${arquivo} encontrado`);
  } else {
    console.log(`❌ ${arquivo} faltando`);
  }
});
