/* Entry point for hosts whose default start command is `node index.js`.
   Abasthan (and Heroku-style builders) probe the repo root for this file, so
   it simply hands control to the real server in server/index.js. */
import './server/index.js';
