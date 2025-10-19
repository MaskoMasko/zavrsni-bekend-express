const path = require('path');

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  yearSemesters: { 1: [1, 2], 2: [3, 4], 3: [5, 6] },
  UPLOAD_ROOT: path.join(__dirname, '..', 'uploads'),
  ALLOWED_DOC_TYPES: new Set(['upisniObrazac', 'uplatnica', 'potvrdaUplatnice']),
};