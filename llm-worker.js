// Web Worker for LLM inference (runs off main thread)
let engine = null;
let loadModelPromise = null;

// Initialize the engine
async function initializeEngine() {
  const { MLCEngine } = await import('https://web-llm.org/stable/webllm.js');
  engine = new MLCEngine({
    model: 'Llama-3-8B-Instruct-q4f32_1-MLC-1k',
    temperature: 0.6,
    max_tokens: 50
  });
  loadModelPromise = engine.reload('Llama-3-8B-Instruct-q4f32_1-MLC-1k');
  await loadModelPromise;
  console.log('Worker: LLM engine initialized');
  postMessage({ type: 'initialized' });
}

// Handle messages from main thread
self.addEventListener('message', async (event) => {
  const { id, prompt, planTimeout } = event.data;

  if (!engine) {
    await initializeEngine();
  }

  try {
    // Query LLM with timeout
    const response = await Promise.race([
      engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.6
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), planTimeout)
      )
    ]);

    const responseText = response.choices[0].message.content.trim();

    // Extract JSON
    let moves = [];
    try {
      const jsonMatch = responseText.match(/\{[^}]*\}/);
      if (jsonMatch) {
        const obj = JSON.parse(jsonMatch[0]);
        moves = obj.moves || obj.plan || [];
      }
    } catch (parseErr) {
      // Parsing failed, return empty moves
    }

    // Filter to valid moves
    const validMoves = Array.isArray(moves)
      ? moves.filter((m) => ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(m))
      : [];

    postMessage({
      type: 'plan-ready',
      id,
      moves: validMoves,
      response: responseText
    });
  } catch (err) {
    postMessage({
      type: 'plan-error',
      id,
      error: err.message
    });
  }
});

// Initialize on worker startup
initializeEngine().catch((err) => {
  console.error('Worker init failed:', err);
  postMessage({ type: 'init-error', error: err.message });
});
