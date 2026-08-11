require('dotenv').config();
const axios = require('axios');
const db = require('../db');

const version = process.env.FACEBOOK_GRAPH_TEST_VERSION || process.env.GRAPH_API_VERSION || 'v19.0';
const base = `https://graph.facebook.com/${version}`;

(async () => {
  const failures = [];
  for (const listed of db.listPages()) {
    const page = db.getPageById(listed.id);
    try {
      await axios.get(`${base}/${page.page_id}`, { params: { fields: 'id,name', access_token: page.access_token }, timeout: 30000 });
    } catch (error) {
      failures.push({ page: page.name, error: error.response?.data?.error?.message || error.message });
    }
  }
  console.log(JSON.stringify({ version, checked: db.listPages().length, failed: failures.length, failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
})();
