const fs = require('fs');
const path = require('path');

function safeRequire(modulePath) {
  const fullPath = path.resolve(__dirname, modulePath);
  if (fs.existsSync(fullPath + '.js')) {
    return require(fullPath);
  } else {
    console.warn(`⚠️ Warning: Module '${modulePath}' not found.`);
    return null;
  }
}

module.exports = { safeRequire };
