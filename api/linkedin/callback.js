// GET /api/linkedin/callback -> checks state + session, stores the link, 302 back to /studio. See _li.js.
import { callback } from './_li.js';

export default (req, res) => callback(req, res);
