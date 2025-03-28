import { get } from 'svelte/store';
import {
    klineData, activeTicker,loadingTicker,exchangeWeightedKlineData} from './stores.js'
import {fetchOHLCVData,calculateWeightedCandles} from './vwapRelatedHelperFn.js'
export  const renderChart = async (weightedCandles, chart, chartContainer,LightweightCharts,candlestickSeries,createChart) => {
    if(chart){
        //destroy existing charf if exists
        chart.remove()
    }
    //create new chart
    chart = createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight,
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal, // Use Normal mode for free movement
        },
    })
    // Add candlestick series
    candlestickSeries = chart.addCandlestickSeries();

    // Transform data for candlestick series
    const chartData = weightedCandles.map(candle => ({
        time: candle.timestamp / 1000, // Convert to Unix timestamp
        open: candle.weightedOpen,
        high: candle.weightedHigh,
        low: candle.weightedLow,
        close: candle.weightedClose
    }));
    // Set data
    candlestickSeries.setData(chartData);

    // Fit content
    chart.timeScale().fitContent();
}
export const updateChart = async (weightedCandleObj, chart, candlestickSeries) => {
    if (!chart || !candlestickSeries) return;

    // Convert single candle object to Lightweight Charts format
    const newCandle = {
    time: weightedCandleObj.timestamp / 1000, // Convert to Unix timestamp
    open: weightedCandleObj.weightedOpen,
    high: weightedCandleObj.weightedHigh,
    low: weightedCandleObj.weightedLow,
    close: weightedCandleObj.weightedClose
    };

    // Update the last candle or add a new one
    candlestickSeries.update(newCandle);
}
export const stopVwapCalculation = (
    isPrimary = true, 
    primaryVwapInterval,
    primaryVWAPSeries,
    chart,
    secondaryVwapInterval,
    secondaryVWAPSeries
) => {
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
export const cleanupVWAPSeries = (
    chart,primaryVWAPSeries, secondaryVWAPSeries, 
) => {
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
export const handleChartClick = (param) =>{

}

export const renderAnchoredVwap = async (
    type, 
    primaryVWAPSeries,
    secondaryVWAPSeries,
    isListeningForAnchor,
    anchorType,
    chart
)  => {
    return
    // Stop any existing VWAP calculations
    stopVwapCalculation(type === 'primary');
      
      // Clean up existing series if needed
      if (type === 'primary' && primaryVWAPSeries) {
          Object.values(primaryVWAPSeries).forEach(series => {
              if (series) chart.removeSeries(series);
          });
          primaryVWAPSeries = null;
      } else if (type === 'secondary' && secondaryVWAPSeries) {
          Object.values(secondaryVWAPSeries).forEach(series => {
              if (series) chart.removeSeries(series);
          });
          secondaryVWAPSeries = null;
      }
      
    
    // Set up for chart click
    isListeningForAnchor = true;
    anchorType = type;
    
    // Subscribe to chart clicks
    chart.subscribeClick(handleChartClick);
}