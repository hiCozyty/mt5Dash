<script>
    let ws;
    let reconnectAttempt = $state(0);
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY = 3000;

    function connect() {
        try {
            ws = new WebSocket('wss://fedora-old.tail8a383a.ts.net:3001');
            ws.onopen = () => {
                console.log('Connected to WebSocket');
                reconnectAttempt = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleMessage(data);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };

            ws.onclose = () => {
                console.log('WebSocket connection closed');
                handleReconnect();
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                ws?.close();
            };

        } catch (error) {
            console.error('Connection error:', error);
            handleReconnect();
        }
    }

    function handleReconnect() {
        if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
            console.log(`Attempting to reconnect (${reconnectAttempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(() => {
                reconnectAttempt++;
                connect();
            }, RECONNECT_DELAY);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }

    function handleMessage(data) {
        switch (data.type) {
            case 'welcome':
                console.log('Welcome message:', data.data);
                break;
            case 'tickAndKlineData':
                // Handle tick and kline data
                break;
            case 'fullKline':
                // Handle full kline data
                break;
            case 'all_volatility':
                // Handle volatility metrics
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    }

    function sendMessage(type, data) {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, data }));
        } else {
            console.error('WebSocket is not connected');
        }
    }

    // Lifecycle management
    $effect(() => {
        connect();
        return () => {
            ws?.close();
        };
    });

    // Export these functions for other components
    export function subscribeToTickKline(symbol) {
        sendMessage('subscribe_to_tick_kline_ontick', symbol);
    }

    export function switchSymbol(symbol) {
        sendMessage('switch_symbol', symbol);
    }

    export function getHistoricalKline(params) {
        sendMessage('get_historical_kline', params);
    }

    export function requestVolatilityMetrics() {
        sendMessage('request_all_volatility_metrics');
    }
</script>