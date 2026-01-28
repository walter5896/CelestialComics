const fs = require("fs");

const env = {
  PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY,
};

const content = `window.__env = ${JSON.stringify(env)};`;

fs.writeFileSync("./js/env.js", content);

console.log("Generated js/env.js");
