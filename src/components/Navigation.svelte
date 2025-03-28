<script>
    import { ChartBarIncreasing, ChartCandlestickIcon, List } from 'lucide-svelte';

    // Reactive variable for the active view
    let activeView = "chart-bar"; // Default active button

    // Function to set the active view
    const setActiveView = (view) => {
        activeView = view;
    };
</script>

<nav class="navigation">
    <div class="nav-container">
        <button
            class="nav-button"
            class:active={activeView === "chart-bar"}
            on:touchstart={() => setActiveView("chart-bar")}>
            
            <ChartBarIncreasing />
        </button>
        <button
            class="nav-button"
            class:active={activeView === "chart-candlestick"}
            on:touchstart={() => setActiveView("chart-candlestick")}>
            <ChartCandlestickIcon />
        </button>
        <button
            class="nav-button"
            class:active={activeView === "list"}
            on:touchstart={() => setActiveView("list")}>

            <List />
        </button>
    </div>
</nav>

<style>
    /* Navigation Bar */
    .navigation {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        width: 100%;
    }

    .nav-container {
        display: flex;
        height: 64px; /* Adjust height if needed */
    }

    .nav-button {
        flex: 1; /* Ensures all buttons take equal width */
        display: flex;
        justify-content: center;
        align-items: center;
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        color:aliceblue;
        -webkit-tap-highlight-color: transparent;
        background-color: transparent;
    }

    /* Active Button State */
    .nav-button.active {
        background-color: #342c2c; 
    }



</style>
