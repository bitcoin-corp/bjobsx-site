// POST /api/linkedin/unlink -> removes the LinkedIn link from this wallet's profile. See _li.js.
import { unlink } from './_li.js';

export default (req, res) => unlink(req, res);
