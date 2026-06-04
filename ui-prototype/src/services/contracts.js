/**
 * @typedef {Object} ServiceStatus
 * @property {string} name
 * @property {string} value
 * @property {string} tone
 */

/**
 * @typedef {Object} HomeTask
 * @property {string} title
 * @property {string} module
 * @property {string} time
 */

/**
 * @typedef {Object} HomeDashboardData
 * @property {ServiceStatus[]} serviceState
 * @property {HomeTask[]} homeTasks
 * @property {string[]} recentActivities
 * @property {Array<Object>} quickEntries
 */

/**
 * @typedef {Object} SourceConfig
 * @property {string} id
 * @property {string} label
 * @property {string} path
 * @property {boolean} configured
 * @property {"unconfigured"|"ready"|"missing"|"error"|"mock"} status
 * @property {string} message
 * @property {string|null} updatedAt
 */

/**
 * @typedef {SourceConfig} SourceHealth
 */

/**
 * @typedef {Object} ProviderStatus
 * @property {string} sourceId
 * @property {boolean} configured
 * @property {"unconfigured"|"ready"|"missing"|"error"|"mock"} status
 * @property {string} message
 * @property {string|null} updatedAt
 */

export {};
