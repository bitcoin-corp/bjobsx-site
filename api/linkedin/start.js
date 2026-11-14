// GET /api/linkedin/start -> 302 to LinkedIn's sign-in (wallet session required). See _li.js.
import { start } from './_li.js';

export default (req, res) => start(req, res);
