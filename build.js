const fs = require("fs");

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
};

const content = `window.__env = ${JSON.stringify(env)};`;

fs.writeFileSync("./js/env.js", content);

console.log("Generated js/env.js");
