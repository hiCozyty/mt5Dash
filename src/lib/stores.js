import { writable } from 'svelte/store';

// Existing stores
export const rawData = writable([]);
export const selectedPrimaryMetric = writable('vol');
export const secondarySortField = writable(null);
export const sortDirection = writable(null);
export const connectionStatus = writable('disconnected');
// New store for kline data
export const mt5KlineAndSpreadData = writable({})
export const klineData = writable({});
export const exchangeWeightedKlineData = writable({})
export const exchangeVolWeightedPrimaryVwap = writable({});
export const exchangeVolWeightedSecondaryVwap = writable({})

export const loadingTicker = writable(null);
export const activeTicker = writable(null);
