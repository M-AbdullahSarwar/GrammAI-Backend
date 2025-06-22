const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./db');
const User = require('./models/User');
const axios = require('axios');

const app = express();

const PORT = process.env.PORT || 3000;
// env.js
const isDev = process.env.NODE_ENV !== 'production';

const API_BASE_URL = 'http://192.168.2.5:5000/api'

// OpenAI API Key from the requirements
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const mongoURI = process.env.MONGO_URI;


// Middleware
app.use(cors());
app.use(express.json());


connectDB();



// Helper function to generate simple token
const generateToken = (username) => {
  return Buffer.from(`${username}:${Date.now()}`).toString('base64');
};

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Grammar Checker API is running!' });
});

// Signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }
    const newUser = new User({ username, password });
    await newUser.save();
    const token = generateToken(username);
    res.json({ success: true, message: 'Signup successful', token, user: { username } });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    const user = await User.findOne({ username });
    if (user && user.password === password) {
      const token = generateToken(username);
      res.json({
        success: true,
        message: 'Login successful',
        token: token,
        user: { username }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Grammar check endpoint
app.post('/api/grammar/check', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Text is required'
      });
    }

    // Call OpenAI API for grammar checking
    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a grammar and spelling checker. Analyze the provided text and return a JSON response with the following structure:
            {
              "correctedText": "the corrected version of the text",
              "errors": [
                {
                  "word": "incorrect word",
                  "suggestion": "correct word",
                  "type": "grammar|spelling",
                  "position": "position in text"
                }
              ]
            }
            Only return the JSON, no additional text.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let aiResponse;
    try {
      const responseText = openaiResponse.data.choices[0].message.content;
      aiResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      // Fallback response if parsing fails
      aiResponse = {
        correctedText: text,
        errors: []
      };
    }

    res.json({
      success: true,
      correctedText: aiResponse.correctedText || text,
      errors: aiResponse.errors || [],
      originalText: text
    });

  } catch (error) {
    console.error('Grammar check error:', error);
    
    if (error.response && error.response.status === 401) {
      res.status(500).json({
        success: false,
        message: 'OpenAI API authentication failed'
      });
    } else if (error.response && error.response.status === 429) {
      res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to check grammar. Please try again.'
      });
    }
  }
});

// Logout endpoint (optional - mainly for token invalidation in real apps)
app.post('/api/auth/logout', (req, res) => {
  // In a real app, you'd invalidate the token here
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Start server
app.listen(PORT,'0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;