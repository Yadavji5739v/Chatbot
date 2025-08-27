const natural = require('natural');
const compromise = require('compromise');
const Sentiment = require('sentiment');
const OpenAI = require('openai');
const { getCache, setCache } = require('../config/redis');

// Initialize OpenAI client (only if API key is available)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// Initialize sentiment analyzer
const sentiment = new Sentiment();

// Initialize tokenizer
const tokenizer = new natural.WordTokenizer();

class AIService {
  constructor() {
    this.intentClassifier = null;
    this.entityExtractor = null;
    this.responseTemplates = new Map();
    this.contextMemory = new Map();
    this.learningData = [];
    
    this.initializeModels();
    this.loadResponseTemplates();
  }

  /**
   * Initialize AI models and classifiers
   */
  async initializeModels() {
    try {
      // Initialize intent classifier with training data
      this.intentClassifier = new natural.BayesClassifier();
      
      // Train with common intents
      this.trainIntentClassifier();
      
      // Initialize entity extractor
      this.entityExtractor = compromise;
      
      console.log('🤖 AI models initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing AI models:', error);
    }
  }

  /**
   * Train the intent classifier with sample data
   */
  trainIntentClassifier() {
    // Greeting intents
    this.intentClassifier.addDocument('hello', 'greeting');
    this.intentClassifier.addDocument('hi', 'greeting');
    this.intentClassifier.addDocument('hey', 'greeting');
    this.intentClassifier.addDocument('good morning', 'greeting');
    this.intentClassifier.addDocument('good afternoon', 'greeting');
    this.intentClassifier.addDocument('good evening', 'greeting');
    this.intentClassifier.addDocument('sup', 'greeting');
    this.intentClassifier.addDocument('yo', 'greeting');
    this.intentClassifier.addDocument('morning', 'greeting');
    this.intentClassifier.addDocument('afternoon', 'greeting');

    // Farewell intents
    this.intentClassifier.addDocument('goodbye', 'farewell');
    this.intentClassifier.addDocument('bye', 'farewell');
    this.intentClassifier.addDocument('see you', 'farewell');
    this.intentClassifier.addDocument('talk to you later', 'farewell');
    this.intentClassifier.addDocument('later', 'farewell');
    this.intentClassifier.addDocument('take care', 'farewell');
    this.intentClassifier.addDocument('have a good day', 'farewell');
    this.intentClassifier.addDocument('good night', 'farewell');

    // Help intents
    this.intentClassifier.addDocument('help', 'help');
    this.intentClassifier.addDocument('support', 'help');
    this.intentClassifier.addDocument('assist', 'help');
    this.intentClassifier.addDocument('what can you do', 'help');
    this.intentClassifier.addDocument('how can you help', 'help');
    this.intentClassifier.addDocument('what are your capabilities', 'help');
    this.intentClassifier.addDocument('guide me', 'help');
    this.intentClassifier.addDocument('show me', 'help');

    // Question intents
    this.intentClassifier.addDocument('what is', 'question');
    this.intentClassifier.addDocument('how to', 'question');
    this.intentClassifier.addDocument('can you explain', 'question');
    this.intentClassifier.addDocument('tell me about', 'question');
    this.intentClassifier.addDocument('what does', 'question');
    this.intentClassifier.addDocument('how does', 'question');
    this.intentClassifier.addDocument('why does', 'question');
    this.intentClassifier.addDocument('when does', 'question');
    this.intentClassifier.addDocument('where is', 'question');
    this.intentClassifier.addDocument('who is', 'question');

    // Information request intents
    this.intentClassifier.addDocument('i need information about', 'information_request');
    this.intentClassifier.addDocument('can you tell me about', 'information_request');
    this.intentClassifier.addDocument('i want to know about', 'information_request');
    this.intentClassifier.addDocument('give me details about', 'information_request');
    this.intentClassifier.addDocument('find information on', 'information_request');
    this.intentClassifier.addDocument('search for', 'information_request');
    this.intentClassifier.addDocument('look up', 'information_request');

    // Task request intents
    this.intentClassifier.addDocument('can you help me with', 'task_request');
    this.intentClassifier.addDocument('i need help with', 'task_request');
    this.intentClassifier.addDocument('assist me with', 'task_request');
    this.intentClassifier.addDocument('guide me through', 'task_request');
    this.intentClassifier.addDocument('walk me through', 'task_request');
    this.intentClassifier.addDocument('help me do', 'task_request');
    this.intentClassifier.addDocument('i want to', 'task_request');

    // Learning intents
    this.intentClassifier.addDocument('i want to learn', 'learning');
    this.intentClassifier.addDocument('teach me about', 'learning');
    this.intentClassifier.addDocument('explain to me', 'learning');
    this.intentClassifier.addDocument('i don\'t understand', 'learning');
    this.intentClassifier.addDocument('break this down', 'learning');
    this.intentClassifier.addDocument('simplify this', 'learning');
    this.intentClassifier.addDocument('give me an example', 'learning');

    // Creative intents
    this.intentClassifier.addDocument('i want to create', 'creative');
    this.intentClassifier.addDocument('help me design', 'creative');
    this.intentClassifier.addDocument('i need ideas for', 'creative');
    this.intentClassifier.addDocument('brainstorm with me', 'creative');
    this.intentClassifier.addDocument('help me write', 'creative');
    this.intentClassifier.addDocument('i\'m working on a project', 'creative');
    this.intentClassifier.addDocument('give me inspiration', 'creative');

    // Complaint intents
    this.intentClassifier.addDocument('problem', 'complaint');
    this.intentClassifier.addDocument('issue', 'complaint');
    this.intentClassifier.addDocument('not working', 'complaint');
    this.intentClassifier.addDocument('broken', 'complaint');
    this.intentClassifier.addDocument('doesn\'t work', 'complaint');
    this.intentClassifier.addDocument('having trouble with', 'complaint');
    this.intentClassifier.addDocument('frustrated with', 'complaint');
    this.intentClassifier.addDocument('annoyed by', 'complaint');

    // Compliment intents
    this.intentClassifier.addDocument('thank you', 'compliment');
    this.intentClassifier.addDocument('thanks', 'compliment');
    this.intentClassifier.addDocument('great', 'compliment');
    this.intentClassifier.addDocument('awesome', 'compliment');
    this.intentClassifier.addDocument('amazing', 'compliment');
    this.intentClassifier.addDocument('excellent', 'compliment');
    this.intentClassifier.addDocument('you\'re the best', 'compliment');
    this.intentClassifier.addDocument('love it', 'compliment');

    // Train the classifier
    this.intentClassifier.train();
  }

  /**
   * Load response templates for common intents
   */
  loadResponseTemplates() {
    this.responseTemplates.set('greeting', [
      'Hello! 👋 How can I help you today? I\'m here to assist with questions, provide information, or just chat!',
      'Hi there! 😊 I\'m your AI assistant and I\'m excited to help. What would you like to explore or work on together?',
      'Hey! Great to see you. I\'m ready to help with whatever you need - questions, tasks, or just conversation.',
      'Greetings! I\'m your AI companion. What would you like to learn about or discuss today?'
    ]);

    this.responseTemplates.set('farewell', [
      'Goodbye! Have a wonderful day ahead! 🌟',
      'See you later! Feel free to come back anytime if you need help.',
      'Take care! I\'ll be here when you need assistance or want to chat again.',
      'Bye! It was great chatting with you. Come back soon! 👋'
    ]);

    this.responseTemplates.set('help', [
      'I\'m here to help! I can answer questions, provide information, assist with tasks, help with problem-solving, or just be a great conversation partner. What specific area do you need help with?',
      'Absolutely! I\'m your AI assistant and I\'m ready to help. I can provide information, answer questions, help with various topics, or just chat. What would you like to work on?',
      'I\'m glad you asked! I\'m designed to help with a wide range of topics. Whether you need information, have questions, want to explore something new, or just need someone to talk to, I\'m here for you. What can I help you with today?'
    ]);

    this.responseTemplates.set('question', [
      'That\'s an interesting question! I\'d be happy to help you with that. Could you provide a bit more detail so I can give you the most accurate and helpful response?',
      'Great question! I\'m here to help. To give you the best answer, could you tell me a bit more about what you\'re looking for?',
      'I\'d love to help with that! To provide you with the most relevant information, could you share a bit more context about your question?'
    ]);

    this.responseTemplates.set('complaint', [
      'I\'m sorry to hear you\'re experiencing an issue. Let me help you resolve this problem together.',
      'I understand your frustration. Let\'s work together to find a solution and get this sorted out.',
      'I apologize for the inconvenience. Let me assist you in finding a resolution to this problem.'
    ]);

    this.responseTemplates.set('compliment', [
      'Thank you! 😊 I\'m glad I could help and I appreciate your kind words.',
      'You\'re welcome! I\'m happy to assist and I really appreciate your feedback.',
      'Thank you! It\'s my pleasure to help you. I\'m here whenever you need assistance.'
    ]);

    // Add new intent categories
    this.responseTemplates.set('information_request', [
      'I\'d be happy to provide you with that information! Let me gather the details you need.',
      'Great! I can help you with that information. Let me find the most relevant details for you.',
      'Absolutely! I\'ll get you that information right away. What specific details are you looking for?'
    ]);

    this.responseTemplates.set('task_request', [
      'I\'m ready to help you with that task! Let me understand what you need and guide you through it.',
      'Great! I can assist you with that. Let me break down what we need to do and help you accomplish it.',
      'I\'d love to help you with that task! Let me understand your requirements and provide the best assistance.'
    ]);

    this.responseTemplates.set('learning', [
      'Learning is wonderful! I\'m excited to help you explore this topic. What specific aspect would you like to dive into?',
      'That\'s a great topic to learn about! I\'m here to help you understand it better. What would you like to focus on?',
      'I love helping people learn! Let me guide you through this topic. What\'s your current level of understanding?'
    ]);

    this.responseTemplates.set('creative', [
      'Creativity is amazing! I\'d love to help you explore ideas and develop your creative project.',
      'That sounds like a wonderful creative endeavor! I\'m here to help you brainstorm and develop your ideas.',
      'I\'m excited to help with your creative project! Let\'s explore possibilities and bring your vision to life.'
    ]);
  }

  /**
   * Process a user message and generate an AI response
   */
  async processMessage(message, userId, roomId) {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = `ai_response:${message.toLowerCase().trim()}`;
      const cachedResponse = await getCache(cacheKey);
      
      if (cachedResponse) {
        return {
          ...cachedResponse,
          responseTime: Date.now() - startTime,
          cached: true
        };
      }

      // Process the message
      const intent = await this.detectIntent(message);
      const entities = await this.extractEntities(message);
      const sentiment = await this.analyzeSentiment(message);
      const context = await this.getContext(userId, roomId);
      
      // Generate response
      const response = await this.generateResponse(message, intent, entities, sentiment, context);
      
      // Update context
      await this.updateContext(userId, roomId, {
        lastIntent: intent,
        lastEntities: entities,
        conversationHistory: [...(context.conversationHistory || []), { message, intent, timestamp: new Date() }]
      });

      // Store learning data
      this.storeLearningData({
        message,
        intent,
        entities,
        sentiment,
        response,
        userId,
        timestamp: new Date()
      });

      const result = {
        response,
        intent,
        entities,
        sentiment,
        confidence: intent.confidence,
        responseTime: Date.now() - startTime,
        cached: false
      };

      // Cache the response
      await setCache(cacheKey, result, 3600); // Cache for 1 hour

      return result;

    } catch (error) {
      console.error('Error processing message:', error);
      
      // Fallback response
      return {
        response: 'I apologize, but I\'m having trouble processing your message right now. Could you please try rephrasing it?',
        intent: { name: 'fallback', confidence: 0.1 },
        entities: [],
        sentiment: 'neutral',
        confidence: 0.1,
        responseTime: Date.now() - startTime,
        cached: false
      };
    }
  }

  /**
   * Detect intent from user message
   */
  async detectIntent(message) {
    try {
      // Use trained classifier
      const classifiedIntent = this.intentClassifier.classify(message);
      const confidence = this.intentClassifier.getClassifications(message)
        .find(c => c.label === classifiedIntent)?.value || 0.5;

      // If confidence is low, try OpenAI for better understanding
      if (confidence < 0.6 && process.env.OPENAI_API_KEY) {
        try {
          const openaiResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are an intent classifier. Analyze the user message and return only the intent category. Choose from: greeting, farewell, help, question, complaint, compliment, information_request, task_request, or other.'
              },
              {
                role: 'user',
                content: message
              }
            ],
            max_tokens: 10,
            temperature: 0.1
          });

          const openaiIntent = openaiResponse.choices[0].message.content.trim().toLowerCase();
          return {
            name: openaiIntent,
            confidence: 0.8,
            source: 'openai'
          };
        } catch (openaiError) {
          console.log('OpenAI intent detection failed, using classifier result');
        }
      }

      return {
        name: classifiedIntent,
        confidence: Math.max(confidence, 0.3),
        source: 'classifier'
      };

    } catch (error) {
      console.error('Intent detection error:', error);
      return {
        name: 'unknown',
        confidence: 0.1,
        source: 'fallback'
      };
    }
  }

  /**
   * Extract named entities from message
   */
  async extractEntities(message) {
    try {
      const doc = this.entityExtractor(message);
      const entities = [];

      // Extract people
      const people = doc.people().out('array');
      people.forEach(person => {
        entities.push({
          type: 'person',
          value: person,
          confidence: 0.8
        });
      });

      // Extract places
      const places = doc.places().out('array');
      places.forEach(place => {
        entities.push({
          type: 'place',
          value: place,
          confidence: 0.8
        });
      });

      // Extract organizations
      const organizations = doc.organizations().out('array');
      organizations.forEach(org => {
        entities.push({
          type: 'organization',
          value: org,
          confidence: 0.8
        });
      });

      // Extract dates
      const dates = doc.dates().out('array');
      dates.forEach(date => {
        entities.push({
          type: 'date',
          value: date,
          confidence: 0.9
        });
      });

      // Extract numbers
      const numbers = doc.numbers().out('array');
      numbers.forEach(number => {
        entities.push({
          type: 'number',
          value: number,
          confidence: 0.9
        });
      });

      // Extract URLs
      const urls = doc.urls().out('array');
      urls.forEach(url => {
        entities.push({
          type: 'url',
          value: url,
          confidence: 0.9
        });
      });

      return entities;

    } catch (error) {
      console.error('Entity extraction error:', error);
      return [];
    }
  }

  /**
   * Analyze sentiment of the message
   */
  async analyzeSentiment(message) {
    try {
      const result = sentiment.analyze(message);
      
      // Map sentiment score to categories
      if (result.score > 2) return 'positive';
      if (result.score < -2) return 'negative';
      return 'neutral';

    } catch (error) {
      console.error('Sentiment analysis error:', error);
      return 'neutral';
    }
  }

  /**
   * Generate AI response based on intent, entities, and context
   */
  async generateResponse(message, intent, entities, sentiment, context) {
    try {
      // Check for template responses first
      const templates = this.responseTemplates.get(intent.name);
      if (templates && intent.confidence > 0.7) {
        const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
        return this.personalizeResponse(randomTemplate, sentiment, context);
      }

      // Use OpenAI for dynamic responses
      if (process.env.OPENAI_API_KEY) {
        try {
          const systemPrompt = this.buildSystemPrompt(intent, entities, sentiment, context);
          
          const openaiResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: message
              }
            ],
            max_tokens: 150,
            temperature: 0.7
          });

          const response = openaiResponse.choices[0].message.content.trim();
          return this.personalizeResponse(response, sentiment, context);

        } catch (openaiError) {
          console.log('OpenAI response generation failed, using fallback');
        }
      }

      // Fallback response generation
      return this.generateFallbackResponse(intent, sentiment);

    } catch (error) {
      console.error('Response generation error:', error);
      return 'I apologize, but I\'m having trouble generating a response right now. Could you please try again?';
    }
  }

  /**
   * Build system prompt for OpenAI
   */
  buildSystemPrompt(intent, entities, sentiment, context) {
    let prompt = `You are a helpful, friendly, and engaging AI assistant. Respond to the user's message in a natural, conversational way that feels like talking to a knowledgeable friend.`;

    if (intent.name) {
      prompt += ` The user's intent appears to be: ${intent.name}.`;
    }

    if (sentiment !== 'neutral') {
      prompt += ` The user's sentiment is ${sentiment}, so adjust your tone accordingly - be more enthusiastic for positive sentiment and more empathetic and supportive for negative sentiment.`;
    }

    if (entities.length > 0) {
      const entityList = entities.map(e => `${e.type}: ${e.value}`).join(', ');
      prompt += ` The message contains these entities: ${entityList}. Use this information to provide more relevant and specific responses.`;
    }

    if (context.conversationHistory && context.conversationHistory.length > 0) {
      prompt += ` Consider the conversation context when responding. If the user is building on previous topics, acknowledge that and provide continuity.`;
    }

    prompt += ` Keep your response concise (1-3 sentences), helpful, and engaging. Use a warm, friendly tone and occasionally add appropriate emojis to make the conversation more pleasant. Always aim to be genuinely helpful and show enthusiasm for assisting the user.`;

    return prompt;
  }

  /**
   * Personalize response based on sentiment and context
   */
  personalizeResponse(response, sentiment, context) {
    let personalized = response;

    // Adjust tone based on sentiment
    if (sentiment === 'positive') {
      // Add enthusiasm and emojis for positive sentiment
      if (!personalized.includes('😊') && !personalized.includes('👋') && !personalized.includes('🌟')) {
        personalized = personalized.replace(/\./g, '! 😊');
      }
    } else if (sentiment === 'negative') {
      // Add empathy and support for negative sentiment
      if (!personalized.includes('I understand') && !personalized.includes('I\'m here')) {
        personalized = personalized.replace(/\.$/, '. I\'m here to help you through this.');
      }
    }

    // Add context-aware elements
    if (context.userPreferences && context.userPreferences.language) {
      // Could add language-specific greetings or phrases
    }

    // Add conversation continuity
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      const recentTopics = context.conversationHistory
        .slice(-3)
        .filter(msg => msg.intent && msg.intent.name)
        .map(msg => msg.intent.name);
      
      if (recentTopics.length > 0) {
        const uniqueTopics = [...new Set(recentTopics)];
        if (uniqueTopics.length === 1) {
          // User is focused on one topic
          personalized = personalized.replace(/\.$/, `. I notice you're interested in ${uniqueTopics[0]} - I'd be happy to explore that further with you!`);
        }
      }
    }

    // Add personality and warmth
    if (!personalized.includes('😊') && !personalized.includes('👋') && !personalized.includes('🌟') && !personalized.includes('!')) {
      // Add friendly punctuation for responses that don't have emojis
      if (personalized.endsWith('.')) {
        personalized = personalized.slice(0, -1) + '! 😊';
      }
    }

    return personalized;
  }

  /**
   * Generate fallback response
   */
  generateFallbackResponse(intent, sentiment) {
    // More specific fallbacks based on intent
    if (intent && intent.name) {
      switch (intent.name) {
        case 'question':
          return 'I\'d love to help with your question! To give you the best answer, could you provide a bit more context or rephrase it in a different way?';
        
        case 'information_request':
          return 'I\'m here to help you find that information! Could you be more specific about what you\'re looking for?';
        
        case 'task_request':
          return 'I\'m ready to help you with that task! Let me understand what you need - could you break it down into smaller steps?';
        
        case 'learning':
          return 'I\'m excited to help you learn! To make this most helpful, could you tell me what you already know about this topic?';
        
        case 'creative':
          return 'I\'d love to help with your creative project! Could you share more details about what you\'re working on?';
        
        default:
          break;
      }
    }

    // Sentiment-based fallbacks
    if (sentiment === 'negative') {
      return 'I understand this might be frustrating. Let me try to help you in a different way. Could you explain what you need in simpler terms?';
    }

    // General intelligent fallbacks
    const fallbacks = [
      'I want to make sure I understand you correctly. Could you rephrase that or provide a bit more context?',
      'I\'m here to help, but I need to understand better what you\'re looking for. Could you try explaining it differently?',
      'I\'d love to assist you with that! To give you the most helpful response, could you provide a bit more detail?',
      'I\'m still learning and want to make sure I get this right. Could you help me understand what you need by explaining it another way?'
    ];

    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
   * Get conversation context for a user/room
   */
  async getContext(userId, roomId) {
    const contextKey = `context:${userId}:${roomId}`;
    const context = await getCache(contextKey);
    
    return context || {
      conversationHistory: [],
      userPreferences: {},
      lastIntent: null,
      lastEntities: []
    };
  }

  /**
   * Update conversation context
   */
  async updateContext(userId, roomId, contextData) {
    const contextKey = `context:${userId}:${roomId}`;
    const existingContext = await getContext(userId, roomId);
    
    const updatedContext = {
      ...existingContext,
      ...contextData,
      lastUpdated: new Date()
    };

    // Keep only recent conversation history (last 20 messages)
    if (updatedContext.conversationHistory && updatedContext.conversationHistory.length > 20) {
      updatedContext.conversationHistory = updatedContext.conversationHistory.slice(-20);
    }

    await setCache(contextKey, updatedContext, 86400); // Cache for 24 hours
  }

  /**
   * Store learning data for model improvement
   */
  storeLearningData(data) {
    this.learningData.push(data);
    
    // Keep only last 1000 learning examples
    if (this.learningData.length > 1000) {
      this.learningData = this.learningData.slice(-1000);
    }
  }

  /**
   * Retrain models with new data
   */
  async retrainModels() {
    try {
      // Retrain intent classifier with new examples
      this.learningData.forEach(data => {
        if (data.intent && data.intent.name) {
          this.intentClassifier.addDocument(data.message, data.intent.name);
        }
      });

      this.intentClassifier.train();
      console.log('🤖 Models retrained successfully');

      // Clear learning data after retraining
      this.learningData = [];

    } catch (error) {
      console.error('❌ Error retraining models:', error);
    }
  }

  /**
   * Get AI service statistics
   */
  getStats() {
    return {
      totalProcessed: this.learningData.length,
      intentDistribution: this.getIntentDistribution(),
      averageConfidence: this.getAverageConfidence(),
      modelStatus: {
        intentClassifier: !!this.intentClassifier,
        entityExtractor: !!this.entityExtractor,
        openai: !!process.env.OPENAI_API_KEY
      }
    };
  }

  /**
   * Get intent distribution from learning data
   */
  getIntentDistribution() {
    const distribution = {};
    this.learningData.forEach(data => {
      if (data.intent && data.intent.name) {
        distribution[data.intent.name] = (distribution[data.intent.name] || 0) + 1;
      }
    });
    return distribution;
  }

  /**
   * Get average confidence from learning data
   */
  getAverageConfidence() {
    const confidences = this.learningData
      .filter(data => data.intent && data.intent.confidence)
      .map(data => data.intent.confidence);
    
    if (confidences.length === 0) return 0;
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }
}

module.exports = new AIService();
