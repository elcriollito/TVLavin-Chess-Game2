/* Fairy-Stockfish UCI Worker wrapper */
let engine = null;
let engineReady = false;
const queue = [];

importScripts('stockfish.js');

function flushQueue() {
    while (queue.length > 0 && engine) {
        const cmd = queue.shift();
        engine.postMessage(cmd);
    }
}

function initEngine() {
    if (engine) return;
    try {
        const result = Stockfish();
        if (result && typeof result.then === 'function') {
            result.then((sf) => {
                engine = sf;
                engineReady = true;
                if (engine.addMessageListener) {
                    engine.addMessageListener((line) => {
                        if (line !== undefined) {
                            postMessage(String(line));
                        }
                    });
                }
                flushQueue();
            }).catch((err) => {
                postMessage('error ' + (err?.message || String(err)));
            });
        } else {
            engine = result;
            engineReady = true;
            if (engine.addMessageListener) {
                engine.addMessageListener((line) => {
                    if (line !== undefined) {
                        postMessage(String(line));
                    }
                });
            }
            flushQueue();
        }
    } catch (err) {
        postMessage('error ' + (err?.message || String(err)));
    }
}

self.onmessage = (e) => {
    const cmd = e.data;
    if (!engineReady) {
        queue.push(cmd);
        initEngine();
        return;
    }
    if (!engine) return;
    engine.postMessage(cmd);
};

initEngine();
