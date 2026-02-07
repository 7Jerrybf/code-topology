/**
 * Graph module - topology graph construction and snapshot management
 * @module @topology/core/graph
 */

export {
  buildGraph,
} from './builder.js';

export {
  createSnapshot,
  loadExistingData,
  saveTopologyData,
  type HistoryOptions,
} from './snapshot.js';
