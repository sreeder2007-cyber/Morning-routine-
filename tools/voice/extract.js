const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const a = html.indexOf('/* CATALOG-START'), b = html.indexOf('/* CATALOG-END */');
if (a < 0 || b < 0) throw new Error('markers missing');
const block = html.slice(a, b);
const cat = new Function(block + '\nreturn buildCatalog();')();
fs.writeFileSync(process.argv[3], JSON.stringify(cat, null, 1));
console.log(Object.keys(cat).length, 'phrases');
