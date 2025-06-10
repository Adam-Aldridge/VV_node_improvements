const mongoose = require('mongoose');

const VibeSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, "Title is required"],
        minlength: [3, "Title must be at least 3 characters long"]
    },
    description: {
        type: String,
    },
    type: {
        type: String,
        required: [true, "Type is required"],
        enum: ['Music', 'Movie', 'Book', 'Game', 'Place', 'Person', 'Food', 'Other']
    },
    mood: {
        type: String,
        required: [true, "Mood is required"],
        enum: ['Happy', 'Sad', 'Energetic', 'Calm', 'Nostalgic', 'Inspired', 'Anxious', 'Other']
    },
    intensity: {
        type: Number,
        required: [true, "Intensity is required"],
        min: 1,
        max: 10
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Vibe', VibeSchema);