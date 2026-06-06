import { buildKnowledgeSearchResult } from "../shared/knowledgeContracts.js";
import { limitKnowledgeIndexText, normalizeKnowledgeIndex } from "./knowledgeIndexStore.js";

const DEFAULT_MAX_RESULT_ITEMS = 8;
const DEFAULT_MAX_RESULT_CHARS = 900;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function finiteVector(value = []) {
  return (Array.isArray(value) ? value : [])
    .map((item) => Number(item))
    .filter(Number.isFinite);
}

function normalizeQuery(value) {
  return cleanString(value).toLowerCase();
}

function uniqueValues(values = []) {
  return [...new Set(values.map(cleanString).filter(Boolean))];
}

function tokenizeQuery(query = "") {
  const normalized = normalizeQuery(query);
  const asciiWords = normalized
    .match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  const cjkText = (normalized.match(/[\u3400-\u9fff]+/g) ?? []).join("");
  const cjkFragments = [];

  for (let index = 0; index < cjkText.length - 1; index += 1) {
    cjkFragments.push(cjkText.slice(index, index + 2));
  }
  for (let index = 0; index < cjkText.length - 2; index += 1) {
    cjkFragments.push(cjkText.slice(index, index + 3));
  }

  return uniqueValues([
    normalized,
    ...asciiWords,
    ...cjkFragments,
  ]).filter((token) => token.length >= 2);
}

function fieldScore(value = "", tokens = [], weight = 1, exactQuery = "") {
  const text = cleanString(value).toLowerCase();
  if (!text) {
    return 0;
  }

  let score = exactQuery && text.includes(exactQuery) ? weight * 4 : 0;
  for (const token of tokens) {
    if (token !== exactQuery && text.includes(token)) {
      score += weight;
    }
  }

  return score;
}

function scoreChunk(chunk = {}, document = {}, query = "", queryTokens = tokenizeQuery(query)) {
  const title = cleanString(chunk.title || document.title).toLowerCase();
  const relativePath = cleanString(chunk.relativePath || document.relativePath).toLowerCase();
  const preview = cleanString(chunk.preview).toLowerCase();
  const exactQuery = normalizeQuery(query);

  return (
    fieldScore(title, queryTokens, 4, exactQuery) +
    fieldScore(relativePath, queryTokens, 2, exactQuery) +
    fieldScore(preview, queryTokens, 1, exactQuery)
  );
}

function buildDocumentLookup(documents = []) {
  return new Map(documents.map((document) => [document.id, document]));
}

function buildVectorLookup(vectorsInput = []) {
  const vectors = Array.isArray(vectorsInput)
    ? vectorsInput
    : Array.isArray(vectorsInput?.vectors)
      ? vectorsInput.vectors
      : [];

  return new Map(vectors.map((vector) => [
    cleanString(vector.chunkId ?? vector.id),
    finiteVector(vector.embedding),
  ]).filter(([chunkId, embedding]) => chunkId && embedding.length > 0));
}

function cosineSimilarity(left = [], right = []) {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return Math.max(0, dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

function buildMatchMode(matches = [], semanticReady = false) {
  if (matches.some((item) => item.matchType === "hybrid")) {
    return "hybrid";
  }
  if (semanticReady && matches.length > 0 && matches.every((item) => item.matchType === "semantic")) {
    return "semantic";
  }
  return "keyword";
}

export function searchKnowledgeIndex(indexInput = {}, options = {}) {
  const query = cleanString(options.query);
  const normalizedQuery = normalizeQuery(query);
  const maxResultItems = Math.max(1, numberValue(options.maxResultItems ?? options.limit, DEFAULT_MAX_RESULT_ITEMS));
  const maxResultChars = Math.max(80, numberValue(options.maxResultChars, DEFAULT_MAX_RESULT_CHARS));
  const index = normalizeKnowledgeIndex(indexInput);
  const queryEmbedding = finiteVector(options.queryEmbedding);
  const vectorsByChunkId = buildVectorLookup(options.vectors);
  const semanticReady = queryEmbedding.length > 0 && vectorsByChunkId.size > 0 && options.semanticStatus !== "unavailable";
  const semanticStatus = cleanString(options.semanticStatus) || (semanticReady ? "ready" : "unavailable");

  if (!query || index.status === "missing" || index.chunks.length === 0) {
    return {
      query,
      results: [],
      source: "knowledge-index",
      status: "unindexed",
      total: 0,
    };
  }

  const documentsById = buildDocumentLookup(index.documents);
  const queryTokens = tokenizeQuery(normalizedQuery);
  const matches = index.chunks
    .map((chunk) => {
      const document = documentsById.get(chunk.documentId) ?? {};
      const keywordScore = scoreChunk(chunk, document, normalizedQuery, queryTokens);
      const vectorScore = semanticReady
        ? cosineSimilarity(queryEmbedding, vectorsByChunkId.get(chunk.chunkId))
        : 0;
      const matchType = keywordScore > 0 && vectorScore > 0
        ? "hybrid"
        : vectorScore > 0
          ? "semantic"
          : "keyword";
      const score = keywordScore + (vectorScore > 0 ? vectorScore * 4 : 0);

      return { chunk, document, keywordScore, matchType, score, vectorScore };
    })
    .filter((item) => item.keywordScore > 0 || item.vectorScore > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.chunk.relativePath.localeCompare(right.chunk.relativePath) || left.chunk.ordinal - right.chunk.ordinal;
    });

  const results = matches.slice(0, maxResultItems).map(({ chunk, document, keywordScore, matchType, score, vectorScore }) => ({
    ...buildKnowledgeSearchResult({
      excerpt: limitKnowledgeIndexText(chunk.preview, maxResultChars),
      id: chunk.chunkId,
      query,
      relativePath: chunk.relativePath || document.relativePath,
      score,
      source: "knowledge-index",
      status: document.status || "indexed",
      title: chunk.title || document.title,
      type: document.type || "chunk",
      updatedAt: chunk.updatedAt || document.updatedAt,
    }),
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    keywordScore,
    matchType,
    preview: limitKnowledgeIndexText(chunk.preview, maxResultChars),
    titlePath: Array.isArray(chunk.titlePath) ? chunk.titlePath : [],
    vectorScore,
  }));

  return {
    matchMode: buildMatchMode(matches, semanticReady),
    query,
    results,
    semanticStatus,
    source: "knowledge-index",
    status: index.status === "error" ? "error" : "ready",
    total: matches.length,
    updatedAt: index.updatedAt,
  };
}
