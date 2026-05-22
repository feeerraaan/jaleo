const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./jaleo.db');
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS grupos (groupId TEXT PRIMARY KEY, accessToken TEXT, refreshToken TEXT)");
});
module.exports = db