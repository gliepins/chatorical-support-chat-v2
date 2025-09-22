"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addClientToConversation = addClientToConversation;
exports.removeClientFromConversation = removeClientFromConversation;
exports.broadcastToConversation = broadcastToConversation;
const metrics_1 = require("../telemetry/metrics");
const conversationIdToClients = new Map();
function addClientToConversation(conversationId, ws) {
    let set = conversationIdToClients.get(conversationId);
    if (!set) {
        set = new Set();
        conversationIdToClients.set(conversationId, set);
    }
    set.add(ws);
}
function removeClientFromConversation(conversationId, ws) {
    const set = conversationIdToClients.get(conversationId);
    if (!set)
        return;
    set.delete(ws);
    if (set.size === 0)
        conversationIdToClients.delete(conversationId);
}
function broadcastToConversation(conversationId, payload) {
    const set = conversationIdToClients.get(conversationId);
    if (!set)
        return;
    const data = JSON.stringify(payload);
    for (const ws of set) {
        try {
            ws.send(data);
            (0, metrics_1.incWsOutbound)(1);
        }
        catch { }
    }
}
