/**
 * @file claudeAgent.js
 * @description Anthropic Claude API conversation layer for Kuditax.
 *              Wraps the Anthropic SDK to send the full conversation history
 *              along with the Kuditax system prompt on every call.
 *              Used for the AI_CONVERSATION state (free-form tax Q&A).
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import config from '../config.js';
import logger from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// ---------------------------------------------------------------------------
// System Prompt
// Load the Kuditax system prompt from the prompts directory.
// This is the same prompt that governs all AI interactions.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Loads the Kuditax system prompt from disk.
 * The prompt file contains the full personality, rules, and tax knowledge.
 *
 * @returns {string} The system prompt text
 */
function loadSystemPrompt() {
  try {
    const promptPath = join(__dirname, '../../prompts/kuditax_system_prompt.md');
    const raw = readFileSync(promptPath, 'utf-8');

    // Strip the markdown code fence wrapper (```...```) that wraps the actual prompt
    const match = raw.match(/```\n([\s\S]*?)\n```/);
    return match ? match[1].trim() : raw.trim();
  } catch (error) {
    logger.error('Failed to load system prompt', { detail: error.message });
    // Fallback: minimal identity prompt so the bot can still respond
    return 'You are Kuditax, a Nigerian tax assistant. Help users with their Nigerian tax questions.';
  }
}

const SYSTEM_PROMPT = loadSystemPrompt();

// ---------------------------------------------------------------------------
// Claude API Client
// ---------------------------------------------------------------------------

/**
 * @typedef {{ role: 'user' | 'assistant', content: string }} Message
 */

/**
 * Sends the full conversation history to Claude and returns the assistant's reply.
 * The Kuditax system prompt is injected on every call to maintain consistent behaviour.
 *
 * @param {Message[]} history - Full conversation history (alternating user/assistant turns)
 * @param {string} userMessage - The latest user message to append
 * @returns {Promise<string>} The assistant's reply text
 * @throws {Error} On API failure — caller should handle and send a fallback message
 *
 * @example
 * const reply = await getAgentReply(session.conversationHistory, "How do I file my taxes?");
 */
async function getAgentReply(history, userMessage) {
  // Append the latest user message to the conversation history for this call
  const messages = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  logger.info('Calling Claude API', {
    turns: messages.length,
    inputLength: userMessage.length,
  });

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: config.anthropic.maxTokens,
    system: SYSTEM_PROMPT,
    messages,
  });

  const replyText = response.content[0]?.text ?? '';

  logger.info('Claude API response received', {
    outputLength: replyText.length,
    stopReason: response.stop_reason,
  });

  return replyText;
}

/**
 * Sends a one-off message to Claude without any conversation history.
 * Useful for generating structured outputs (e.g. translating a tax summary).
 *
 * @param {string} userMessage - The message to send
 * @returns {Promise<string>} Claude's response text
 */
async function getOneShot(userMessage) {
  return getAgentReply([], userMessage);
}

export { getAgentReply, getOneShot, SYSTEM_PROMPT };
