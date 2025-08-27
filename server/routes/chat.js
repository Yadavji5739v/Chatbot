const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');

// Get all chats for a user
router.get('/', async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(chats);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chats', error: error.message });
  }
});

// Get a specific chat
router.get('/:id', async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chat', error: error.message });
  }
});

// Create a new chat
router.post('/', async (req, res) => {
  try {
    const { title, initialMessage } = req.body;
    const chat = new Chat({
      userId: req.user.id,
      title: title || 'New Chat',
      messages: initialMessage ? [{ content: initialMessage, role: 'user' }] : []
    });
    const savedChat = await chat.save();
    res.status(201).json(savedChat);
  } catch (error) {
    res.status(500).json({ message: 'Error creating chat', error: error.message });
  }
});

// Add message to chat
router.post('/:id/messages', async (req, res) => {
  try {
    const { content, role } = req.body;
    const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    chat.messages.push({ content, role, timestamp: new Date() });
    const updatedChat = await chat.save();
    res.json(updatedChat);
  } catch (error) {
    res.status(500).json({ message: 'Error adding message', error: error.message });
  }
});

// Delete a chat
router.delete('/:id', async (req, res) => {
  try {
    const chat = await Chat.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting chat', error: error.message });
  }
});

module.exports = router;
