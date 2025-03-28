<script>
// @ts-nocheck

    import { onMount } from 'svelte';
    import { writable, derived,get } from 'svelte/store';
    import { mcfToExchange, exchangeToMcf } from './lib/tickerNameConverter.js'
    import {
        fetchOHLCVData,
        calculateWeightedCandles
    } from './lib/vwapRelatedHelperFn.js'
    import { VWAPBandsIndicator } from '../public/js/vwap-bands-indicator.js';

    // @ts-ignore
    const {createChart} = window.LightweightCharts
    
    //stores
    import {rawData,selectedPrimaryMetric,secondarySortField,sortDirection,connectionStatus,mt5KlineAndSpreadData,klineData,loadingTicker,activeTicker,exchangeWeightedKlineData,exchangeVolWeightedPrimaryVwap,exchangeVolWeightedSecondaryVwap } from './lib/stores.js'

    let chartContainer
    let chart;
    let candlestickSeries;
    let bidSeries;
    let askSeries;
    let primaryVWAPSeries;
    let secondaryVWAPSeries;
    let activeInterval = null;
    let primaryVwapInterval = null;
    let secondaryVwapInterval= null;
    let isListeningForAnchor = false;
    let anchorType = null; // 'primary' or 'secondary'

    //ws logic
    let ws = null;
    let reconnectInterval = null;

    const connectWebSocket = () => {
        if (ws) ws.close()
        ws = new WebSocket('wss://fedora-old.tail8a383a.ts.net:3001');
        connectionStatus.set('connecting')

        ws.onopen = () => {
            console.log('connected to ws')
            connectionStatus.set('connected')
            if(reconnectInterval){
                clearInterval(reconnectInterval)
                reconnectInterval = null
            }

            setInterval (()=>{
                if(ws?.readyState === WebSocket.OPEN){
                    ws.send(JSON.stringify({
                        type: 'request_all_volatility',
                        data: {}
                    }))
                }
            },1000)
        }
        ws.onmessage = (event) => {
            try{
                const message = JSON.parse(event.data)
                if(message.type === 'all_volatility'){
                    rawData.set(message.data);
                }
                else if(message.type === 'historical_candles'){
                    candlestickSeries = null
                    const ticker = message.data.symbol
                    const kline = message.data.candles.reverse()
                    const specs = message.data.specs
                    renderChart(ticker,kline,specs)
                }
                else if(message.type === 'realtime_data'){
                    const ticker = message.data.symbol
                    if(ticker !== $activeTicker){
                        return
                    }
                    const kline = message.data.candle
                    const bid = message.data.bid
                    const ask = message.data.ask
                    updateChart(ticker,kline,bid,ask)
                }
            }
            catch{}
        }
        ws.onclose = () => {
            console.log('WebSocket closed, attempting to reconnect...');
            // connectionStatus.set('reconnecting');
            // if (!reconnectInterval) {
            //     reconnectInterval = setInterval(connectWebSocket, 1000);
            // }
        }
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            connectionStatus.set('error');
        };
    }

    onMount(()=>{
        connectWebSocket();
        return () => {
            //cleanup code when app.svelte unmounts
            if (ws) ws.close();
            if (reconnectInterval) clearInterval(reconnectInterval);
        }
    })

    //metric related fn
    const filteredData = derived([rawData, selectedPrimaryMetric, secondarySortField, sortDirection],
        ([$rawData, $primaryMetric, $sortField, $direction]) => {
            let sorted = [...$rawData].sort((a, b) => b[$primaryMetric] - a[$primaryMetric]);
            let top20 = sorted.slice(0, 20);
            
            if ($sortField && $direction) {
                top20.sort((a, b) => {
                const modifier = $direction === 'asc' ? 1 : -1;
                return (a[$sortField] - b[$sortField]) * modifier;
                });
            }
            
            return top20;
        }
    );
    
    const handleSort = (field) => {
        secondarySortField.update(currentField => {
        if (currentField === field) {
            sortDirection.update(currentDirection => {
            if (currentDirection === 'desc') return 'asc';
            if (currentDirection === 'asc') {
                secondarySortField.set(null);
                return null;
            }
            });
            return field;
        }
        sortDirection.set('desc');
        return field;
        });
    }        

    //chart related fn:
    const renderChart = (ticker,mt5Kline,specs) => {
        if(chart){
            //destroy existing charf if exists
            chart.remove()
        }
        //create new chart
        console.log('precision: ', ticker, specs.digits, Math.pow(10, -specs.digits))
        chart = createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight,
            layout: {
                background: { color: '#222' },
                textColor: '#DDD',
            },
            grid: {
                vertLines: { color: '#444' },
                horzLines: { color: '#444' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal, // Use Normal mode for free movement
            }
        })
        // Add candlestick series
        candlestickSeries = chart.addCandlestickSeries({
            priceFormat: {
                type: 'price',
                precision: specs.digits, // use the digits from specs (4 in this case)
                minMove: Math.pow(10, -specs.digits), // for digits=4, this gives 0.0001
            },
        });

        bidSeries = chart.addLineSeries({
            color: '#26a69a',
            lineWidth:1,
            title: 'bid'
        })
        askSeries = chart.addLineSeries({
            color:'#ef5350',
            lineWidth: 1,
            title: 'ask'
        })

        const lastMt5Kline = mt5Kline[mt5Kline.length-1]
        bidSeries.setData({
            time: lastMt5Kline.timestamp / 1000,
            value: lastMt5Kline.close
        });
        askSeries.setData({
            time: lastMt5Kline.timestamp / 1000,
            value:lastMt5Kline.close,
        })


        // Transform data for candlestick series
        const chartData = mt5Kline.map(candle => ({
            time: candle.timestamp / 1000, // Convert to Unix timestamp
            open: candle.weightedOpen,
            high: candle.weightedHigh,
            low: candle.weightedLow,
            close: candle.weightedClose
        }));
        // Set data
        candlestickSeries.setData(mt5Kline);

        // Fit content
        chart.timeScale().fitContent();
    }
    const updateChart = async (ticker,kline,bid,ask) => {
        if (!chart || !candlestickSeries) return;

        // Update the last candle or add a new one
        candlestickSeries.update(kline);

        bidSeries.update({
            time: kline.timestamp / 1000,
            value: bid
        });
        askSeries.update({
            time: kline.timestamp / 1000,
            value:ask
        })

    }
    const stopVwapCalculation = (isPrimary = true) => {
        if (isPrimary) {
            if (primaryVwapInterval) {
                clearInterval(primaryVwapInterval);
                primaryVwapInterval = null;
            }
            if (primaryVWAPSeries) {
                Object.values(primaryVWAPSeries).forEach(series => {
                    if (series) chart.removeSeries(series);
                });
                primaryVWAPSeries = null;
            }
        } else {
            if (secondaryVwapInterval) {
                clearInterval(secondaryVwapInterval);
                secondaryVwapInterval = null;
            }
            if (secondaryVWAPSeries) {
                Object.values(secondaryVWAPSeries).forEach(series => {
                    if (series) chart.removeSeries(series);
                });
                secondaryVWAPSeries = null;
            }
        }
    }
    const cleanupVWAPSeries = () => {
        // Clean up primary VWAP series
        if (primaryVWAPSeries) {
            if (primaryVWAPSeries.vwap) {
                chart.removeSeries(primaryVWAPSeries.vwap);
            }
            if (primaryVWAPSeries.plus1Std) {
                chart.removeSeries(primaryVWAPSeries.plus1Std);
            }
            if (primaryVWAPSeries.plus2Std) {
                chart.removeSeries(primaryVWAPSeries.plus2Std);
            }
            if (primaryVWAPSeries.minus1Std) {
                chart.removeSeries(primaryVWAPSeries.minus1Std);
            }
            if (primaryVWAPSeries.minus2Std) {
                chart.removeSeries(primaryVWAPSeries.minus2Std);
            }
            primaryVWAPSeries = null;
        }

        // Clean up secondary VWAP series
        if (secondaryVWAPSeries) {
            if (secondaryVWAPSeries.vwap) {
                chart.removeSeries(secondaryVWAPSeries.vwap);
            }
            if (secondaryVWAPSeries.plus1Std) {
                chart.removeSeries(secondaryVWAPSeries.plus1Std);
            }
            if (secondaryVWAPSeries.plus2Std) {
                chart.removeSeries(secondaryVWAPSeries.plus2Std);
            }
            if (secondaryVWAPSeries.minus1Std) {
                chart.removeSeries(secondaryVWAPSeries.minus1Std);
            }
            if (secondaryVWAPSeries.minus2Std) {
                chart.removeSeries(secondaryVWAPSeries.minus2Std);
            }
            secondaryVWAPSeries = null;
        }
    } 
    async function handleChartClick(param) {
        if (!isListeningForAnchor || !param.time) return;
        
        // Convert timestamp back to index
        const chartData = candlestickSeries.data();
        const anchorIndex = chartData.findIndex(item => item.time === param.time);
        
        if (anchorIndex === -1) {
            console.error('Could not find matching timestamp');
            return;
        }

        const ticker = $activeTicker;
        if (!ticker) return;
            // Get weighted candles data from store
            const store = get(exchangeWeightedKlineData);
            const weightedCandles = store[ticker];

            console.log('Chart click debug:', {
                ticker,
                anchorIndex,
                hasWeightedCandles: !!weightedCandles,
                weightedCandlesLength: weightedCandles?.length
            });

            // Calculate initial VWAP from anchor point
            const initialVwap = await calculateAnchoredVWAP(
                ticker,
                weightedCandles,
                true,
                anchorIndex
            );

            if (!initialVwap) {
                console.error('Failed to calculate initial VWAP');
                return;
            }

        // Update appropriate store based on anchor type
        if (anchorType === 'primary') {
            exchangeVolWeightedPrimaryVwap.set({
            [ticker]: initialVwap
            });
            
            // Create series for VWAP and bands if they don't exist
            if (!primaryVWAPSeries) {
            primaryVWAPSeries = {
                vwap: chart.addLineSeries({
                color: 'rgba(255, 192, 0, 0.8)',
                lineWidth: 2,
                title: 'VWAP'
                }),
                plus1Std: chart.addLineSeries({
                color: 'rgba(255, 192, 0, 0.4)',
                lineWidth: 1,
                title: '+1σ'
                }),
                plus2Std: chart.addLineSeries({
                color: 'rgba(255, 192, 0, 0.3)',
                lineWidth: 1,
                title: '+2σ'
                }),
                minus1Std: chart.addLineSeries({
                color: 'rgba(255, 192, 0, 0.4)',
                lineWidth: 1,
                title: '-1σ'
                }),
                minus2Std: chart.addLineSeries({
                color: 'rgba(255, 192, 0, 0.3)',
                lineWidth: 1,
                title: '-2σ'
                })
            };
            }

            // Set initial data for all lines
            const vwapData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwap
            }));
            const plus1StdData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwapPlus1Std
            }));
            const plus2StdData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwapPlus2Std
            }));
            const minus1StdData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwapMinus1Std
            }));
            const minus2StdData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwapMinus2Std
            }));

            primaryVWAPSeries.vwap.setData(vwapData);
            primaryVWAPSeries.plus1Std.setData(plus1StdData);
            primaryVWAPSeries.plus2Std.setData(plus2StdData);
            primaryVWAPSeries.minus1Std.setData(minus1StdData);
            primaryVWAPSeries.minus2Std.setData(minus2StdData);

            // Set up interval for updates
            primaryVwapInterval = setInterval(async () => {
            const latestKlineData = get(klineData);
            const updatedVwap = await calculateAnchoredVWAP(
                ticker,
                latestKlineData,
                false
            );
            console.log('updatedVwap', Boolean(updatedVwap))
            if (updatedVwap) {
                exchangeVolWeightedPrimaryVwap.update(data => ({
                    ...data,
                    [ticker]: [...(data[ticker] || []), updatedVwap]
                }));

                // Need to update each series individually
                if (primaryVWAPSeries) {
                    const timePoint = updatedVwap.timestamp / 1000;

                    primaryVWAPSeries.vwap.update({
                        time: timePoint,
                        value: updatedVwap.vwap
                    });

                    primaryVWAPSeries.plus1Std.update({
                        time: timePoint,
                        value: updatedVwap.vwapPlus1Std
                    });

                    primaryVWAPSeries.plus2Std.update({
                        time: timePoint,
                        value: updatedVwap.vwapPlus2Std
                    });

                    primaryVWAPSeries.minus1Std.update({
                        time: timePoint,
                        value: updatedVwap.vwapMinus1Std
                    });

                    primaryVWAPSeries.minus2Std.update({
                        time: timePoint,
                        value: updatedVwap.vwapMinus2Std
                    });
                }
            }
        }, 1000);
        } else {
            // Similar logic for secondary VWAP
            exchangeVolWeightedSecondaryVwap.set({
            [ticker]: initialVwap
            });
            
            if (!secondaryVWAPSeries) {
            secondaryVWAPSeries = {
                vwap: chart.addLineSeries({
                color: 'rgba(0, 192, 255, 0.8)',
                lineWidth: 2,
                title: 'VWAP2'
                }),
                plus1Std: chart.addLineSeries({
                color: 'rgba(0, 192, 255, 0.4)',
                lineWidth: 1,
                title: '+1σ'
                }),
                plus2Std: chart.addLineSeries({
                color: 'rgba(0, 192, 255, 0.3)',
                lineWidth: 1,
                title: '+2σ'
                }),
                minus1Std: chart.addLineSeries({
                color: 'rgba(0, 192, 255, 0.4)',
                lineWidth: 1,
                title: '-1σ'
                }),
                minus2Std: chart.addLineSeries({
                color: 'rgba(0, 192, 255, 0.3)',
                lineWidth: 1,
                title: '-2σ'
                })
            };
            }

            // Set initial data for all lines
            const vwapData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwap
            }));
            const plus1StdData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwapPlus1Std
            }));
            const plus2StdData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwapPlus2Std
            }));
            const minus1StdData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwapMinus1Std
            }));
            const minus2StdData = initialVwap.map(point => ({
            time: point.timestamp / 1000,
            value: point.vwapMinus2Std
            }));

            secondaryVWAPSeries.vwap.setData(vwapData);
            secondaryVWAPSeries.plus1Std.setData(plus1StdData);
            secondaryVWAPSeries.plus2Std.setData(plus2StdData);
            secondaryVWAPSeries.minus1Std.setData(minus1StdData);
            secondaryVWAPSeries.minus2Std.setData(minus2StdData);

            secondaryVwapInterval = setInterval(async () => {
                const latestKlineData = get(klineData);
                const updatedVwap = await calculateAnchoredVWAP(
                    ticker,
                    latestKlineData,
                    false
                );
                if (updatedVwap) {
                    exchangeVolWeightedSecondaryVwap.update(data => ({
                        ...data,
                        [ticker]: [...(data[ticker] || []), updatedVwap]
                    }));

                    // Update each series individually
                    if (secondaryVWAPSeries) {
                        const timePoint = updatedVwap.timestamp / 1000;

                        secondaryVWAPSeries.vwap.update({
                            time: timePoint,
                            value: updatedVwap.vwap
                        });

                        secondaryVWAPSeries.plus1Std.update({
                            time: timePoint,
                            value: updatedVwap.vwapPlus1Std
                        });

                        secondaryVWAPSeries.plus2Std.update({
                            time: timePoint,
                            value: updatedVwap.vwapPlus2Std
                        });

                        secondaryVWAPSeries.minus1Std.update({
                            time: timePoint,
                            value: updatedVwap.vwapMinus1Std
                        });

                        secondaryVWAPSeries.minus2Std.update({
                            time: timePoint,
                            value: updatedVwap.vwapMinus2Std
                        });
                    }
                }
            }, 1000);
        }

        // Reset anchor mode
        isListeningForAnchor = false;
        anchorType = null;
        chart.unsubscribeClick(handleChartClick);
    }
    const handleRowClick = async (
        ticker
    ) => {
        // Clear existing interval if any
        if (activeInterval) {
            clearInterval(activeInterval);
            activeInterval = null;
        }
        if (primaryVwapInterval) {
            clearInterval(primaryVwapInterval);
            primaryVwapInterval = null;
        }
        if (secondaryVwapInterval) {
            clearInterval(secondaryVwapInterval);
            secondaryVwapInterval = null;
        }
        // Clean up VWAP series
        cleanupVWAPSeries();

        // If clicking the same ticker again, just clean up and return
        if (get(activeTicker) === ticker) {
            loadingTicker.set(null);
            activeTicker.set(null);
            return;
        }
        // Set new active ticker
        activeTicker.set(ticker);
        loadingTicker.set(ticker);
        console.log('setting active ticker to:',ticker)

        // fetch new candle data
        async function fetchData() {
            try {
                const kline = {};
                await fetchOHLCVData(ticker, kline);
                klineData.update(data => ({
                    ...data,
                    [ticker]: kline[ticker]
                }));
                return kline
            } catch (error) {
                console.error(`Failed to fetch OHLCV data for ${ticker}:`, error);
            }
        }
        // Fetch immediately then on interval and calculate weighted candles for subsequent user initiated dynamic aVwap
        try {
            const initialKline = await fetchData();
            const weightedCandles = await calculateWeightedCandles(ticker, initialKline, true);
            
            // renderChart(weightedCandles)
            //instead of rendering chart from cex candle, 1 time request the historical kline from mt5
            ws.send(JSON.stringify({
                type: 'request_data_from_mt5',
                data: {
                    ticker:ticker,
                }
            }))

            exchangeWeightedKlineData.update(data => ({
                ...data,
                [ticker]: weightedCandles
            }));
            // console.log(weighkstedCandles)
            // Set up interval for subsequent fetches
            activeInterval = setInterval(async () => {
                try {
                    const updatedKline = await fetchData();
                    const updatedWeightedCandle = await calculateWeightedCandles(ticker, updatedKline, false);
                    
                    if (updatedWeightedCandle) {
                        exchangeWeightedKlineData.update(data => {
                            const currentCandles = data[ticker] || [];
                            
                            // If the timestamp matches the last candle, update it
                            // Otherwise, append the new candle
                            if (currentCandles.length > 0 && 
                                // @ts-ignore
                                currentCandles[currentCandles.length - 1].timestamp === updatedWeightedCandle.timestamp) {
                                return {
                                    ...data,
                                    [ticker]: [
                                        ...currentCandles.slice(0, -1),
                                        updatedWeightedCandle
                                    ]
                                };
                            } else {
                                return {
                                    ...data,
                                    [ticker]: [...currentCandles, updatedWeightedCandle]
                                };
                            }
                        });
                    }

                    // updateChart(updatedWeightedCandle)

                } catch (error) {
                    console.error('Error in interval update:', error);
                }
            }, 1000);
        } catch (error) {
            console.error('Error in initial fetch:', error);
            loadingTicker.set(null);
        }
    }

</script>
<main class="layout-container">
    <div class="table-section">
    <header>
        <h1>Volatility Tracker</h1>
        <div class="controls">
        <select 
            bind:value={$selectedPrimaryMetric}
            class="primary-filter"
        >
            <option value="vol">Volatility</option>
            <option value="atr">ATR</option>
            <option value="spreadSpeed">Spread Speed</option>
        </select>
        <div class="status {$connectionStatus}">
            {$connectionStatus}
        </div>
        </div>
    </header>
    <div class="table-container">
        <table>
        <thead>
            <tr>
            <th>Ticker</th>
            <th 
                on:click={() => handleSort('vol')}
                class:sorted={$secondarySortField === 'vol'}
                class:asc={$secondarySortField === 'vol' && $sortDirection === 'asc'}
            >
                Volatility {$secondarySortField === 'vol' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th 
                on:click={() => handleSort('atr')}
                class:sorted={$secondarySortField === 'atr'}
                class:asc={$secondarySortField === 'atr' && $sortDirection === 'asc'}
            >
                ATR {$secondarySortField === 'atr' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th 
                on:click={() => handleSort('amp')}
                class:sorted={$secondarySortField === 'amp'}
                class:asc={$secondarySortField === 'amp' && $sortDirection === 'asc'}
            >
                Amplitude {$secondarySortField === 'amp' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th 
                on:click={() => handleSort('spread')}
                class:sorted={$secondarySortField === 'spread'}
                class:asc={$secondarySortField === 'spread' && $sortDirection === 'asc'}
            >
                Spread {$secondarySortField === 'spread' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th 
                on:click={() => handleSort('spreadSpeed')}
                class:sorted={$secondarySortField === 'spreadSpeed'}
                class:asc={$secondarySortField === 'spreadSpeed' && $sortDirection === 'asc'}
            >
                Spread Speed {$secondarySortField === 'spreadSpeed' ? ($sortDirection === 'asc' ? '↑' : '↓') : ''}
            </th>
            </tr>
        </thead>
        <tbody>
            {#each $filteredData as item}
            <tr
            on:click={() => handleRowClick(
                item.ticker,
            )}
            class:loading={$loadingTicker === item.ticker}
            class:has-data={$klineData[item.ticker]}
            class="clickable-row"
            >
            <td>{item.ticker}</td>
            <td class:high-vol={item.vol > 70} class:low-vol={item.vol < 30}>
                {item.vol.toFixed(2)}
            </td>
            <td>{item.atr.toFixed(2)}</td>
            <td>{item.amp.toFixed(2)}</td>
            <td>{item.spread.toFixed(2)}</td>
            <td>{item.spreadSpeed.toFixed(2)}</td>
            </tr>
            {:else}
            <tr>
            <td colspan="6" class="no-data">Waiting for data...</td>
            </tr>
            {/each}
        </tbody>
        </table>
    </div>
    </div>
    <div class="chart-section">
    <div class="chart-container">
        {#if $activeTicker}
        <div class="chart-controls">
            <button 
            on:click={() => renderAnchoredVwap(
                'primary',
                primaryVWAPSeries,
                secondaryVWAPSeries,
                isListeningForAnchor,
                anchorType,
                chart
            )}
            disabled={!$activeTicker}
            >
            pVWAP
            </button>
            <button 
            on:click={() => renderAnchoredVwap(
                'secondary',
                primaryVWAPSeries,
                secondaryVWAPSeries,
                isListeningForAnchor,
                anchorType,
                chart
            )}
            disabled={!$activeTicker}
            >
            sVWAP
        </button>
        </div>
        <div bind:this={chartContainer} class="chart-placeholder">
        </div>
        {:else}
        <div class="chart-placeholder">
            Select a ticker to view chart
        </div>
        {/if}
    </div>
    </div>
  </main>

  <style>
        :global(body) {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
            Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        background: #f5f5f5;
        -webkit-tap-highlight-color: transparent;
        }
        .layout-container {
        display:flex;
        gap: 2rem;
        padding: 1rem;
        max-width: 100%;
        min-height: 100vh;
        justify-content: flex-start; /* Aligns items to the start */
    }

    .table-section {
        flex: 0 0 auto; /* Don't grow, don't shrink, use auto basis */
        width: 40%; /* Reduce from 50% to give more space to chart */
        min-width: 500px;
    }

    .chart-section {
        flex: 1 1 auto; /* Can grow, can shrink, auto basis */
        position: relative;
        min-height: 400px;
        min-width:800px;
        margin-right: 1rem; /* Add some margin from the right edge */
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .chart-container {
    position: sticky;
    top: 1rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    padding: 1rem;
    height: calc(100vh - 2rem);
    width: 100%; /* Ensure it takes full width of parent */
    }
    .chart-placeholder {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
    }
    .clickable-row {
    cursor: pointer;
    transition: background-color 0.2s ease;
    }

    .clickable-row:hover {
    background-color: #f0f0f0;
    }

    .clickable-row.loading {
    opacity: 0.7;
    pointer-events: none;
    background-color: #f5f5f5;
    }

    .clickable-row.has-data {
    border-left: 3px solid #4CAF50;
    }
    .container {
    padding: 1rem;
    max-width: 100%;
    min-height: 100vh;
    }

    header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    }

    h1 {
    font-size: 1.5rem;
    margin: 0;
    }

    .controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    }

    .primary-filter {
    padding: 0.5rem;
    border-radius: 0.5rem;
    border: 1px solid #ddd;
    background: white;
    }

    .status {
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.875rem;
    text-transform: capitalize;
    }

    .status.connected {
    background: #e1ffe1;
    color: #008000;
    }

    .status.connecting, .status.reconnecting {
    background: #fff3e1;
    color: #cc8800;
    }

    .status.error, .status.disconnected {
    background: #ffe1e1;
    color: #cc0000;
    }

    .table-container {
    overflow-x: auto;
    margin-top: 1rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    table {
    width: 100%;
    border-collapse: collapse;
    }

    th {
    padding: 1rem;
    text-align: left;
    background: #f5f5f5;
    cursor: pointer;
    user-select: none;
    position: sticky;
    top: 0;
    z-index: 1;
    }

    th:hover {
    background: #eee;
    }

    th.sorted {
    background: #e0e0e0;
    }

    td {
    padding: 1rem;
    border-top: 1px solid #eee;
    }

    tr:hover td {
    background: #f9f9f9;
    }

    .high-vol {
    color: #cc0000;
    font-weight: bold;
    }

    .low-vol {
    color: #008000;
    font-weight: bold;
    }

    .no-data {
    text-align: center;
    color: #666;
    padding: 2rem;
    }

    @supports (-webkit-touch-callout: none) {
    .container {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
    }
    }
</style>