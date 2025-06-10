const Vibe = require('../models/vibe.model');
const asyncHandler = require('express-async-handler');

module.exports.getAllVibes = asyncHandler(async (req, res) => {
    const vibes = await Vibe.find({ createdBy: req.user.id });
    res.status(200).json(vibes);
});

module.exports.getVibeById = asyncHandler(async (req, res) => {
    const vibe = await Vibe.findById(req.params.id);
    if (!vibe) {
        res.status(404);
        throw new Error('Vibe not found');
    }
    if (vibe.createdBy.toString() !== req.user.id) {
        res.status(401);
        throw new Error('User not authorized');
    }
    res.status(200).json(vibe);
});

module.exports.createVibe = asyncHandler(async (req, res) => {
    const { title, description, type, mood, intensity } = req.body;
    if (!title || !type || !mood || !intensity) {
        res.status(400);
        throw new Error('Please add all required fields');
    }
    const vibe = await Vibe.create({ ...req.body, createdBy: req.user.id });
    res.status(201).json(vibe);
});

module.exports.updateVibe = asyncHandler(async (req, res) => {
    let vibe = await Vibe.findById(req.params.id);
    if (!vibe) {
        res.status(404);
        throw new Error('Vibe not found');
    }
    if (vibe.createdBy.toString() !== req.user.id) {
        res.status(401);
        throw new Error('User not authorized');
    }
    const updatedVibe = await Vibe.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.status(200).json(updatedVibe);
});

module.exports.deleteVibe = asyncHandler(async (req, res) => {
    const vibe = await Vibe.findById(req.params.id);
    if (!vibe) {
        res.status(404);
        throw new Error('Vibe not found');
    }
    if (vibe.createdBy.toString() !== req.user.id) {
        res.status(401);
        throw new Error('User not authorized');
    }
    await vibe.deleteOne();
    res.status(200).json({ id: req.params.id, message: 'Vibe deleted' });
});