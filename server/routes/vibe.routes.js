const vibeController = require('../controllers/vibe.controller');
const { authenticate } = require('../middleware/auth.middleware');
const router = require('express').Router();

router.use(authenticate); // Protect all routes in this file

router.route('/')
    .get(vibeController.getAllVibes)
    .post(vibeController.createVibe);

router.route('/:id')
    .get(vibeController.getVibeById)
    .put(vibeController.updateVibe)
    .delete(vibeController.deleteVibe);

module.exports = router;