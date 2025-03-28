import { mcfToExchange, exchangeToMcf } from './tickerNameConverter.js'

export const fetchOHLCVData= async (ticker,kline)=>{
    kline[ticker] = {
        bybit: [],
        binance: [],
        okx: [],
        coinbase:[],
    }
    const mappings = mcfToExchange[ticker];
    try{
        if(mappings.bybit !==''){
            const bybitResponse = await fetch(`/bybit/v5/market/kline?symbol=${mappings.bybit}&interval=5&limit=300`);

            if (!bybitResponse.ok) throw new Error(`HTTP error! status: ${bybitResponse.status}`);

            const bybitJson = await bybitResponse.json();
            if (bybitJson.result && Array.isArray(bybitJson.result.list)) {
                kline[ticker].bybit = bybitJson.result.list.map(candle => ({
                    t: parseInt(candle[0]),
                    o: parseFloat(candle[1]),
                    h: parseFloat(candle[2]),
                    l: parseFloat(candle[3]),
                    c: parseFloat(candle[4]),
                    v: parseFloat(candle[5])
                })).reverse();
            } 
        }
    }catch (error) {
        console.error('Failed to fetch Bybit data:', error);
    }

    try{
        if(mappings.binance !== ''){
            const binanceResponse = await fetch(`/binance/fapi/v1/klines?symbol=${mappings.binance}&interval=5m&limit=300`);
            if (!binanceResponse.ok) throw new Error(`HTTP error! status: ${binanceResponse.status}`);

            const binanceJson = await binanceResponse.json();
            if (Array.isArray(binanceJson)) {
                kline[ticker].binance = binanceJson.map(candle => ({
                    t: parseInt(candle[0]),
                    o: parseFloat(candle[1]),
                    h: parseFloat(candle[2]),
                    l: parseFloat(candle[3]),
                    c: parseFloat(candle[4]),
                    v: parseFloat(candle[5])
                }));
            }
        }
    }
    catch (error) {
        console.error('Failed to fetch binance data:', error);
    }

    try{
        if(mappings.okx !== ''){
            const okxResponse = await fetch(`/okx/api/v5/market/candles?instId=${mappings.okx}&bar=5m&limit=300`);
            if (!okxResponse.ok) throw new Error(`HTTP error! status: ${okxResponse.status}`);

            const okxJson = await okxResponse.json();
            if (okxJson.data && Array.isArray(okxJson.data)) {
                kline[ticker].okx = okxJson.data.map(candle => ({
                    t: parseInt(candle[0]),
                    o: parseFloat(candle[1]),
                    h: parseFloat(candle[2]),
                    l: parseFloat(candle[3]),
                    c: parseFloat(candle[4]),
                    v: parseFloat(candle[5])
                })).reverse();
            } 
        }
    } catch (error) {
        console.error('Failed to fetch OKX data:', error);
    }
    try {
        if(mappings.coinbase !== ''){
            const fiveMinutes = 5 * 60 * 1000;
            const now = Date.now();
            const flooredNow = Math.floor(now / fiveMinutes) * fiveMinutes;
            const startTime = new Date(flooredNow - (300 * fiveMinutes));
            const startTimeStr = startTime.toISOString();

            const coinbasePair = mappings.coinbase;
            const endpoint = `/coinbase/api/v1/instruments/${coinbasePair}/candles?granularity=FIVE_MINUTE&start=${startTimeStr}`;

            const coinbaseResponse = await fetch(endpoint);
            if (!coinbaseResponse.ok) throw new Error(`HTTP error! status: ${coinbaseResponse.status}`);
            
            const coinbaseJson = await coinbaseResponse.json();
            if (coinbaseJson.aggregations) {
                kline[ticker].coinbase = coinbaseJson.aggregations.map(candle => ({
                    t: new Date(candle.start).getTime(),
                    o: parseFloat(candle.open),
                    h: parseFloat(candle.high),
                    l: parseFloat(candle.low),
                    c: parseFloat(candle.close),
                    v: parseFloat(candle.volume)
                }));
                kline[ticker].coinbase.sort((a, b) => a.t - b.t);
            } 
        }
    } catch (error) {
        console.error('Failed to fetch Coinbase data:', error);
    }
    // Check if we got any data
    const hasData = Object.values(kline[ticker]).some(arr => arr.length > 0);
    if (!hasData) {
        throw new Error('Failed to fetch data from any exchange');
    }
    return kline;
}
export const calculateWeightedAverage = (values, weights) => {
    if (values.length !== weights.length || values.length === 0) return null;
    const sum = weights.reduce((acc, weight, i) => acc + weight * values[i], 0);
    const weightSum = weights.reduce((acc, weight) => acc + weight, 0);
    return sum / weightSum;
};
export const calculateStdDev = (values, mean) => {
    if (values.length === 0) return 0;
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((acc, val) => acc + val, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
};

export const calculateWeightedCandles = async (ticker,klineData, isInitial = true) => {
    const exchanges = ['bybit', 'binance', 'okx', 'coinbase'];
    const tickerData =  klineData[ticker];
    
    if (!tickerData) return null;

    // Filter valid exchanges
    const validExchanges = exchanges.filter(exchange => 
        tickerData[exchange] && tickerData[exchange].length > 0
    );
    if (validExchanges.length === 0) return null;

    if (!isInitial) {
           // Get the latest timestamp from the first valid exchange
           const latestTimestamp = tickerData[validExchanges[0]][tickerData[validExchanges[0]].length - 1].t;
       
           // Collect data from exchanges that have caught up to the latest timestamp
           const exchangeData = validExchanges.map(exchange => {
               const candle = tickerData[exchange][tickerData[exchange].length - 1];
               return candle && candle.t === latestTimestamp ? { exchange, candle } : null;
           }).filter(data => data !== null);
   
           // Log which exchanges are included in this calculation
        //    console.log(`Calculating with ${exchangeData.length}/${validExchanges.length} exchanges for timestamp ${latestTimestamp}`);
   
           const volumes = exchangeData.map(data => data.candle.v);
          
           return {
                timestamp: latestTimestamp,
                weightedOpen: calculateWeightedAverage(
                    exchangeData.map(data => data.candle.o),
                    volumes
                ),
                weightedHigh: calculateWeightedAverage(
                    exchangeData.map(data => data.candle.h),
                    volumes
                ),
                weightedLow: calculateWeightedAverage(
                    exchangeData.map(data => data.candle.l),
                    volumes
                ),
                weightedClose: calculateWeightedAverage(
                    exchangeData.map(data => data.candle.c),
                    volumes
                ),
                totalVolume: volumes.reduce((a, b) => a + b, 0),
           };
    }
    else{
        // Initial calculation - process all candles
        const weightedCandles = [];
        const referenceTimeline = tickerData[validExchanges[0]].map(candle => candle.t);

        for (const timestamp of referenceTimeline) {
            const exchangeData = validExchanges.map(exchange => {
                const candle = tickerData[exchange].find(c => c.t === timestamp);
                return candle ? { exchange, candle } : null;
            }).filter(data => data !== null);

            if (exchangeData.length === validExchanges.length) {
                const volumes = exchangeData.map(data => data.candle.v);
                
                weightedCandles.push({
                    timestamp,
                    weightedOpen: calculateWeightedAverage(
                        exchangeData.map(data => data.candle.o),
                        volumes
                    ),
                    weightedHigh: calculateWeightedAverage(
                        exchangeData.map(data => data.candle.h),
                        volumes
                    ),
                    weightedLow: calculateWeightedAverage(
                        exchangeData.map(data => data.candle.l),
                        volumes
                    ),
                    weightedClose: calculateWeightedAverage(
                        exchangeData.map(data => data.candle.c),
                        volumes
                    ),
                    totalVolume: volumes.reduce((a, b) => a + b, 0)
                });
            }
        }

        return weightedCandles;
    }


}

export const calculateAnchoredVWAP = async (
    weightedCandles, 
    isInitial = true, 
    startIndex = 0,
) => {
    if (!weightedCandles || !weightedCandles.length) return null;
    
    // Track cumulative values for both VWAP and std dev
    let cumTypicalPriceVolume = 0;
    let cumVolume = 0;
    let cumSquaredDiffVolume = 0;  // For standard deviation
    const vwapPoints = [];
    
    for (let i = startIndex; i < weightedCandles.length; i++) {
        const candle = weightedCandles[i];
        const typicalPrice = (candle.weightedHigh + candle.weightedLow + candle.weightedClose) / 3;
        
        // Update cumulative values for VWAP
        cumTypicalPriceVolume += typicalPrice * candle.totalVolume;
        cumVolume += candle.totalVolume;
        const vwap = cumTypicalPriceVolume / cumVolume;
        
        // Calculate squared differences for this candle and add to cumulative
        const squaredDiff = Math.pow(typicalPrice - vwap, 2) * candle.totalVolume;
        cumSquaredDiffVolume += squaredDiff;
        
        // Calculate std dev using cumulative values
        const stdDev = Math.sqrt(cumSquaredDiffVolume / cumVolume);

        vwapPoints.push({
            timestamp: candle.timestamp,
            vwap,
            vwapPlus1Std: vwap + stdDev,
            vwapPlus2Std: vwap + (2 * stdDev),
            vwapMinus1Std: vwap - stdDev,
            vwapMinus2Std: vwap - (2 * stdDev)
        });
    }

    return isInitial ? vwapPoints : vwapPoints[vwapPoints.length - 1];
}
