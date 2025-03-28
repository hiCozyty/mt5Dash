<script>
    import { onMount } from 'svelte';
    import Navigation from './components/Navigation.svelte';
    import WebSocketManager from './components/WebSocketManager.svelte';
    import ChartView from './components/views/ChartView.svelte';
    import MetricsView from './components/views/MetricsView.svelte';
    import PnLView from './components/views/PnLView.svelte';

    let activeView = $state('chart');

    

</script>

<WebSocketManager />
<main>
    {#if activeView === 'metrics'}
        <MetricsView />
    {:else if activeView === 'chart'}
        <ChartView />
    {:else if activeView === 'pnl'}
        <PnLView />
    {/if}
</main>
<Navigation bind:activeView />
