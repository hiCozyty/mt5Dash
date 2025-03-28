class VWAPBandsRenderer {
    constructor(data) {
        this._data = data;
    }
    draw() { }
    drawBackground(target) {
        const points = this._data.data;
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
            ctx.beginPath();
            ctx.fillStyle = this._data.options.bandColor;
            ctx.strokeStyle = this._data.options.vwapColor;
            ctx.lineWidth = this._data.options.lineWidth;
            ctx.moveTo(points[0].x, points[0].upperBand2);
            for (const point of points) {
                ctx.lineTo(point.x, point.upperBand2);
            }
            const lastPoint = points[points.length - 1];
            ctx.lineTo(lastPoint.x, lastPoint.lowerBand2);
            for (let i = points.length - 1; i >= 0; i--) {
                ctx.lineTo(points[i].x, points[i].lowerBand2);
            }
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].vwap);
            for (const point of points) {
                ctx.lineTo(point.x, point.vwap);
            }
            ctx.stroke();
        });
    }
}
class VWAPBandsPaneView {
    constructor(source) {
        this._source = source;
        this._data = {
            data: [],
            options: this._source._options,
        };
    }
    update() {
        if (!this._source._series || !this._source._chart)
            return;
        const series = this._source._series;
        const timeScale = this._source._chart.timeScale();
        this._data.data = this._source._bandsData.map(d => {
            var _a, _b, _c, _d, _e, _f;
            return ({
                x: (_a = timeScale.timeToCoordinate(d.time)) !== null && _a !== void 0 ? _a : -100,
                vwap: (_b = series.priceToCoordinate(d.vwap)) !== null && _b !== void 0 ? _b : -100,
                upperBand1: (_c = series.priceToCoordinate(d.upperBand1)) !== null && _c !== void 0 ? _c : -100,
                upperBand2: (_d = series.priceToCoordinate(d.upperBand2)) !== null && _d !== void 0 ? _d : -100,
                lowerBand1: (_e = series.priceToCoordinate(d.lowerBand1)) !== null && _e !== void 0 ? _e : -100,
                lowerBand2: (_f = series.priceToCoordinate(d.lowerBand2)) !== null && _f !== void 0 ? _f : -100,
            });
        });
    }
    renderer() {
        return new VWAPBandsRenderer(this._data);
    }
}
const defaults = {
    vwapColor: 'rgb(255, 255, 255)',
    bandColor: 'rgba(100, 100, 100, 0.2)',
    lineWidth: 2,
};
export class VWAPBandsIndicator {
    constructor(options = {}) {
        this._seriesData = [];
        this._bandsData = [];
        this._series = null;
        this._chart = null;
        this._options = Object.assign(Object.assign({}, defaults), options);
        this._paneViews = [new VWAPBandsPaneView(this)];
    }
    paneViews() {
        return this._paneViews;
    }
    attached(params) {
        this._series = params.series;
        this._chart = params.chart;
        this.dataUpdated('full');
    }
    dataUpdated(scope) {
        if (!this._series)
            return;
        this._seriesData = this._series.data().slice();
        this.calculateBands();
        this.updatePaneViews();
    }
    updatePaneViews() {
        this._paneViews.forEach(pw => pw.update());
    }
    calculateBands() {
        const bandData = [];
        let cumulativeTypicalPrice = 0;
        let cumulativeVolume = 0;
        let sumSquaredDiff = 0;
        this._seriesData.forEach((d) => {
            const bar = d;
            if (!bar.high || !bar.low || !bar.close || !bar.volume)
                return;
            const typicalPrice = (bar.high + bar.low + bar.close) / 3;
            const volumePrice = typicalPrice * bar.volume;
            cumulativeTypicalPrice += volumePrice;
            cumulativeVolume += bar.volume;
            const vwap = cumulativeTypicalPrice / cumulativeVolume;
            sumSquaredDiff += Math.pow((typicalPrice - vwap), 2) * bar.volume;
            const stdDev = Math.sqrt(sumSquaredDiff / cumulativeVolume);
            bandData.push({
                time: bar.time,
                vwap,
                upperBand1: vwap + stdDev,
                upperBand2: vwap + 2 * stdDev,
                lowerBand1: vwap - stdDev,
                lowerBand2: vwap - 2 * stdDev,
            });
        });
        this._bandsData = bandData;
    }
    autoscaleInfo() {
        if (this._bandsData.length === 0)
            return null;
        const values = this._bandsData.flatMap(d => [
            d.upperBand2,
            d.lowerBand2
        ]);
        return {
            priceRange: {
                minValue: Math.min(...values),
                maxValue: Math.max(...values),
            },
        };
    }
}
