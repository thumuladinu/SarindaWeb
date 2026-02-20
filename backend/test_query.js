const pool = require('./index.js').pool || require('./index').pool;
// instead let's just use raw mysql with correct env reading since index.js exports app, not pool
